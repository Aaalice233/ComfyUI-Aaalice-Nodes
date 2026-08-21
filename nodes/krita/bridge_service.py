"""Krita Bridge status, managed updates, and explicit installation or repair."""

from __future__ import annotations

import errno
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":
    import msvcrt
else:
    import fcntl

from .._lib.krita_snapshot import PROTOCOL_VERSION
from .bridge_client import bridge_root

BRIDGE_ID = "aaalice_comfy_bridge"
BRIDGE_VERSION = "1.2.0"
STATUS_MAX_AGE = 3.0

_update_lock = threading.RLock()
_auto_update_error: str | None = None
_auto_updated_from: str | None = None
_auto_update_recovery_required = False
_auto_update_recovery_path: Path | None = None


class BridgeRecoveryError(RuntimeError):
    def __init__(self, message: str, recovery_path: Path):
        super().__init__(message)
        self.recovery_path = recovery_path


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


@contextmanager
def _installation_lock():
    target_desktop, _target_package = installed_paths()
    lock_path = target_desktop.parent / f".{BRIDGE_ID}.update.lock"
    handle = None
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = lock_path.open("a+b")
        if os.name == "nt":
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
            while True:
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError as exc:
                    if exc.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                        raise
                    time.sleep(0.05)
        else:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    except OSError as exc:
        if handle is not None:
            handle.close()
        raise RuntimeError(f"could not lock the Krita Bridge installation: {exc}") from exc
    try:
        yield
    finally:
        handle.close()


def _restart_marker_path() -> Path:
    target_desktop, _target_package = installed_paths()
    return target_desktop.parent / f".{BRIDGE_ID}.restart-required"


def _set_restart_marker(required: bool) -> None:
    marker = _restart_marker_path()
    try:
        if required:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.touch(exist_ok=True)
        else:
            marker.unlink(missing_ok=True)
    except OSError as exc:
        action = "record" if required else "clear"
        raise RuntimeError(f"could not {action} the Krita Bridge restart state: {exc}") from exc


def _version_tuple(value: str | None) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", value or "")
    return (int(match.group(1)), int(match.group(2)), int(match.group(3))) if match else None


def _version_state(version: str | None) -> str:
    if version is None:
        return "not-installed"
    installed = _version_tuple(version)
    expected = _version_tuple(BRIDGE_VERSION)
    if installed is None or expected is None:
        return "manual-repair-required"
    if installed < expected:
        return "update-available"
    if installed > expected:
        return "newer"
    return "current"


def _bundle_sources() -> tuple[Path, Path]:
    desktop = bundle_root() / f"{BRIDGE_ID}.desktop"
    package = bundle_root() / BRIDGE_ID
    if not desktop.is_file() or not package.is_dir():
        raise RuntimeError("the bundled Krita Bridge files are missing")
    version_file = package / "VERSION"
    try:
        bundled_version = version_file.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise RuntimeError("the bundled Krita Bridge version is unreadable") from exc
    if bundled_version != BRIDGE_VERSION:
        raise RuntimeError(f"the bundled Krita Bridge version is {bundled_version or 'missing'}, expected {BRIDGE_VERSION}")
    return desktop, package


def _deploy_bundle() -> None:
    source_desktop, source_package = _bundle_sources()
    target_desktop, target_package = installed_paths()
    try:
        target_desktop.parent.mkdir(parents=True, exist_ok=True)
        staging_root = Path(tempfile.mkdtemp(prefix="aaalice-krita-bridge-", dir=target_desktop.parent))
    except OSError as exc:
        raise RuntimeError(f"could not prepare the Krita Bridge update: {exc}") from exc
    staged_package = staging_root / BRIDGE_ID
    staged_desktop = staging_root / f"{BRIDGE_ID}.desktop"
    backup_package = staging_root / f".{BRIDGE_ID}.backup"
    backup_desktop = staging_root / f".{BRIDGE_ID}.desktop.backup"
    package_deployed = False
    desktop_deployed = False
    preserve_staging = False
    try:
        shutil.copytree(source_package, staged_package)
        shutil.copy2(source_desktop, staged_desktop)
        if target_package.exists():
            os.replace(target_package, backup_package)
        os.replace(staged_package, target_package)
        package_deployed = True
        if target_desktop.exists():
            os.replace(target_desktop, backup_desktop)
        os.replace(staged_desktop, target_desktop)
        desktop_deployed = True
    except (OSError, shutil.Error) as exc:
        rollback_errors = []
        try:
            if desktop_deployed:
                target_desktop.unlink(missing_ok=True)
            if backup_desktop.exists():
                os.replace(backup_desktop, target_desktop)
        except (OSError, shutil.Error) as rollback_exc:
            rollback_errors.append(f"desktop: {rollback_exc}")
        try:
            if package_deployed and target_package.exists():
                shutil.rmtree(target_package)
            if backup_package.exists():
                os.replace(backup_package, target_package)
        except (OSError, shutil.Error) as rollback_exc:
            rollback_errors.append(f"package: {rollback_exc}")
        if rollback_errors:
            preserve_staging = True
            details = "; ".join(rollback_errors)
            raise BridgeRecoveryError(
                f"could not update or fully restore the Krita Bridge ({details}); recovery files remain in {staging_root}",
                staging_root,
            ) from exc
        raise RuntimeError(f"could not update the Krita Bridge installation: {exc}") from exc
    finally:
        if not preserve_staging:
            shutil.rmtree(staging_root, ignore_errors=True)


