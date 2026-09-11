from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.gallery.booru_gallery import BooruGalleryNode
from nodes.gallery.service import GalleryService


def selection(post_id: str) -> dict:
    return {
        "source": "danbooru",
        "postId": post_id,
        "postUrl": f"https://example.test/posts/{post_id}",
        "mediaUrl": f"https://example.test/media/{post_id}.jpg",
        "previewUrl": f"https://example.test/preview/{post_id}.jpg",
        "fileExt": "jpg",
        "width": 1200,
        "height": 800,
        "rating": "general",
        "originalTags": {"artist": [], "copyright": [], "character": [], "general": [], "meta": []},
    }


def payload(prefix: str) -> str:
    return json.dumps({"version": 1, "prompt": {}, "selections": [selection(f"{prefix}-{index}") for index in range(4)]})


class GalleryExecutionPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_execution_applies_each_formatting_state_to_original_and_edited_tags(self):
        original = selection("original")
        original["originalTags"]["general"] = ["blue_hair", "hero_(a)"]
        edited = selection("edited")
        edited["originalTags"]["general"] = ["old_tag"]
        edited["editedTags"] = {"general": ["green_hair", "local_(hero)"]}
        service = MagicMock()
        service.execution_bytes = AsyncMock(side_effect=lambda _source, _post_id, url: url.encode())
        service.decode_image = lambda data: data.decode()
        cases = [
            (False, False, ["blue_hair, hero_(a)", "green_hair, local_(hero)"]),
            (True, False, ["blue hair, hero (a)", "green hair, local (hero)"]),
            (True, True, [r"blue hair, hero \(a\)", r"green hair, local \(hero\)"]),
            (False, True, [r"blue_hair, hero_\(a\)", r"green_hair, local_\(hero\)"]),
        ]
        with patch("nodes.gallery.booru_gallery.get_gallery_service", return_value=service), patch("nodes.gallery.booru_gallery.model_management.throw_exception_if_processing_interrupted"):
            for underscores, parentheses, expected in cases:
                with self.subTest(underscores=underscores, parentheses=parentheses):
                    raw = json.dumps({
                        "version": 1,
                        "prompt": {"categories": ["general"], "replaceUnderscores": underscores, "escapeParentheses": parentheses},
                        "selections": [original, edited],
                        "prompts": ["stale preview", "stale preview"],
                    })
                    self.assertIs(BooruGalleryNode.validate_inputs(raw), True)
                    output = await BooruGalleryNode.execute(raw)
                    self.assertEqual(output.args[0], [original["mediaUrl"], edited["mediaUrl"]])
                    self.assertEqual(output.args[1], expected)
        self.assertEqual(original["originalTags"]["general"], ["blue_hair", "hero_(a)"])
        self.assertEqual(edited["editedTags"]["general"], ["green_hair", "local_(hero)"])


class GalleryExecutionConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_gallery_nodes_share_three_execution_download_slots(self):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            active = 0
            peak = 0
            calls: list[str] = []
            three_started = asyncio.Event()
            release = asyncio.Event()

            async def fetch_media(_source, url):
                nonlocal active, peak
                active += 1
                peak = max(peak, active)
                calls.append(url)
                if active == 3:
                    three_started.set()
                try:
                    await release.wait()
                    return url.encode(), "image/jpeg", url
                finally:
                    active -= 1

            service.fetch_media = fetch_media
            service.decode_image = lambda data: data.decode()
            service._media.prune = lambda: None
            with patch("nodes.gallery.booru_gallery.get_gallery_service", return_value=service), patch("nodes.gallery.booru_gallery.model_management.throw_exception_if_processing_interrupted"):
                executions = asyncio.gather(BooruGalleryNode.execute(payload("a")), BooruGalleryNode.execute(payload("b")))
                await asyncio.wait_for(three_started.wait(), 1)
                await asyncio.sleep(0)
                calls_before_release = list(calls)
                peak_before_release = peak
                release.set()
                outputs = await executions

        self.assertEqual(len(calls_before_release), 3)
        self.assertEqual(peak_before_release, 3)
        self.assertEqual(outputs[0].args[0], [f"https://example.test/media/a-{index}.jpg" for index in range(4)])
        self.assertEqual(outputs[1].args[0], [f"https://example.test/media/b-{index}.jpg" for index in range(4)])
        self.assertEqual(len(calls), 8)
        self.assertEqual(peak, 3)


class GalleryExecutionLoopTests(unittest.TestCase):
    def test_repeated_node_execution_uses_each_prompt_event_loop(self):
        async def fetch_media(_source, url):
            await asyncio.sleep(0.01)
            return url.encode(), "image/jpeg", url

        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            service.fetch_media = fetch_media
            service.decode_image = lambda data: data.decode()
            service._media.prune = lambda: None
            with patch("nodes.gallery.booru_gallery.get_gallery_service", return_value=service), patch("nodes.gallery.booru_gallery.model_management.throw_exception_if_processing_interrupted"):
                first = asyncio.run(BooruGalleryNode.execute(payload("first")))
                self.assertEqual(len(service._execution_semaphores), 0)
                second = asyncio.run(BooruGalleryNode.execute(payload("second")))
                self.assertEqual(len(service._execution_semaphores), 0)

        self.assertEqual(first.args[0], [f"https://example.test/media/first-{index}.jpg" for index in range(4)])
        self.assertEqual(second.args[0], [f"https://example.test/media/second-{index}.jpg" for index in range(4)])


if __name__ == "__main__":
    unittest.main()
