from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image, PngImagePlugin

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.image_generation_metadata import parse_image_generation_metadata  # noqa: E402
from nodes._lib.krita_snapshot import (  # noqa: E402
    KritaSnapshotError,
    PROTOCOL_VERSION,
    load_snapshot_tensors,
    parse_snapshot_response,
)
from nodes.krita import NODE_CLASSES  # noqa: E402
from nodes.krita import bridge_client, bridge_service, routes  # noqa: E402
from nodes.krita.fetch_from_krita import FetchFromKrita  # noqa: E402


def _response(root: Path, request_id: str, *, selection: bool = True) -> dict:
    payloads = root / "payloads"
    payloads.mkdir(parents=True, exist_ok=True)
    image_path = payloads / f"{request_id}-image.png"
    Image.fromarray(np.full((3, 4, 3), 127, dtype=np.uint8), "RGB").save(image_path)
    mask_path = payloads / f"{request_id}-mask.png"
    if selection:
        Image.fromarray(np.zeros((3, 4), dtype=np.uint8), "L").save(mask_path)
    return {
        "protocol": PROTOCOL_VERSION,
        "request_id": request_id,
        "status": "success",
        "document": {"name": "Study.kra", "width": 4, "height": 3, "color_model": "RGBA"},
        "image_path": str(image_path),
        "selection": {
            "present": selection,
            "mask_path": str(mask_path) if selection else None,
            "bounds": [0, 0, 0, 0] if selection else None,
        },
    }


