from __future__ import annotations

import inspect
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.booru_gallery import compose_prompt, parse_gallery_payload
from nodes.gallery import NODE_CLASSES
from nodes.gallery.adapters import AITagAdapter, DanbooruAdapter, GalleryPage, GelbooruAdapter, SafebooruAdapter, adapter_for
from nodes.gallery.booru_gallery import BooruGalleryNode
from nodes.gallery.service import GalleryService
from nodes.gallery.settings import GallerySettingsStore, default_settings


def selection(post_id="1", source="danbooru"):
    return {
        "source": source, "postId": post_id,
        "postUrl": f"https://example.test/posts/{post_id}",
        "mediaUrl": f"https://example.test/media/{post_id}.jpg",
        "previewUrl": f"https://example.test/preview/{post_id}.jpg",
        "fileExt": "jpg", "width": 1200, "height": 800, "rating": "general",
        "originalTags": {"artist": ["artist_a"], "copyright": ["series_a"], "character": ["hero_(series)"], "general": ["blue_hair", "duplicate"], "meta": ["duplicate"]},
    }


class GalleryModelTests(unittest.TestCase):
    def test_payload_preserves_order_and_source_scoped_identity(self):
        raw = {"version": 1, "prompt": {}, "selections": [selection("2"), selection("1"), selection("1", "gelbooru")]}
        selections, _options = parse_gallery_payload(json.dumps(raw))
        self.assertEqual([item.key for item in selections], ["danbooru:2", "danbooru:1", "gelbooru:1"])

    def test_duplicate_same_source_fails(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_gallery_payload(json.dumps({"version": 1, "selections": [selection(), selection()]}))

    def test_prompt_category_order_exclusion_and_conversion(self):
        selected, options = parse_gallery_payload(json.dumps({"version": 1, "prompt": {
            "categories": ["general", "character", "copyright", "meta"], "replaceUnderscores": True,
            "escapeParentheses": True, "excludedTags": ["blue_hair"],
        }, "selections": [selection()]}))
        self.assertEqual(compose_prompt(selected[0], options), r"series a, hero \(series\), duplicate")

    def test_edited_tags_replace_original_groups(self):
        item = selection()
        item["editedTags"] = {"copyright": ["new_series"], "character": [], "general": ["green_hair"]}
        selected, options = parse_gallery_payload(json.dumps({"version": 1, "prompt": {}, "selections": [item]}))
        self.assertEqual(compose_prompt(selected[0], options), "new_series, green_hair")


class GalleryAdapterTests(unittest.TestCase):
    def test_capabilities_are_site_specific_and_camel_case(self):
        danbooru = DanbooruAdapter.capabilities.json()
        gelbooru = GelbooruAdapter.capabilities.json()
        safe = SafebooruAdapter.capabilities.json()
        self.assertTrue(danbooru["favoriteWrite"])
        self.assertFalse(gelbooru["favoriteWrite"])
        self.assertFalse(safe["favoriteRead"])
        self.assertEqual(safe["ratings"], ["safe"])
        self.assertEqual(gelbooru["ratings"], ["safe", "questionable", "explicit"])
        self.assertTrue(gelbooru["authRequired"])
        self.assertEqual(gelbooru["maxPageSize"], 100)
        self.assertEqual(AITagAdapter.capabilities.json()["ratings"], [])
        self.assertEqual(danbooru["rankingPeriods"], ["day", "week", "month"])
        self.assertEqual(AITagAdapter.capabilities.json()["rankingPeriods"], ["month"])
        self.assertTrue(danbooru["pageJump"])

    def test_indexed_page_conversion_is_adapter_owned(self):
        self.assertEqual(DanbooruAdapter().cursor_for_page(7), "7")
        self.assertEqual(GelbooruAdapter().cursor_for_page(7), "6")
        self.assertEqual(SafebooruAdapter().cursor_for_page(1), "0")

    def test_danbooru_daily_ranking_uses_official_popular_endpoint(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[{"id": 7, "preview_file_url": "https://cdn.donmai.us/preview.jpg"}])
            page = await adapter.ranking(None, "day", "3", 20, {})
            url = adapter._get_json.await_args.args[1]
            params = adapter._get_json.await_args.kwargs["params"]
            self.assertTrue(url.endswith("/explore/posts/popular.json"))
            self.assertEqual((params["scale"], params["page"]), ("day", 3))
            self.assertEqual(page.page, 3)
        import asyncio
        asyncio.run(run())

    def test_blacklist_is_adapter_owned_and_exactly_filters_lightweight_results(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "tag_string": "blue_hair watermark", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
                {"id": 8, "tag_string": "blue_hair text_focus", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
            ])
            page = await adapter.search(None, "blue_hair", [], "latest", None, 20, {}, ("watermark", "text"))
            params = adapter._get_json.await_args.kwargs["params"]
            self.assertIn("-watermark", params["tags"])
            self.assertIn("-text", params["tags"])
            self.assertEqual([post.post_id for post in page.posts], ["8"])
        import asyncio
        asyncio.run(run())

    def test_aitag_normalizes_public_search_and_prompt_detail(self):
        async def run():
            adapter = AITagAdapter()
            adapter._get_json = AsyncMock(side_effect=[
                {"page": 1, "page_size": 60, "total": 61, "items": [{"id": 42 + index, "userId": 7, "AI_type": "NAI", "create_date": "2026-01-01"} for index in range(60)]},
                json.dumps({"work": {"id": 42, "userid": 7, "AI_type": "NAI", "json": json.dumps({"width": 832, "height": 1216})},
                            "images": [{"image_path": "NAI/7/42_p0.webp", "prompt_text": "hero, blue_hair\nSteps: 28, CFG scale: 5"}]})
            ])
            page = await adapter.search(None, "hero", [], "new", None, 60, {})
            self.assertEqual(page.posts[0].preview_url, "https://ai-img.10118899.xyz/NAI/7/42_p0.webp")
            self.assertEqual(page.next_cursor, "2")
            detail = await adapter.get_post(None, "42", {})
            self.assertEqual((detail.width, detail.height), (832, 1216))
            self.assertEqual(detail.tags["general"], ("hero", "blue_hair"))
        import asyncio
        asyncio.run(run())

    def test_aitag_preserves_asset_directory_case_and_uses_the_first_real_image(self):
        async def run():
            adapter = AITagAdapter()
            self.assertEqual(adapter._summary({"id": 42, "userId": 7, "AI_type": "ComfyUI"}).preview_url,
                             "https://ai-img.10118899.xyz/ComfyUI/7/42_p0.webp")
            adapter._get_json = AsyncMock(return_value={
                "work": {"id": 42, "userid": 7, "AI_type": "NAI", "json": json.dumps({"width": 832, "height": 1216})},
                "images": [
                    {"file_name": "42_p2", "image_path": "NAI/7/42_p2.webp", "prompt_text": "second"},
                    {"file_name": "42_p1", "image_path": "NAI/7/42_p1.webp", "prompt_text": "first"},
                ],
            })
            detail = await adapter.get_post(None, "42", {})
            self.assertEqual(detail.preview_url, "https://ai-img.10118899.xyz/NAI/7/42_p1.webp")
            self.assertEqual(detail.media_url, detail.preview_url)
        import asyncio
        asyncio.run(run())

    def test_gelbooru_requires_official_api_credentials_before_network_access(self):
        async def run():
            adapter = GelbooruAdapter()
            adapter._get_json = AsyncMock()
            with self.assertRaisesRegex(ValueError, "User ID and API Key"):
                await adapter.search(None, "", [], "latest", None, 20, {})
            adapter._get_json.assert_not_awaited()
        import asyncio
        asyncio.run(run())

    def test_aitag_monthly_ranking_is_separate_from_search_sort(self):
        async def run():
            adapter = AITagAdapter()
            adapter._get_json = AsyncMock(return_value={"total": 1, "items": [{"id": 42, "userId": 7, "AI_type": "NAI"}]})
            page = await adapter.ranking(None, "month", None, 60, {})
            self.assertEqual(page.page, 1)
            self.assertIn("/api/rank/monthly/real", adapter._get_json.await_args.args[1])
        import asyncio
        asyncio.run(run())

    def test_aitag_blacklist_filters_search_and_ranking_without_detail_requests(self):
        async def run():
            adapter = AITagAdapter()
            adapter._get_json = AsyncMock(return_value={"total": 2, "items": [
                {"id": 42, "userId": 7, "AI_type": "NAI", "tags": json.dumps(["hero", "watermark"])},
                {"id": 43, "userId": 7, "AI_type": "NAI", "tags": json.dumps(["hero", "text_focus"])},
            ]})
            search_page = await adapter.search(None, "hero", [], "new", None, 60, {}, ("watermark",))
            ranking_page = await adapter.ranking(None, "month", None, 60, {}, ("watermark",))
            self.assertEqual([post.post_id for post in search_page.posts], ["43"])
            self.assertEqual([post.post_id for post in ranking_page.posts], ["43"])
            self.assertEqual(adapter._get_json.await_count, 2)
        import asyncio
        asyncio.run(run())

    def test_danbooru_detail_exposes_large_preview_separately_from_original(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value={
                "id": 7, "file_url": "https://cdn.donmai.us/original.jpg",
                "large_file_url": "https://cdn.donmai.us/sample.jpg",
                "preview_file_url": "https://cdn.donmai.us/preview.jpg",
                "file_ext": "jpg", "image_width": 1200, "image_height": 1800,
            })
            detail = await adapter.get_post(None, "7", {})
            self.assertEqual(detail.media_url, "https://cdn.donmai.us/original.jpg")
            self.assertEqual(detail.sample_url, "https://cdn.donmai.us/sample.jpg")
            self.assertEqual(detail.json()["sampleUrl"], "https://cdn.donmai.us/sample.jpg")
        import asyncio
        asyncio.run(run())

    def test_media_url_allowlist_requires_https_and_declared_host(self):
        adapter = adapter_for("danbooru")
        adapter.validate_media_url("https://cdn.donmai.us/original/a.jpg")
        for url in ("http://cdn.donmai.us/a.jpg", "https://127.0.0.1/a.jpg", "https://cdn.donmai.us.evil.test/a.jpg"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                adapter.validate_media_url(url)

    def test_unsupported_favorite_write_fails_explicitly(self):
        async def run():
            with self.assertRaisesRegex(ValueError, "does not support favorite writing"):
                await adapter_for("gelbooru").set_favorite(None, "1", True, {})
        import asyncio
        asyncio.run(run())


class GallerySettingsTests(unittest.TestCase):
    def test_legacy_gelbooru_ratings_normalize_to_current_site_values(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            path = store.path
            value = default_settings()
            value["defaultRatings"]["gelbooru"] = ["general", "sensitive", "explicit"]
            path.write_text(json.dumps(value), encoding="utf-8")
            self.assertEqual(store.load()["defaultRatings"]["gelbooru"], ["safe", "explicit"])

    def test_secrets_are_redacted_preserved_and_explicitly_cleared(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            public = store.save({"credentials": {"danbooru": {"username": "alice", "apiKey": "secret"}}})
            self.assertNotIn("credentials", public)
            self.assertTrue(public["credentialStatus"]["danbooru"]["hasApiKey"])
            store.save({"credentials": {"danbooru": {"apiKey": ""}}})
            self.assertEqual(store.load()["credentials"]["danbooru"]["apiKey"], "secret")
            store.save({"clearCredentials": {"danbooru": ["apiKey"]}})
            self.assertEqual(store.load()["credentials"]["danbooru"]["apiKey"], "")

    def test_blacklist_is_trimmed_deduplicated_and_kept_out_of_workflows(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            public = store.save({"blacklist": [" watermark ", "text", "watermark", ""]})
            self.assertEqual(public["blacklist"], ["watermark", "text"])


class GalleryServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_injects_blacklist_into_adapter_and_cache_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            adapter = DanbooruAdapter()
            adapter.search = AsyncMock(return_value=GalleryPage((), None, True))
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "blacklist": ["watermark"], "credentials": {"danbooru": {}}}
            with patch("nodes.gallery.service.adapter_for", return_value=adapter), patch("nodes.gallery.service.get_gallery_settings_store", return_value=store):
                await service.search("danbooru", "blue_hair", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_args.args[-1], ("watermark",))
                store.load.return_value["blacklist"] = ["text"]
                await service.search("danbooru", "blue_hair", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_count, 2)
                self.assertEqual(adapter.search.await_args.args[-1], ("text",))


class GalleryNodeTests(unittest.IsolatedAsyncioTestCase):
    def test_schema_and_hidden_payload_contract(self):
        self.assertIn(BooruGalleryNode, NODE_CLASSES)
        schema = BooruGalleryNode.define_schema()
        self.assertEqual(schema.node_id, "BooruGalleryNode")
        self.assertEqual(schema.category, "Aaalice/gallery")
        self.assertEqual(schema.inputs, [])
        self.assertEqual([item.id for item in schema.outputs], ["images", "prompts"])
        self.assertTrue(all(item.is_output_list for item in schema.outputs))
        self.assertTrue(schema.accept_all_inputs)
        self.assertEqual(list(inspect.signature(BooruGalleryNode.validate_inputs).parameters), ["gallery_payload"])

    async def test_execute_restores_concurrent_results_to_selection_order(self):
        payload = json.dumps({"version": 1, "prompt": {}, "selections": [selection("2"), selection("1")]})
        class Service:
            execution_bytes = staticmethod(lambda source, post_id, url: delayed_bytes(post_id))
            decode_image = staticmethod(lambda data: data.decode())
        service = Service()
        with patch("nodes.gallery.booru_gallery.get_gallery_service", return_value=service), patch("nodes.gallery.booru_gallery.model_management.throw_exception_if_processing_interrupted"):
            output = await BooruGalleryNode.execute(payload)
        self.assertEqual(output.args[0], ["2", "1"])
        self.assertEqual(len(output.args[1]), 2)

    async def test_single_failure_fails_whole_node(self):
        payload = json.dumps({"version": 1, "prompt": {}, "selections": [selection("1"), selection("2")]})
        class Service:
            @staticmethod
            async def execution_bytes(source, post_id, url):
                if post_id == "2":
                    raise RuntimeError("download failed")
                return b"1"
            decode_image = staticmethod(lambda data: data)
        service = Service()
        with patch("nodes.gallery.booru_gallery.get_gallery_service", return_value=service), patch("nodes.gallery.booru_gallery.model_management.throw_exception_if_processing_interrupted"):
            with self.assertRaisesRegex(RuntimeError, "download failed"):
                await BooruGalleryNode.execute(payload)


async def delayed_bytes(post_id):
    import asyncio
    await asyncio.sleep(0.01 if post_id == "2" else 0)
    return post_id.encode()


if __name__ == "__main__":
    unittest.main()
