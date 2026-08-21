from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.krita_snapshot import PROTOCOL_VERSION  # noqa: E402
from nodes.krita import bridge_service  # noqa: E402


class KritaBridgeUpdateTests(unittest.TestCase):
    def setUp(self):
        bridge_service._auto_update_error = None
        bridge_service._auto_updated_from = None
        bridge_service._auto_update_recovery_required = False
        bridge_service._auto_update_recovery_path = None

    def tearDown(self):
        bridge_service._auto_update_error = None
        bridge_service._auto_updated_from = None
        bridge_service._auto_update_recovery_required = False
        bridge_service._auto_update_recovery_path = None

    @staticmethod
    def _legacy_install(root: Path) -> tuple[Path, Path]:
        desktop = root / "plugins" / f"{bridge_service.BRIDGE_ID}.desktop"
        package = root / "plugins" / bridge_service.BRIDGE_ID
        package.mkdir(parents=True)
        desktop.write_text("legacy desktop", encoding="utf-8")
        (package / "VERSION").write_text("1.1.0", encoding="utf-8")
        (package / "legacy.py").write_text("legacy", encoding="utf-8")
        return desktop, package

    def test_updates_running_bridge_without_enabling_it_and_requires_restart_without_heartbeat(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop, package = self._legacy_install(root)
            config = root / "kritarc"
            runtime = root / "runtime"
            config.write_text("[python]\nenable_aaalice_comfy_bridge=false\n", encoding="utf-8")
            runtime.mkdir()
            status_path = runtime / "status.json"
            status_path.write_text(json.dumps({
                "protocol": PROTOCOL_VERSION,
                "bridge_version": "1.1.0",
                "updated_at": time.time(),
                "document": {"name": "Running.kra"},
            }), encoding="utf-8")
            original_config = config.read_bytes()
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service, "bridge_root", return_value=runtime
            ), patch.object(bridge_service, "krita_config_path", return_value=config), patch.object(
                bridge_service, "_krita_is_running", return_value=True
            ):
                self.assertTrue(bridge_service.auto_update_bridge())
                online_status = bridge_service.bridge_status()
                status_path.unlink()
                bridge_service._auto_updated_from = None
                silent_status = bridge_service.bridge_status()
                status_path.write_text(json.dumps({
                    "protocol": PROTOCOL_VERSION,
                    "bridge_version": bridge_service.BRIDGE_VERSION,
                    "updated_at": time.time(),
                }), encoding="utf-8")
                current_status = bridge_service.bridge_status()
            self.assertEqual((package / "VERSION").read_text(encoding="utf-8").strip(), bridge_service.BRIDGE_VERSION)
            self.assertFalse((package / "legacy.py").exists())
            self.assertEqual(config.read_bytes(), original_config)
            self.assertTrue(online_status["online"])
            self.assertEqual(online_status["automatic_update"]["state"], "restart-required")
            self.assertEqual(silent_status["automatic_update"]["state"], "restart-required")
            self.assertEqual(current_status["automatic_update"]["state"], "current")
            self.assertFalse((root / "plugins" / f".{bridge_service.BRIDGE_ID}.restart-required").exists())

    def test_offline_update_does_not_leave_a_restart_requirement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop, package = self._legacy_install(root)
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                self.assertTrue(bridge_service.auto_update_bridge())
            self.assertFalse((root / "plugins" / f".{bridge_service.BRIDGE_ID}.restart-required").exists())

    def test_does_not_install_missing_or_downgrade_newer_bridge(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop = root / "plugins" / f"{bridge_service.BRIDGE_ID}.desktop"
            package = root / "plugins" / bridge_service.BRIDGE_ID
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)):
                self.assertFalse(bridge_service.auto_update_bridge())
                self.assertFalse(desktop.parent.exists())
                package.mkdir(parents=True)
                desktop.write_text("future desktop", encoding="utf-8")
                (package / "VERSION").write_text("9.0.0", encoding="utf-8")
                marker = package / "future.py"
                marker.write_text("future", encoding="utf-8")
                self.assertFalse(bridge_service.auto_update_bridge())
                self.assertTrue(marker.exists())

    def test_rechecks_version_after_acquiring_the_cross_process_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop, package = self._legacy_install(root)

            class CompetingUpdate:
                def __enter__(self):
                    (package / "VERSION").write_text(bridge_service.BRIDGE_VERSION, encoding="utf-8")

                def __exit__(self, _type, _value, _traceback):
                    return False

            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service, "_installation_lock", return_value=CompetingUpdate()
            ), patch.object(bridge_service, "_deploy_bundle") as deploy:
                self.assertFalse(bridge_service.auto_update_bridge())
            deploy.assert_not_called()

    def test_failed_update_restores_the_previous_installation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop, package = self._legacy_install(root)
            real_replace = os.replace
            failed = False

            def fail_desktop_deploy(source, target):
                nonlocal failed
                if not failed and Path(target) == desktop and Path(source).name == desktop.name:
                    failed = True
                    raise OSError("simulated desktop replacement failure")
                return real_replace(source, target)

            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service.os, "replace", side_effect=fail_desktop_deploy
            ), self.assertRaisesRegex(RuntimeError, "could not update"):
                bridge_service.auto_update_bridge()
            self.assertEqual(desktop.read_text(encoding="utf-8"), "legacy desktop")
            self.assertEqual((package / "VERSION").read_text(encoding="utf-8"), "1.1.0")
            self.assertEqual((package / "legacy.py").read_text(encoding="utf-8"), "legacy")

    def test_failed_rollback_preserves_the_remaining_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            desktop, package = self._legacy_install(root)
            real_replace = os.replace

            def fail_deploy_and_desktop_restore(source, target):
                source_path = Path(source)
                if Path(target) == desktop and (
                    source_path.name == desktop.name or source_path.name == f".{bridge_service.BRIDGE_ID}.desktop.backup"
                ):
                    raise OSError(f"simulated failure for {source_path.name}")
                return real_replace(source, target)

            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service.os, "replace", side_effect=fail_deploy_and_desktop_restore
            ), self.assertRaisesRegex(RuntimeError, "recovery files remain"):
                bridge_service.auto_update_bridge()
            recovery_error = bridge_service._auto_update_error
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)):
                self.assertFalse(bridge_service.auto_update_bridge())
            staging = next((root / "plugins").glob("aaalice-krita-bridge-*"))
            backup = staging / f".{bridge_service.BRIDGE_ID}.desktop.backup"
            self.assertEqual(backup.read_text(encoding="utf-8"), "legacy desktop")
            self.assertEqual((package / "VERSION").read_text(encoding="utf-8"), "1.1.0")
            self.assertEqual(bridge_service._auto_update_error, recovery_error)
            desktop.write_text("mixed desktop", encoding="utf-8")
            (package / "VERSION").write_text(bridge_service.BRIDGE_VERSION, encoding="utf-8")
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)):
                self.assertFalse(bridge_service.auto_update_bridge())
            self.assertEqual(bridge_service._auto_update_error, recovery_error)
            runtime = root / "runtime"
            runtime.mkdir()
            config = root / "kritarc"
            with patch.object(bridge_service, "installed_paths", return_value=(desktop, package)), patch.object(
                bridge_service, "bridge_root", return_value=runtime
            ), patch.object(bridge_service, "krita_config_path", return_value=config), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                repaired = bridge_service.install_bridge(repair=True)
            self.assertEqual(repaired["installed_version"], bridge_service.BRIDGE_VERSION)
            self.assertFalse(staging.exists())
            self.assertIsNone(bridge_service._auto_update_recovery_path)


if __name__ == "__main__":
    unittest.main()