class KritaSnapshotTests(unittest.TestCase):
    def test_black_selection_is_preserved_as_a_present_mask(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = parse_snapshot_response(_response(root, "request"), "request", root)
            image, mask = load_snapshot_tensors(snapshot)
        self.assertTrue(snapshot.selection_present)
        self.assertEqual(tuple(image.shape), (1, 3, 4, 3))
        self.assertEqual(tuple(mask.shape), (1, 3, 4))
        self.assertEqual(float(mask.max()), 0.0)

    def test_absent_selection_creates_same_size_empty_mask(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = parse_snapshot_response(_response(root, "request", selection=False), "request", root)
            _, mask = load_snapshot_tensors(snapshot)
        self.assertFalse(snapshot.selection_present)
        self.assertIsNone(snapshot.parameters)
        self.assertEqual(tuple(mask.shape), (1, 3, 4))

    def test_request_protocol_and_payload_paths_are_strict(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _response(root, "request")
            with self.assertRaisesRegex(KritaSnapshotError, "another request"):
                parse_snapshot_response(data, "different", root)
            data["protocol"] = 999
            with self.assertRaisesRegex(KritaSnapshotError, "incompatible"):
                parse_snapshot_response(data, "request", root)
            data = _response(root, "request")
            outside = root / "outside.png"
            Image.new("RGB", (4, 3)).save(outside)
            data["image_path"] = str(outside)
            with self.assertRaisesRegex(KritaSnapshotError, "outside"):
                parse_snapshot_response(data, "request", root)

    def test_image_and_mask_dimensions_must_match_document(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _response(root, "request")
            data["document"]["width"] = 5
            snapshot = parse_snapshot_response(data, "request", root)
            with self.assertRaisesRegex(KritaSnapshotError, "expected 5x3"):
                load_snapshot_tensors(snapshot)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _response(root, "request")
            Image.new("L", (2, 2)).save(data["selection"]["mask_path"])
            snapshot = parse_snapshot_response(data, "request", root)
            with self.assertRaisesRegex(KritaSnapshotError, "mask is 2x2"):
                load_snapshot_tensors(snapshot)

    def test_missing_and_non_png_payloads_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _response(root, "request")
            Path(data["image_path"]).unlink()
            with self.assertRaisesRegex(KritaSnapshotError, "does not exist"):
                parse_snapshot_response(data, "request", root)

            data = _response(root, "request")
            jpg_path = root / "payloads" / "request-image.jpg"
            Image.new("RGB", (4, 3)).save(jpg_path)
            data["image_path"] = str(jpg_path)
            with self.assertRaisesRegex(KritaSnapshotError, "PNG"):
                parse_snapshot_response(data, "request", root)

    def test_original_document_parameters_are_read_during_the_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_path = root / "original.png"
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text("parameters", "Krita source 参数\nSteps: 20")
            Image.new("RGB", (4, 3), "blue").save(source_path, pnginfo=png_info)
            data = _response(root, "request")
            data["source_path"] = str(source_path)
            snapshot = parse_snapshot_response(data, "request", root)
            self.assertEqual(snapshot.parameters, "Krita source 参数\nSteps: 20")

            data = _response(root, "empty")
            data["source_path"] = str(root / "empty-source.png")
            Image.new("RGB", (4, 3), "green").save(data["source_path"])
            snapshot = parse_snapshot_response(data, "empty", root)
            self.assertIsNone(snapshot.parameters)

    def test_invalid_original_document_source_fails_explicitly(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _response(root, "request")
            data["source_path"] = str(root / "missing.png")
            with self.assertRaisesRegex(KritaSnapshotError, "no longer exists"):
                parse_snapshot_response(data, "request", root)

            source_path = root / "source.kra"
            source_path.write_bytes(b"not an image")
            data["source_path"] = str(source_path)
            with self.assertRaisesRegex(KritaSnapshotError, "PNG, JPEG, or WebP"):
                parse_snapshot_response(data, "request", root)

    def test_explicit_bridge_failure_keeps_code_and_message(self):
        data = {
            "protocol": PROTOCOL_VERSION,
            "request_id": "request",
            "status": "error",
            "error": {"code": "no-active-document", "message": "Krita has no active document"},
        }
        with self.assertRaises(KritaSnapshotError) as raised:
            parse_snapshot_response(data, "request", Path("."))
        self.assertEqual(raised.exception.code, "no-active-document")
        self.assertIn("no active document", str(raised.exception))


class KritaBridgeClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_correlated_response_is_loaded_and_only_its_files_are_cleaned(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            unrelated = root / "responses" / "other.json"
            unrelated.parent.mkdir(parents=True)
            unrelated.write_text("{}", encoding="utf-8")

            async def bridge_worker():
                while not list((root / "requests").glob("*.json")):
                    await asyncio.sleep(0.01)
                request_path = next((root / "requests").glob("*.json"))
                request_id = request_path.stem
                response_path = root / "responses" / f"{request_id}.json"
                response_path.write_text(json.dumps(_response(root, request_id)), encoding="utf-8")

            worker = asyncio.create_task(bridge_worker())
            image, mask, snapshot = await bridge_client.fetch_snapshot(root=root, timeout=1)
            await worker
            self.assertEqual(tuple(image.shape), (1, 3, 4, 3))
            self.assertEqual(tuple(mask.shape), (1, 3, 4))
            self.assertEqual(snapshot.document.name, "Study.kra")
            self.assertTrue(unrelated.exists())
            self.assertEqual(list((root / "requests").glob("*.json")), [])
            self.assertEqual(list((root / "payloads").glob("*.png")), [])

    async def test_processing_acknowledgement_uses_snapshot_timeout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            async def bridge_worker():
                while not list((root / "requests").glob("*.json")):
                    await asyncio.sleep(0.005)
                request_path = next((root / "requests").glob("*.json"))
                request_id = request_path.stem
                response_path = root / "responses" / f"{request_id}.json"
                bridge_client._atomic_json(response_path, {
                    "protocol": PROTOCOL_VERSION,
                    "request_id": request_id,
                    "status": "processing",
                })
                await asyncio.sleep(0.1)
                bridge_client._atomic_json(response_path, _response(root, request_id))

            worker = asyncio.create_task(bridge_worker())
            image, mask, snapshot = await bridge_client.fetch_snapshot(
                root=root,
                timeout=0.05,
                processing_timeout=1,
            )
            await worker
        self.assertEqual(tuple(image.shape), (1, 3, 4, 3))
        self.assertEqual(tuple(mask.shape), (1, 3, 4))
        self.assertEqual(snapshot.document.name, "Study.kra")

    async def test_legacy_processing_claim_uses_snapshot_timeout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            async def bridge_worker():
                while not list((root / "requests").glob("*.json")):
                    await asyncio.sleep(0.005)
                request_path = next((root / "requests").glob("*.json"))
                request_id = request_path.stem
                request_path.rename(request_path.with_suffix(".processing"))
                await asyncio.sleep(0.1)
                bridge_client._atomic_json(root / "responses" / f"{request_id}.json", _response(root, request_id))

            worker = asyncio.create_task(bridge_worker())
            image, mask, snapshot = await bridge_client.fetch_snapshot(
                root=root,
                timeout=0.05,
                processing_timeout=1,
            )
            await worker
        self.assertEqual(tuple(image.shape), (1, 3, 4, 3))
        self.assertEqual(tuple(mask.shape), (1, 3, 4))
        self.assertEqual(snapshot.document.name, "Study.kra")

    async def test_timeout_and_interrupt_cleanup_request(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(KritaSnapshotError, "did not respond") as caught:
                await bridge_client.fetch_snapshot(root=root, timeout=0.05)
            self.assertEqual(caught.exception.code, "bridge-timeout")
            self.assertEqual(list((root / "requests").glob("*.json")), [])

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            async def acknowledge():
                while not list((root / "requests").glob("*.json")):
                    await asyncio.sleep(0.005)
                request_path = next((root / "requests").glob("*.json"))
                request_id = request_path.stem
                bridge_client._atomic_json(root / "responses" / f"{request_id}.json", {
                    "protocol": PROTOCOL_VERSION,
                    "request_id": request_id,
                    "status": "processing",
                })

            worker = asyncio.create_task(acknowledge())
            with self.assertRaisesRegex(KritaSnapshotError, "did not finish") as caught:
                await bridge_client.fetch_snapshot(root=root, timeout=0.05, processing_timeout=0.05)
            await worker
            self.assertEqual(caught.exception.code, "snapshot-timeout")
            self.assertEqual(list((root / "responses").glob("*.json")), [])

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(RuntimeError, "cancelled"):
                await bridge_client.fetch_snapshot(
                    root=root,
                    timeout=1,
                    interrupt=lambda: (_ for _ in ()).throw(RuntimeError("cancelled")),
                )
            self.assertEqual(list((root / "requests").glob("*.json")), [])

    async def test_concurrent_requests_receive_only_their_own_responses(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            async def bridge_worker():
                while len(list((root / "requests").glob("*.json"))) < 2:
                    await asyncio.sleep(0.01)
                (root / "responses").mkdir(parents=True, exist_ok=True)
                for index, request_path in enumerate(sorted((root / "requests").glob("*.json"))):
                    request_id = request_path.stem
                    data = _response(root, request_id)
                    data["document"]["name"] = f"Document-{index}.kra"
                    (root / "responses" / f"{request_id}.json").write_text(json.dumps(data), encoding="utf-8")

            worker = asyncio.create_task(bridge_worker())
            first, second = await asyncio.gather(
                bridge_client.fetch_snapshot(root=root, timeout=1),
                bridge_client.fetch_snapshot(root=root, timeout=1),
            )
            await worker
        self.assertEqual({first[2].document.name, second[2].document.name}, {"Document-0.kra", "Document-1.kra"})


class FetchFromKritaNodeTests(unittest.IsolatedAsyncioTestCase):
    def test_node_contract_is_zero_input_external_source(self):
        self.assertIn(FetchFromKrita, NODE_CLASSES)
        schema = FetchFromKrita.define_schema()
        self.assertEqual(schema.node_id, "FetchFromKrita")
        self.assertEqual(schema.category, "Aaalice/krita")
        self.assertEqual(schema.inputs, [])
        self.assertEqual(
            [output.id for output in schema.outputs],
            ["image", "mask", "metadata"],
        )
        self.assertTrue(schema.not_idempotent)
        self.assertNotEqual(FetchFromKrita.fingerprint_inputs(), FetchFromKrita.fingerprint_inputs())

    async def test_success_returns_execution_metadata_and_failure_is_explicit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_path = root / "original.png"
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text("parameters", "Krita parameters")
            Image.new("RGB", (4, 3), "blue").save(source_path, pnginfo=png_info)
            response = _response(root, "request")
            response["source_path"] = str(source_path)
            snapshot = parse_snapshot_response(response, "request", root)
            image, mask = load_snapshot_tensors(snapshot)
            with patch("nodes.krita.fetch_from_krita.fetch_snapshot", return_value=(image, mask, snapshot)):
                output = await FetchFromKrita.execute()
        self.assertEqual(output.args[:2], (image, mask))
        self.assertEqual(
            parse_image_generation_metadata(output.args[2]),
            "Krita parameters",
        )
        self.assertEqual(output.ui["aaalice_krita_snapshot"][0]["document"], "Study.kra")

        async def fail(**_kwargs):
            raise KritaSnapshotError("no-active-document", "Krita has no active document")

        with patch("nodes.krita.fetch_from_krita.fetch_snapshot", side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, "no-active-document"):
                await FetchFromKrita.execute()


class KritaBridgeServiceAndRoutesTests(unittest.IsolatedAsyncioTestCase):
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

    def test_bundled_bridge_acknowledges_before_refreshing_and_reading_projection(self):
        source = (bridge_service.bundle_root() / bridge_service.BRIDGE_ID / "extension.py").read_text(encoding="utf-8")
        acknowledgement = 'self._response(request_id, status="processing")'
        refresh = "document.refreshProjection()"
        pixel_read = "pixels = document.pixelData(0, 0, width, height)"
        self.assertLess(source.index(acknowledgement), source.index(refresh))
        self.assertLess(source.index(refresh), source.index(pixel_read))
        self.assertEqual(
            (bridge_service.bundle_root() / bridge_service.BRIDGE_ID / "VERSION").read_text(encoding="utf-8").strip(),
            bridge_service.BRIDGE_VERSION,
        )

    async def test_explicit_install_copies_and_enables_the_bundled_bridge_then_refuses_while_krita_runs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target_desktop = root / "plugins" / f"{bridge_service.BRIDGE_ID}.desktop"
            target_package = root / "plugins" / bridge_service.BRIDGE_ID
            config_path = root / "config" / "kritarc"
            with patch.object(bridge_service, "installed_paths", return_value=(target_desktop, target_package)), patch.object(
                bridge_service, "bridge_root", return_value=root / "runtime"
            ), patch.object(bridge_service, "krita_config_path", return_value=config_path), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                result = bridge_service.install_bridge()
                self.assertTrue(result["installed"])
                self.assertTrue(result["enabled"])
                self.assertEqual((target_package / "VERSION").read_text(encoding="utf-8").strip(), bridge_service.BRIDGE_VERSION)
                self.assertIn("enable_aaalice_comfy_bridge=true", config_path.read_text(encoding="utf-8"))
                with patch.object(
                    bridge_service,
                    "bridge_status",
                    return_value={"online": False, "responding": False, "krita_running": True},
                ):
                    with self.assertRaisesRegex(RuntimeError, "close Krita"):
                        bridge_service.install_bridge(repair=True)

    async def test_enable_plugin_preserves_existing_kritarc_format_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary:
            config = Path(temporary) / "kritarc"
            config.write_bytes(b"\xef\xbb\xbf[General]\r\nkeep=value\r\n\r\n[python]\r\nenable_other=true\r\n")
            bridge_service._enable_plugin(config)
            bridge_service._enable_plugin(config)
            raw = config.read_bytes()
            self.assertTrue(bridge_service._plugin_enabled(config))
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        self.assertNotIn(b"\n", raw.replace(b"\r\n", b""))
        text = raw.decode("utf-8-sig")
        self.assertIn("keep=value", text)
        self.assertIn("enable_other=true", text)
        self.assertEqual(text.count("enable_aaalice_comfy_bridge=true"), 1)

    async def test_enable_plugin_updates_an_existing_disabled_entry(self):
        with tempfile.TemporaryDirectory() as temporary:
            config = Path(temporary) / "kritarc"
            config.write_text("[python]\nenable_aaalice_comfy_bridge=false\n", encoding="utf-8")
            bridge_service._enable_plugin(config)
            text = config.read_text(encoding="utf-8")
        self.assertEqual(text, "[python]\nenable_aaalice_comfy_bridge=true\n")

    async def test_current_install_can_be_enabled_without_overwriting_the_package(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target_desktop = root / "plugins" / f"{bridge_service.BRIDGE_ID}.desktop"
            target_package = root / "plugins" / bridge_service.BRIDGE_ID
            config_path = root / "kritarc"
            target_package.mkdir(parents=True)
            target_desktop.write_text("existing", encoding="utf-8")
            (target_package / "VERSION").write_text(bridge_service.BRIDGE_VERSION, encoding="utf-8")
            marker = target_package / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            with patch.object(bridge_service, "installed_paths", return_value=(target_desktop, target_package)), patch.object(
                bridge_service, "bridge_root", return_value=root / "runtime"
            ), patch.object(bridge_service, "krita_config_path", return_value=config_path), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                result = bridge_service.install_bridge()
                self.assertTrue(result["enabled"])
                self.assertTrue(marker.exists())

    async def test_status_is_offline_when_heartbeat_is_stale(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = root / "kritarc"
            (root / "status.json").write_text(json.dumps({
                "protocol": PROTOCOL_VERSION,
                "updated_at": time.time() - 10,
                "document": {"name": "Old.kra"},
            }), encoding="utf-8")
            with patch.object(bridge_service, "bridge_root", return_value=root), patch.object(
                bridge_service, "installed_paths", return_value=(root / "plugin.desktop", root / "plugin")
            ), patch.object(bridge_service, "krita_config_path", return_value=config), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                status = bridge_service.bridge_status()
        self.assertFalse(status["online"])
        self.assertIsNone(status["document"])

    async def test_status_exposes_a_live_incompatible_protocol(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = root / "kritarc"
            (root / "status.json").write_text(json.dumps({
                "protocol": PROTOCOL_VERSION + 1,
                "bridge_version": "future",
                "updated_at": time.time(),
                "document": {"name": "Future.kra"},
            }), encoding="utf-8")
            with patch.object(bridge_service, "bridge_root", return_value=root), patch.object(
                bridge_service, "installed_paths", return_value=(root / "plugin.desktop", root / "plugin")
            ), patch.object(bridge_service, "krita_config_path", return_value=config), patch.object(
                bridge_service, "_krita_is_running", return_value=False
            ):
                status = bridge_service.bridge_status()
        self.assertFalse(status["online"])
        self.assertFalse(status["protocol_compatible"])
        self.assertEqual(status["bridge_protocol"], PROTOCOL_VERSION + 1)
        self.assertIsNone(status["document"])

    async def test_status_route_retries_failed_automatic_update_without_hiding_status(self):
        with patch.object(routes, "auto_update_bridge", side_effect=RuntimeError("update failed")) as update, patch.object(
            routes, "bridge_status", return_value={"online": False, "automatic_update": {"state": "update-failed"}}
        ):
            response = await routes.get_status(object())
        self.assertEqual(response.status, 200)
        self.assertIn("update-failed", response.text)
        update.assert_called_once_with()

    async def test_test_route_requires_online_bridge(self):
        with patch.object(routes, "bridge_status", return_value={"online": False}):
            response = await routes.test_connection(object())
        self.assertEqual(response.status, 409)
        self.assertIn("not online", response.text)


if __name__ == "__main__":
    unittest.main()