def _remove_recovery_files() -> None:
    if _auto_update_recovery_path is None:
        return
    install_root = installed_paths()[0].parent.resolve()
    recovery_path = _auto_update_recovery_path.resolve()
    if recovery_path.parent != install_root or not recovery_path.name.startswith("aaalice-krita-bridge-"):
        raise RuntimeError(f"refusing to remove an invalid Krita Bridge recovery path: {recovery_path}")
    if not recovery_path.exists():
        return
    try:
        shutil.rmtree(recovery_path)
    except OSError as exc:
        raise RuntimeError(f"could not remove the Krita Bridge recovery files in {recovery_path}: {exc}") from exc


def auto_update_bridge() -> bool:
    """Update an existing older Bridge without changing installation or enablement intent."""
    global _auto_update_error, _auto_updated_from, _auto_update_recovery_required, _auto_update_recovery_path
    with _update_lock:
        initial_state = _version_state(installed_version())
        if initial_state != "update-available":
            if initial_state in {"current", "newer"} and not _auto_update_recovery_required:
                _auto_update_error = None
            return False
        try:
            with _installation_lock():
                version = installed_version()
                if _version_state(version) != "update-available":
                    _auto_update_error = None
                    return False
                krita_was_running = _krita_is_running()
                _set_restart_marker(True)
                _deploy_bundle()
                if installed_version() != BRIDGE_VERSION:
                    raise RuntimeError("automatic Krita Bridge update did not produce the expected version")
                if not krita_was_running and not _krita_is_running():
                    _set_restart_marker(False)
                _remove_recovery_files()
        except RuntimeError as exc:
            _auto_update_error = str(exc)
            if isinstance(exc, BridgeRecoveryError):
                _auto_update_recovery_required = True
                _auto_update_recovery_path = exc.recovery_path
            raise
        _auto_update_error = None
        _auto_update_recovery_required = False
        _auto_update_recovery_path = None
        _auto_updated_from = version
        return True


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
    global _auto_update_error
    status_path = bridge_root() / "status.json"
    status = _read_json(status_path) or {}
    updated_at = status.get("updated_at")
    responding = isinstance(updated_at, (int, float)) and time.time() - float(updated_at) <= STATUS_MAX_AGE
    bridge_protocol = status.get("protocol") if responding else None
    protocol_compatible = bridge_protocol == PROTOCOL_VERSION
    online = responding and protocol_compatible
    version = installed_version()
    version_state = _version_state(version)
    running_version = status.get("bridge_version") if responding else None
    krita_running = _krita_is_running()
    restart_marker = _restart_marker_path().is_file()
    if restart_marker and (not krita_running or running_version == BRIDGE_VERSION):
        try:
            _set_restart_marker(False)
            restart_marker = False
        except RuntimeError as exc:
            _auto_update_error = str(exc)
    restart_required = version == BRIDGE_VERSION and (
        (responding and running_version != BRIDGE_VERSION) or restart_marker
    )
    if _auto_update_error:
        update_state = "update-failed"
    elif restart_required:
        update_state = "restart-required"
    elif _auto_updated_from is not None and version == BRIDGE_VERSION:
        update_state = "updated"
    else:
        update_state = version_state
    configured_enabled = _plugin_enabled()
    enabled = configured_enabled or responding
    document = status.get("document") if online and isinstance(status.get("document"), dict) else None
    return {
        "bridge_id": BRIDGE_ID,
        "expected_version": BRIDGE_VERSION,
        "protocol": PROTOCOL_VERSION,
        "bridge_protocol": bridge_protocol,
        "protocol_compatible": protocol_compatible,
        "bridge_version": running_version,
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
        "automatic_update": {
            "state": update_state,
            "from_version": _auto_updated_from,
            "target_version": BRIDGE_VERSION,
            "restart_required": restart_required,
            "error": _auto_update_error,
        },
    }


def install_bridge(*, repair: bool = False) -> dict:
    global _auto_update_error, _auto_updated_from, _auto_update_recovery_required, _auto_update_recovery_path
    with _update_lock, _installation_lock():
        current = bridge_status()
        if current["krita_running"] or current["responding"]:
            raise RuntimeError("Krita is running; close Krita before installing, enabling, or repairing the Bridge")
        if (
            current["installed"]
            and not repair
            and current["installed_version"] == BRIDGE_VERSION
            and not _auto_update_recovery_required
        ):
            _enable_plugin()
            _auto_update_error = None
            return bridge_status()

        _deploy_bundle()
        if installed_version() != BRIDGE_VERSION:
            raise RuntimeError("Krita Bridge installation did not produce the expected version")
        _enable_plugin()
        _set_restart_marker(False)
        _remove_recovery_files()
        _auto_update_error = None
        _auto_update_recovery_required = False
        _auto_update_recovery_path = None
        _auto_updated_from = None
        result = bridge_status()
        if not result["enabled"]:
            raise RuntimeError("Krita Bridge was installed but could not be enabled")
        return result


__all__ = [
    "BRIDGE_ID",
    "BRIDGE_VERSION",
    "auto_update_bridge",
    "bridge_status",
    "install_bridge",
    "installed_version",
    "krita_config_path",
]
