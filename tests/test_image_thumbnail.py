from __future__ import annotations

import asyncio
import io
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.image_thumbnail import THUMBNAIL_MAX_EDGE, render_image_thumbnail, thumbnail_etag
from nodes.tools.image_thumbnail_routes import image_thumbnail, resolve_image_path


class ImageThumbnailTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "large.png"
        Image.new("RGBA", (2048, 1024), (35, 80, 180, 128)).save(self.source, compress_level=0)
        render_image_thumbnail.cache_clear()

    def tearDown(self) -> None:
        render_image_thumbnail.cache_clear()
        self.temp.cleanup()

    def test_thumbnail_is_bounded_webp_and_preserves_alpha(self) -> None:
        _etag, modified_ns, source_size = thumbnail_etag(self.source)
        body = render_image_thumbnail(str(self.source), modified_ns, source_size)

        with Image.open(io.BytesIO(body)) as preview:
            self.assertEqual(preview.format, "WEBP")
            self.assertLessEqual(max(preview.size), THUMBNAIL_MAX_EDGE)
            self.assertIn("A", preview.getbands())
        self.assertLess(len(body), self.source.stat().st_size)

    def test_thumbnail_applies_exif_orientation_after_reduction(self) -> None:
        import nodes._lib.image_thumbnail as image_thumbnail

        oriented = self.root / "oriented.jpg"
        image = Image.new("RGB", (400, 200), (12, 80, 140))
        exif = image.getexif()
        exif[274] = 6
        image.save(oriented, exif=exif)
        sizes = []
        original = image_thumbnail.ImageOps.exif_transpose

        def record_size(source):
            sizes.append(source.size)
            return original(source)

        _etag, modified_ns, source_size = thumbnail_etag(oriented)
        with patch.object(image_thumbnail.ImageOps, "exif_transpose", side_effect=record_size):
            body = render_image_thumbnail(str(oriented), modified_ns, source_size)

        self.assertEqual(len(sizes), 1)
        self.assertLessEqual(max(sizes[0]), THUMBNAIL_MAX_EDGE)
        with Image.open(io.BytesIO(body)) as preview:
            self.assertLess(preview.width, preview.height)

    def test_unchanged_source_reuses_encoded_thumbnail(self) -> None:
        _etag, modified_ns, source_size = thumbnail_etag(self.source)
        render_image_thumbnail(str(self.source), modified_ns, source_size)
        render_image_thumbnail(str(self.source), modified_ns, source_size)

        self.assertEqual(render_image_thumbnail.cache_info().hits, 1)

    def test_overwritten_source_gets_a_new_etag_and_thumbnail(self) -> None:
        first_etag, modified_ns, source_size = thumbnail_etag(self.source)
        first = render_image_thumbnail(str(self.source), modified_ns, source_size)
        Image.new("RGBA", (2048, 1024), (180, 40, 65, 255)).save(self.source, compress_level=0)
        second_etag, modified_ns, source_size = thumbnail_etag(self.source)
        second = render_image_thumbnail(str(self.source), modified_ns, source_size)

        self.assertNotEqual(first_etag, second_etag)
        self.assertNotEqual(first, second)

    def test_route_resolution_uses_comfyui_containment_checks(self) -> None:
        import folder_paths

        nested = self.root / "refs"
        nested.mkdir()
        target = nested / "frame.png"
        target.write_bytes(self.source.read_bytes())
        with patch.object(folder_paths, "get_directory_by_type", return_value=str(self.root)):
            self.assertTrue(resolve_image_path("frame.png", "refs", "input").samefile(target))
            with self.assertRaisesRegex(ValueError, "invalid image path"):
                resolve_image_path("frame.png", "../outside", "input")

    def test_asset_hash_resolution_keeps_the_request_owner(self) -> None:
        result = SimpleNamespace(abs_path=str(self.source), content_type="image/png")
        with patch("app.assets.services.asset_management.resolve_hash_to_path", return_value=result) as resolve:
            self.assertEqual(resolve_image_path("blake3:abc", "", "input", owner_id="alice"), self.source)
            resolve.assert_called_once_with("blake3:abc", owner_id="alice")

    def test_asset_hash_svg_uses_authenticated_original_rendering(self) -> None:
        svg = self.root / "asset"
        svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>', encoding="utf-8")
        result = SimpleNamespace(abs_path=str(svg), content_type="image/svg+xml")
        user_manager = SimpleNamespace(get_request_user_id=lambda _request: "alice")
        request = SimpleNamespace(query={"filename": "blake3:abc"}, headers={})
        prompt_server = SimpleNamespace(instance=SimpleNamespace(user_manager=user_manager))
        with (
            patch.dict(sys.modules, {"server": SimpleNamespace(PromptServer=prompt_server)}),
            patch("app.assets.services.asset_management.resolve_hash_to_path", return_value=result) as resolve,
        ):
            response = asyncio.run(image_thumbnail(request))

        self.assertEqual((response.status, response.content_type), (200, "image/svg+xml"))
        self.assertEqual(response.body, svg.read_bytes())
        resolve.assert_called_once_with("blake3:abc", owner_id="alice")

    def test_route_returns_thumbnail_and_honors_etag(self) -> None:
        import folder_paths

        request = SimpleNamespace(query={"filename": self.source.name, "type": "input"}, headers={})
        with patch.object(folder_paths, "get_directory_by_type", return_value=str(self.root)):
            response = asyncio.run(image_thumbnail(request))
            self.assertEqual((response.status, response.content_type), (200, "image/webp"))
            request.headers["If-None-Match"] = response.headers["ETag"]
            cached = asyncio.run(image_thumbnail(request))
            self.assertEqual(cached.status, 304)

    def test_route_rejects_non_image_files(self) -> None:
        import folder_paths

        invalid = self.root / "not-an-image.png"
        invalid.write_text("not an image", encoding="utf-8")
        request = SimpleNamespace(query={"filename": invalid.name, "type": "input"}, headers={})
        with patch.object(folder_paths, "get_directory_by_type", return_value=str(self.root)):
            response = asyncio.run(image_thumbnail(request))
        self.assertEqual(response.status, 400)

    def test_concurrent_requests_are_deduplicated_and_bounded(self) -> None:
        import folder_paths

        sources = []
        for index in range(4):
            path = self.root / f"frame-{index}.png"
            path.write_bytes(self.source.read_bytes())
            sources.append(path)
        active = 0
        peak = 0
        calls = 0
        lock = threading.Lock()

        def render(_path: str, _modified_ns: int, _source_size: int) -> bytes:
            nonlocal active, peak, calls
            with lock:
                active += 1
                peak = max(peak, active)
                calls += 1
            time.sleep(0.03)
            with lock:
                active -= 1
            return b"thumbnail"

        async def request_all() -> None:
            requests = [SimpleNamespace(query={"filename": path.name, "type": "input"}, headers={}) for path in sources]
            requests.append(SimpleNamespace(query={"filename": sources[0].name, "type": "input"}, headers={}))
            responses = await asyncio.gather(*(image_thumbnail(request) for request in requests))
            self.assertTrue(all(response.status == 200 for response in responses))

        with (
            patch.object(folder_paths, "get_directory_by_type", return_value=str(self.root)),
            patch("nodes.tools.image_thumbnail_routes.render_image_thumbnail", side_effect=render),
        ):
            asyncio.run(request_all())
        self.assertEqual(calls, 4)
        self.assertLessEqual(peak, 2)

    def test_route_rejects_unknown_types_and_nested_filenames(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported image type"):
            resolve_image_path("frame.png", "", "models")
        with self.assertRaisesRegex(ValueError, "single path component"):
            resolve_image_path("nested/frame.png", "", "input")


if __name__ == "__main__":
    unittest.main()
