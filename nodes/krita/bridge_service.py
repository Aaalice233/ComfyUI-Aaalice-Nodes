"""Read-only Bridge status plus explicit user-triggered installation and repair."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .._lib.krita_snapshot import PROTOCOL_VERSION
from .bridge_client import bridge_root

BRIDGE_ID = "aaalice_comfy_bridge"
BRIDGE_VERSION = "1.1.0"
STATUS_MAX_AGE = 3.0


def bundle_root() -> Path:
    return Path(__file__).resolve().parent / "bridge_bundle"


def krita_plugin_root() -> Path:
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise RuntimeError("APPDATA is unavailable; cannot locate Krita's Python plugin directory")
        return Path(appdata) / "krita" / "pykrita"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "krita" / "pykrita"
    return Path.home() / ".local" / "share" / "krita" / "pykrita"


def krita_config_path() -> Path:
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if not local_appdata:
            raise RuntimeError("LOCALAPPDATA is unavailable; cannot locate Krita's configuration")
        return Path(local_appdata) / "kritarc"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Preferences" / "kritarc"
    config_home = os.environ.get("XDG_CONFIG_HOME")
    return Path(config_home) / "kritarc" if config_home else Path.home() / ".config" / "kritarc"


def installed_paths() -> tuple[Path, Path]:
    root = krita_plugin_root()
    return root / f"{BRIDGE_ID}.desktop", root / BRIDGE_ID


def _read_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def installed_version() -> str | None:
    desktop, package = installed_paths()
    version_file = package / "VERSION"
    if not desktop.is_file() or not version_file.is_file():
        return None
    try:
        value = version_file.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def _krita_is_running() -> bool:
    if sys.platform == "win32":
        completed = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq krita.exe", "/FO", "CSV", "/NH"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if completed.returncode != 0:
            raise RuntimeError("could not determine whether Krita is running")
        return any(line.lstrip().lower().startswith('"krita.exe"') for line in completed.stdout.splitlines())

    completed = subprocess.run(
        ["pgrep", "-x", "krita"],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode not in (0, 1):
        raise RuntimeError("could not determine whether Krita is running")
    return completed.returncode == 0


def _plugin_enabled(path: Path | None = None) -> bool:
    config = path or krita_config_path()
    try:
        text = config.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        return False
    except OSError as exc:
        raise RuntimeError(f"could not read Krita configuration: {config}") from exc

    in_python = False
    key = f"enable_{BRIDGE_ID}"
    for line in text.splitlines():
        section = re.match(r"^\s*\[([^]]+)]\s*$", line)
        if section:
            in_python = section.group(1).strip().casefold() == "python"
            continue
        if not in_python:
            continue
        entry = re.match(r"^\s*([^=]+?)\s*=\s*(.*?)\s*$", line)
        if entry and entry.group(1).strip().casefold() == key.casefold():
            return entry.group(2).casefold() in {"1", "true", "yes", "on"}
    return False


def _enable_plugin(path: Path | None = None) -> None:
    config = path or krita_config_path()
    try:
        raw = config.read_bytes() if config.exists() else b""
        text = raw.decode("utf-8-sig")
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"could not read Krita configuration: {config}") from exc

    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines(keepends=True)
    key = f"enable_{BRIDGE_ID}"
    section_start = None
    section_end = len(lines)
    for index, line in enumerate(lines):
        section = re.match(r"^\s*\[([^]]+)]\s*(?:\r?\n)?$", line)
        if not section:
            continue
        if section_start is not None:
            section_end = index
            break
        if section.group(1).strip().casefold() == "python":
            section_start = index

    if section_start is not None:
        for index in range(section_start + 1, section_end):
            entry = re.match(rf"^(\s*{re.escape(key)}\s*=\s*)(.*?)(\r?\n)?$", lines[index], re.IGNORECASE)
            if entry:
                lines[index] = f"{entry.group(1)}true{entry.group(3) or ''}"
                break
        else:
            if section_end > 0 and not lines[section_end - 1].endswith(("\n", "\r")):
                lines[section_end - 1] += newline
            lines.insert(section_end, f"{key}=true{newline}")
    else:
        if lines and not lines[-1].endswith(("\n", "\r")):
            lines[-1] += newline
        if lines and lines[-1].strip():
            lines.append(newline)
        lines.extend((f"[python]{newline}", f"{key}=true{newline}"))

    encoded = "".join(lines).encode("utf-8-sig" if raw.startswith(b"\xef\xbb\xbf") else "utf-8")
    config.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".aaalice-kritarc-", dir=config.parent)
    os.close(descriptor)
    temporary_path = Path(temporary)
    try:
        temporary_path.write_bytes(encoded)
        os.replace(temporary_path, config)
    except OSError as exc:
        raise RuntimeError(f"could not enable the Krita Bridge in: {config}") from exc
    finally:
        temporary_path.unlink(missing_ok=True)


def bridge_status() -> dict:
    status_path = bridge_root() / "status.json"
    status = _read_json(status_path) or {}
    updated_at = status.get("updated_at")
    responding = isinstance(updated_at, (int, float)) and time.time() - float(updated_at) <= STATUS_MAX_AGE
    bridge_protocol = status.get("protocol") if responding else None
    protocol_compatible = bridge_protocol == PROTOCOL_VERSION
    online = responding and protocol_compatible
    version = installed_version()
    configured_enabled = _plugin_enabled()
    enabled = configured_enabled or responding
    krita_running = _krita_is_running()
    document = status.get("document") if online and isinstance(status.get("document"), dict) else None
    return {
        "bridge_id": BRIDGE_ID,
        "expected_version": BRIDGE_VERSION,
        "protocol": PROTOCOL_VERSION,
        "bridge_protocol": bridge_protocol,
        "protocol_compatible": protocol_compatible,
        "bridge_version": status.get("bridge_version") if responding else None,
        "responding": responding,
        "installed": version is not None,
        "installed_version": version,
        "enabled": enabled,
        "install_path": str(installed_paths()[1]),
        "config_path": str(krita_config_path()),
        "krita_running": krita_running,
        "online": online,
        "document": document,
        "updated_at": updated_at if online else None,
    }


def install_bridge(*, repair: bool = False) -> dict:
    current = bridge_status()
    if current["krita_running"] or current["responding"]:
        raise RuntimeError("Krita is running; close Krita before installing, enabling, or repairing the Bridge")
    source_desktop = bundle_root() / f"{BRIDGE_ID}.desktop"
    source_package = bundle_root() / BRIDGE_ID
    if not source_desktop.is_file() or not source_package.is_dir():
        raise RuntimeError("the bundled Krita Bridge files are missing")
    target_desktop, target_package = installed_paths()
    target_desktop.parent.mkdir(parents=True, exist_ok=True)
    if current["installed"] and not repair and current["installed_version"] == BRIDGE_VERSION:
        _enable_plugin()
        return bridge_status()

    staging_root = Path(tempfile.mkdtemp(prefix="aaalice-krita-bridge-", dir=target_desktop.parent))
    staged_package = staging_root / BRIDGE_ID
    staged_desktop = staging_root / f"{BRIDGE_ID}.desktop"
    try:
        shutil.copytree(source_package, staged_package)
        shutil.copy2(source_desktop, staged_desktop)
        if target_package.exists():
            shutil.rmtree(target_package)
        os.replace(staged_package, target_package)
        os.replace(staged_desktop, target_desktop)
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)
    result = bridge_status()
    if result["installed_version"] != BRIDGE_VERSION:
        raise RuntimeError("Krita Bridge installation did not produce the expected version")
    _enable_plugin()
    result = bridge_status()
    if not result["enabled"]:
        raise RuntimeError("Krita Bridge was installed but could not be enabled")
    return result


__all__ = [
    "BRIDGE_ID",
    "BRIDGE_VERSION",
    "bridge_status",
    "install_bridge",
    "installed_version",
    "krita_config_path",
]
