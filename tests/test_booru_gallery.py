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
from nodes.gallery.adapters import AITagAdapter, DanbooruAdapter, GalleryPage, GalleryUpstreamTimeoutError, GelbooruAdapter, SafebooruAdapter, adapter_for
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

    def test_output_filter_tags_strip_prompts_without_hiding_posts(self):
        selected, options = parse_gallery_payload(json.dumps({"version": 1, "prompt": {
            "outputFilterTags": ["watermark", "series_a"],
        }, "selections": [selection()]}))
        self.assertEqual(options.excluded_tags, ())
        self.assertEqual(compose_prompt(selected[0], options), "hero_(series), blue_hair, duplicate")
        _, combined = parse_gallery_payload(json.dumps({"version": 1, "prompt": {
            "excludedTags": ["watermark"], "outputFilterTags": ["series_a"],
        }, "selections": [selection()]}))
        self.assertEqual(compose_prompt(selected[0], combined), "hero_(series), blue_hair, duplicate")


class GalleryAdapterTests(unittest.TestCase):
    def test_capabilities_are_site_specific_and_camel_case(self):
        danbooru = DanbooruAdapter.capabilities.json()
        gelbooru = GelbooruAdapter.capabilities.json()
        safe = SafebooruAdapter.capabilities.json()
        self.assertTrue(danbooru["favoriteWrite"])
        self.assertFalse(gelbooru["favoriteWrite"])
        self.assertFalse(safe["favoriteRead"])
        self.assertEqual(safe["ratings"], ["safe"])
        self.assertEqual(gelbooru["ratings"], ["general", "sensitive", "questionable", "explicit"])
        self.assertTrue(gelbooru["authRequired"])
        self.assertEqual(gelbooru["maxPageSize"], 100)
        self.assertEqual(gelbooru["credentialsUrl"], "https://gelbooru.com/index.php?page=account&s=options")
        self.assertEqual(danbooru["credentialsUrl"], "https://danbooru.donmai.us/settings")
        self.assertEqual(safe["credentialsUrl"], "")
        self.assertEqual(AITagAdapter.capabilities.json()["ratings"], [])
        self.assertEqual(danbooru["rankingPeriods"], ["day", "week", "month"])
        self.assertEqual(AITagAdapter.capabilities.json()["rankingPeriods"], ["month"])
        self.assertTrue(danbooru["pageJump"])
        self.assertTrue(danbooru["tagSearch"])
        self.assertEqual(danbooru["maxSearchTags"], 2)
        self.assertIsNone(gelbooru["maxSearchTags"])

    def test_indexed_page_conversion_is_adapter_owned(self):
        self.assertEqual(DanbooruAdapter().cursor_for_page(7), "7")
        self.assertEqual(GelbooruAdapter().cursor_for_page(7), "6")
        self.assertEqual(SafebooruAdapter().cursor_for_page(1), "0")

    def test_error_response_includes_structured_code_when_available(self):
        from nodes.gallery.routes import _error
        payload = json.loads(_error(GalleryUpstreamTimeoutError("boom")).body)
        self.assertEqual(payload["code"], "upstream_timeout")
        self.assertEqual(payload["error"], "GalleryUpstreamTimeoutError")
        self.assertNotIn("code", json.loads(_error(RuntimeError("boom")).body))

    def test_upstream_query_timeout_raises_structured_error_without_retry(self):
        async def run():
            adapter = DanbooruAdapter()
            response = MagicMock()
            response.status = 500
            response.text = AsyncMock(return_value='{"success":false,"error":"ActiveRecord::QueryCanceled","message":"The database timed out running your query."}')
            response.url = "https://danbooru.donmai.us/posts.json"
            session = MagicMock()
            session.get.return_value.__aenter__ = AsyncMock(return_value=response)
            session.get.return_value.__aexit__ = AsyncMock(return_value=False)
            with self.assertRaises(GalleryUpstreamTimeoutError) as ctx:
                await adapter._get_json(session, "https://danbooru.donmai.us/posts.json")
            self.assertEqual(ctx.exception.code, "upstream_timeout")
            self.assertEqual(session.get.call_count, 1)
        import asyncio
        asyncio.run(run())

    def test_http_errors_do_not_expose_api_credentials(self):
        async def run():
            adapter = GelbooruAdapter()
            response = MagicMock()
            response.status = 401
            response.text = AsyncMock(return_value="Unauthorized")
            response.url = "https://gelbooru.com/index.php?page=dapi&api_key=secret&user_id=42"
            session = MagicMock()
            session.get.return_value.__aenter__ = AsyncMock(return_value=response)
            session.get.return_value.__aexit__ = AsyncMock(return_value=False)
            with self.assertRaisesRegex(RuntimeError, r"gelbooru GET https://gelbooru.com/index.php HTTP 401") as ctx:
                await adapter._get_json(session, "https://gelbooru.com/index.php")
            self.assertNotIn("secret", str(ctx.exception))
            self.assertNotIn("user_id", str(ctx.exception))
        import asyncio
        asyncio.run(run())

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

    def test_danbooru_blacklist_stays_local_and_exactly_filters_lightweight_results(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "tag_string": "blue_hair watermark", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
                {"id": 8, "tag_string": "blue_hair text_focus", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
            ])
            page = await adapter.search(None, "blue_hair", [], "latest", None, 20, {}, ("WATERMARK", "text"))
            params = adapter._get_json.await_args.kwargs["params"]
            self.assertEqual(params["tags"], "blue_hair")
            self.assertEqual([post.post_id for post in page.posts], ["8"])
            self.assertEqual(page.warnings, ("local-blacklist-filtered",))
        import asyncio
        asyncio.run(run())

    def test_danbooru_rating_filter_is_enforced_on_returned_posts(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "rating": "g", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
                {"id": 8, "rating": "e", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
            ])
            page = await adapter.search(None, "", ["general"], "latest", None, 20, {})
            self.assertEqual([post.post_id for post in page.posts], ["7"])
            self.assertIn("rating:general", adapter._get_json.await_args.kwargs["params"]["tags"])
        import asyncio
        asyncio.run(run())

    def test_gelbooru_uses_current_ratings_and_filters_multiple_values_locally(self):
        async def run():
            adapter = GelbooruAdapter()
            adapter._get_json = AsyncMock(return_value={"post": [
                {"id": 7, "rating": "general", "preview_url": "https://gelbooru.com/7.jpg"},
                {"id": 8, "rating": "sensitive", "preview_url": "https://gelbooru.com/8.jpg"},
                {"id": 9, "rating": "explicit", "preview_url": "https://gelbooru.com/9.jpg"},
            ]})
            credentials = {"userId": "42", "apiKey": "secret"}
            page = await adapter.search(None, "1girl", ["general", "sensitive"], "latest", None, 20, credentials)
            self.assertEqual([post.post_id for post in page.posts], ["7", "8"])
            self.assertNotIn("rating:", adapter._get_json.await_args.kwargs["params"]["tags"])
            await adapter.search(None, "1girl", ["general"], "latest", None, 20, credentials)
            self.assertIn("rating:general", adapter._get_json.await_args.kwargs["params"]["tags"])
        import asyncio
        asyncio.run(run())

    def test_gelbooru_family_blacklist_is_not_sent_to_the_site(self):
        async def run():
            for adapter, credentials in ((GelbooruAdapter(), {"userId": "42", "apiKey": "secret"}), (SafebooruAdapter(), {})):
                adapter._get_json = AsyncMock(return_value={"post": [
                    {"id": 7, "tags": "1girl watermark", "preview_url": "https://gelbooru.com/7.jpg"},
                    {"id": 8, "tags": "1girl solo", "preview_url": "https://gelbooru.com/8.jpg"},
                ]})
                page = await adapter.search(None, "1girl", [], "latest", None, 20, credentials, ("watermark",))
                self.assertEqual(adapter._get_json.await_args.kwargs["params"]["tags"], "1girl")
                self.assertEqual([post.post_id for post in page.posts], ["8"])
                self.assertIn("local-blacklist-filtered", page.warnings)
        import asyncio
        asyncio.run(run())

    def test_danbooru_flags_anonymous_pages_with_all_media_hidden(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "rating": "e", "file_ext": "jpg"},
                {"id": 8, "rating": "q", "file_ext": "jpg"},
            ])
            page = await adapter.search(None, "loli", [], "latest", None, 20, {})
            self.assertEqual(page.posts, ())
            self.assertTrue(page.ended)
            self.assertIsNone(page.next_cursor)
            self.assertEqual(page.warnings, ("restricted-media-hidden",))
        import asyncio
        asyncio.run(run())

    def test_danbooru_keeps_pages_with_visible_media(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "rating": "e", "file_ext": "jpg"},
                {"id": 8, "rating": "s", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
            ])
            page = await adapter.search(None, "1girl", [], "latest", None, 20, {})
            self.assertEqual([post.post_id for post in page.posts], ["7", "8"])
            self.assertEqual(page.warnings, ())
            self.assertTrue(page.ended)
        import asyncio
        asyncio.run(run())

    def test_danbooru_omits_video_posts_before_they_reach_the_gallery(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"id": 7, "file_ext": "jpg", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
                {"id": 8, "file_ext": "mp4", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
                {"id": 9, "file_ext": "webm", "preview_file_url": "https://cdn.donmai.us/9.jpg"},
                {"id": 10, "file_ext": "gif", "preview_file_url": "https://cdn.donmai.us/10.jpg"},
            ])
            page = await adapter.search(None, "", [], "latest", None, 20, {})
            self.assertEqual([post.post_id for post in page.posts], ["7", "10"])
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

    def test_gelbooru_accepts_the_credential_fragment_from_its_account_page(self):
        fragment = "&api_key=secret&user_id=42"
        self.assertEqual(GelbooruAdapter().auth_params({"apiKey": fragment}), {"api_key": "secret", "user_id": "42"})
        self.assertEqual(GelbooruAdapter().auth_params({"apiKey": fragment, "userId": "84"}), {"api_key": "secret", "user_id": "84"})

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
            self.assertIn("local-blacklist-filtered", search_page.warnings)
            self.assertIn("local-blacklist-filtered", ranking_page.warnings)
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
        gelbooru = adapter_for("gelbooru")
        gelbooru.validate_media_url("https://img4.gelbooru.com/samples/a.jpg")
        self.assertEqual(gelbooru.media_request_headers(), {"Referer": "https://gelbooru.com/"})

    def test_safebooru_tag_index_parses_xml_despite_json_param(self):
        async def run():
            adapter = SafebooruAdapter()
            class FakeXmlResponse:
                def __init__(self, body):
                    self.status = 200
                    self.text = AsyncMock(return_value=body)
                    self.url = "https://safebooru.org/index.php"
                async def __aenter__(self):
                    return self
                async def __aexit__(self, *_args):
                    return False
            def get_side_effect(_url, **kwargs):
                name = kwargs["params"]["name"]
                tag_type = {"artist_a": 1, "hero_(series)": 4, "blue_hair": 0}.get(name)
                body = f'<?xml version="1.0"?><tags><tag type="{tag_type}" name="{name}"/></tags>' if tag_type is not None else '<?xml version="1.0"?><tags/>'
                return FakeXmlResponse(body)
            session = MagicMock()
            session.get.side_effect = get_side_effect
            classified = await adapter.classify_tags(session, ["artist_a", "hero_(series)", "blue_hair", "unknown_tag"], {})
            self.assertEqual(classified["artist"], ("artist_a",))
            self.assertEqual(classified["character"], ("hero_(series)",))
            self.assertEqual(classified["general"], ("blue_hair", "unknown_tag"))
            params = session.get.call_args.kwargs["params"]
            self.assertIn("name", params)
            self.assertNotIn("json", params)
            known = await adapter.known_tags(session, ["artist_a", "missing"], {})
            self.assertEqual(known, frozenset({"artist_a"}))
        import asyncio
        asyncio.run(run())

    def test_safebooru_tag_rate_limit_breaks_the_batch(self):
        async def run():
            adapter = SafebooruAdapter()
            class FakeNotFound:
                status = 404
                url = "https://safebooru.org/index.php"
                async def __aenter__(self):
                    return self
                async def __aexit__(self, *_args):
                    return False
                async def text(self):
                    return ""
            session = MagicMock()
            session.get.return_value = FakeNotFound()
            printed = []
            with patch("asyncio.sleep", new=AsyncMock()), patch("builtins.print", side_effect=lambda *args, **kwargs: printed.append(" ".join(str(item) for item in args))):
                classified = await adapter.classify_tags(session, [f"tag_{index}" for index in range(8)], {})
            # 批内 6 个标签每标签 404 重试一次共 12 次请求后熔断，剩余 2 个不再请求。
            self.assertEqual(session.get.call_count, 12)
            self.assertEqual(classified["general"], tuple(f"tag_{index}" for index in range(8)))
            self.assertEqual(len(printed), 1)
            self.assertIn("rate-limited", printed[0])
        import asyncio
        asyncio.run(run())

    def test_rate_limited_json_retries_with_backoff_then_succeeds(self):
        async def run():
            adapter = DanbooruAdapter()
            def make_response(status, body, payload=None):
                response = MagicMock()
                response.status = status
                response.headers = {"Retry-After": "0"}
                response.text = AsyncMock(return_value=body)
                response.json = AsyncMock(return_value=payload)
                response.url = "https://danbooru.donmai.us/posts.json"
                return response
            limited = make_response(404, "not found")
            ok = make_response(200, '[{"id": 7}]', [{"id": 7}])
            session = MagicMock()
            session.get.return_value.__aenter__ = AsyncMock(side_effect=[limited, ok])
            session.get.return_value.__aexit__ = AsyncMock(return_value=False)
            raw = await adapter._get_json(session, "https://danbooru.donmai.us/posts.json")
            self.assertEqual(raw, [{"id": 7}])
            self.assertEqual(session.get.return_value.__aenter__.await_count, 2)
        import asyncio
        asyncio.run(run())

    def test_abuse_limited_xml_retries_instead_of_invalid_json(self):
        async def run():
            adapter = DanbooruAdapter()
            def make_response(body, payload=None):
                response = MagicMock()
                response.status = 200
                response.headers = {"Retry-After": "0"}
                response.text = AsyncMock(return_value=body)
                response.json = AsyncMock(return_value=payload)
                response.url = "https://danbooru.donmai.us/posts.json"
                return response
            limited = make_response('<response success="false" reason="API limited due to abuse."/>')
            ok = make_response('[{"id": 7}]', [{"id": 7}])
            session = MagicMock()
            session.get.return_value.__aenter__ = AsyncMock(side_effect=[limited, ok])
            session.get.return_value.__aexit__ = AsyncMock(return_value=False)
            raw = await adapter._get_json(session, "https://danbooru.donmai.us/posts.json")
            self.assertEqual(raw, [{"id": 7}])
        import asyncio
        asyncio.run(run())

    def test_persistent_rate_limit_fails_with_readable_error(self):
        async def run():
            adapter = DanbooruAdapter()
            response = MagicMock()
            response.status = 404
            response.headers = {"Retry-After": "0"}
            response.text = AsyncMock(return_value="not found")
            response.url = "https://danbooru.donmai.us/posts.json"
            session = MagicMock()
            session.get.return_value.__aenter__ = AsyncMock(return_value=response)
            session.get.return_value.__aexit__ = AsyncMock(return_value=False)
            with self.assertRaisesRegex(RuntimeError, "rate-limiting requests"):
                await adapter._get_json(session, "https://danbooru.donmai.us/posts.json")
        import asyncio
        asyncio.run(run())

    def test_summaries_carry_hover_metadata_and_sample_url(self):
        danbooru = DanbooruAdapter()._summary({"id": 7, "preview_file_url": "https://cdn.donmai.us/preview.jpg", "large_file_url": "https://cdn.donmai.us/sample.jpg", "image_width": 1, "image_height": 1, "score": 42, "fav_count": 9})
        gelbooru = GelbooruAdapter()._summary({"id": 7, "preview_url": "https://gelbooru.com/preview.jpg", "sample_url": "https://img3.gelbooru.com/sample.jpg", "width": 1, "height": 1, "score": 17})
        safe = SafebooruAdapter()._summary({"id": 7, "preview_url": "https://safebooru.org/preview.jpg", "sample_url": "https://safebooru.org/sample.jpg", "width": 1, "height": 1, "score": 5})
        aitag = AITagAdapter()._summary({"id": 7})
        self.assertEqual(danbooru.json()["sampleUrl"], "https://cdn.donmai.us/sample.jpg")
        self.assertEqual(gelbooru.json()["sampleUrl"], "https://img3.gelbooru.com/sample.jpg")
        self.assertEqual(safe.json()["sampleUrl"], "https://safebooru.org/sample.jpg")
        self.assertEqual(aitag.json()["sampleUrl"], "")
        self.assertEqual(danbooru.json()["score"], 42)
        self.assertEqual(danbooru.json()["favCount"], 9)
        self.assertEqual(gelbooru.json()["score"], 17)
        self.assertEqual(safe.json()["score"], 5)
        page = GalleryPage((danbooru,), None, True)
        self.assertEqual(page.json()["posts"][0]["sampleUrl"], "https://cdn.donmai.us/sample.jpg")

    def test_unsupported_favorite_write_fails_explicitly(self):
        async def run():
            with self.assertRaisesRegex(ValueError, "does not support favorite writing"):
                await adapter_for("gelbooru").set_favorite(None, "1", True, {})
        import asyncio
        asyncio.run(run())


class GalleryQueryNormalizationTests(unittest.TestCase):
    def test_danbooru_repairs_spaced_tags_and_trailing_commas(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[{"name": "red_hair", "category": 0, "post_count": 50}])
            normalized = await adapter.normalize_tag_query(None, "red hair,", {})
            self.assertEqual(normalized, "red_hair")
            params = adapter._get_json.await_args.kwargs["params"]
            self.assertIn("red_hair", params["search[name_comma]"])
        import asyncio
        asyncio.run(run())

    def test_danbooru_keeps_valid_native_multi_tag_queries(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[{"name": "1girl", "category": 0, "post_count": 100}, {"name": "solo", "category": 0, "post_count": 100}, {"name": "1girl_solo", "category": 0, "post_count": 100}])
            normalized = await adapter.normalize_tag_query(None, "1girl solo", {})
            self.assertEqual(normalized, "1girl solo")
        import asyncio
        asyncio.run(run())

    def test_danbooru_dead_tags_do_not_block_spaced_tag_repair(self):
        async def run():
            adapter = DanbooruAdapter()
            adapter._get_json = AsyncMock(return_value=[
                {"name": "blue_archive", "category": 3, "post_count": 440229},
                {"name": "archive", "category": 0, "post_count": 0},
                {"name": "blue", "category": 0, "post_count": 0, "is_deprecated": True},
            ])
            normalized = await adapter.normalize_tag_query(None, "blue archive, ", {})
            self.assertEqual(normalized, "blue_archive")
        import asyncio
        asyncio.run(run())

    def test_gelbooru_known_tags_reads_dict_response(self):
        async def run():
            adapter = GelbooruAdapter()
            adapter._get_json = AsyncMock(return_value={"tag": [{"name": "red_hair", "type": 0, "count": 10}]})
            credentials = {"userId": "u", "apiKey": "k"}
            known = await adapter.known_tags(None, ["red_hair"], credentials)
            self.assertEqual(known, frozenset({"red_hair"}))
        import asyncio
        asyncio.run(run())

    def test_aitag_keeps_free_text_untouched(self):
        async def run():
            adapter = AITagAdapter()
            self.assertEqual(await adapter.normalize_tag_query(None, " hatsune miku, smiling ,", {}), "hatsune miku, smiling ,".strip())
        import asyncio
        asyncio.run(run())

    def test_credential_requirement_follows_auth_required_capability(self):
        SafebooruAdapter().require_credentials({})
        with self.assertRaisesRegex(ValueError, "User ID and API Key"):
            GelbooruAdapter().require_credentials({})


class GallerySettingsTests(unittest.TestCase):
    def test_selection_stamp_is_global_persisted_and_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            self.assertEqual(store.load()["selectionStamp"], "quarantineQualified")
            self.assertEqual(store.save({"selectionStamp": "nationwideFlight"})["selectionStamp"], "nationwideFlight")
            self.assertEqual(GallerySettingsStore(store.path).load()["selectionStamp"], "nationwideFlight")
            self.assertEqual(store.save({"selectionStamp": "quarantineQualified"})["selectionStamp"], "quarantineQualified")
            with self.assertRaisesRegex(ValueError, "selectionStamp is invalid"):
                store.save({"selectionStamp": "unknown"})

    def test_legacy_default_ratings_are_not_exposed_or_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            path = store.path
            value = default_settings()
            value["defaultRatings"] = {"danbooru": ["explicit"]}
            path.write_text(json.dumps(value), encoding="utf-8")
            self.assertNotIn("defaultRatings", store.load())
            self.assertNotIn("defaultRatings", store.save({"defaultRatings": {"danbooru": ["explicit"]}}))

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

    def test_gelbooru_fragment_save_preserves_danbooru_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            store.save({"credentials": {"danbooru": {"username": "alice", "apiKey": "danbooru-secret"}}})
            public = store.save({"credentials": {
                "danbooru": {"username": "", "apiKey": ""},
                "gelbooru": {"userId": "", "apiKey": "&api_key=gelbooru-secret&user_id=42"},
            }})
            credentials = store.load()["credentials"]
            self.assertEqual(credentials["danbooru"], {"username": "alice", "apiKey": "danbooru-secret"})
            self.assertEqual(credentials["gelbooru"], {"userId": "42", "apiKey": "gelbooru-secret"})
            self.assertTrue(public["credentialStatus"]["danbooru"]["hasApiKey"])
            self.assertTrue(public["credentialStatus"]["gelbooru"]["hasApiKey"])
            persisted = store.path.read_text(encoding="utf-8")
            self.assertNotIn("&api_key=", persisted)
            self.assertNotIn("&user_id=", persisted)

    def test_blacklist_is_trimmed_deduplicated_and_kept_out_of_workflows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gallery.json"
            store = GallerySettingsStore(path)
            public = store.save({"blacklist": [" watermark ", "text", "watermark", ""]})
            self.assertEqual(public["blacklist"], ["watermark", "text"])
            workflow = {"nodes": [{"type": "BooruGalleryNode", "properties": {"booruGalleryState": {"version": 1}}}]}
            reloaded = GallerySettingsStore(path)
            self.assertEqual(reloaded.load()["blacklist"], ["watermark", "text"])
            self.assertNotIn("blacklist", json.dumps(workflow))

    def test_legacy_combined_blacklist_values_split_every_supported_separator(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gallery.json"
            value = default_settings()
            value["blacklist"] = ["pokemon、mario_(series)，mihoyo, zenless_zone_zero\nwatermark"]
            path.write_text(json.dumps(value), encoding="utf-8")
            self.assertEqual(GallerySettingsStore(path).load()["blacklist"],
                             ["pokemon", "mario_(series)", "mihoyo", "zenless_zone_zero", "watermark"])

    def test_legacy_prompt_exclusions_migrate_into_the_single_global_blacklist(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gallery.json"
            value = default_settings()
            value["blacklist"] = ["watermark"]
            value["promptDefaults"]["excludedTags"] = ["text_focus", "watermark"]
            path.write_text(json.dumps(value), encoding="utf-8")
            loaded = GallerySettingsStore(path).load()
            self.assertEqual(loaded["blacklist"], ["watermark", "text_focus"])
            self.assertNotIn("excludedTags", loaded["promptDefaults"])

    def test_output_filter_tags_are_persisted_validated_and_independent_from_blacklist(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GallerySettingsStore(Path(directory) / "gallery.json")
            self.assertEqual(store.load()["outputFilterTags"], [])
            public = store.save({"outputFilterTags": [" watermark ", "artist_a", "watermark", ""]})
            self.assertEqual(public["outputFilterTags"], ["watermark", "artist_a"])
            self.assertEqual(public["blacklist"], [])
            reloaded = GallerySettingsStore(store.path)
            self.assertEqual(reloaded.load()["outputFilterTags"], ["watermark", "artist_a"])
            self.assertEqual(reloaded.load()["blacklist"], [])


class GalleryServiceTests(unittest.IsolatedAsyncioTestCase):
    @patch("nodes.gallery.service.MediaProxy")
    async def test_gelbooru_media_uses_its_required_referer(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            service._media.fetch_media = AsyncMock(return_value=(b"image", "image/jpeg", "https://img4.gelbooru.com/a.jpg"))
            await service.fetch_media("gelbooru", "https://img4.gelbooru.com/a.jpg")
            self.assertEqual(service._media.fetch_media.await_args.args[3], {"Referer": "https://gelbooru.com/"})

    @patch("nodes.gallery.service.MediaProxy")
    async def test_ranking_applies_ratings_and_separates_cache_entries(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            adapter = DanbooruAdapter()
            posts = (
                adapter._summary({"id": 1, "rating": "g", "preview_file_url": "https://cdn.donmai.us/1.jpg"}),
                adapter._summary({"id": 2, "rating": "e", "preview_file_url": "https://cdn.donmai.us/2.jpg"}),
            )
            adapter.ranking = AsyncMock(return_value=GalleryPage(posts, None, True))
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "blacklist": [], "credentials": {"danbooru": {}}}
            with patch("nodes.gallery.service.adapter_for", return_value=adapter), patch("nodes.gallery.service.get_gallery_settings_store", return_value=store):
                general = await service.ranking("danbooru", "week", ["general"], None, 60)
                explicit = await service.ranking("danbooru", "week", ["explicit"], None, 60)
                self.assertEqual([post["postId"] for post in general["posts"]], ["1"])
                self.assertEqual([post["postId"] for post in explicit["posts"]], ["2"])
                self.assertEqual(adapter.ranking.await_count, 2)

    @patch("nodes.gallery.service.MediaProxy")
    async def test_service_injects_blacklist_into_adapter_and_cache_identity(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            adapter = DanbooruAdapter()
            adapter.search = AsyncMock(return_value=GalleryPage((), None, True))
            adapter.normalize_tag_query = AsyncMock(side_effect=lambda _session, query, _credentials: query.strip())
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "blacklist": ["watermark"], "credentials": {"danbooru": {}}}
            with patch("nodes.gallery.service.adapter_for", return_value=adapter), patch("nodes.gallery.service.get_gallery_settings_store", return_value=store):
                await service.search("danbooru", "blue_hair", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_args.args[-1], ("watermark",))
                store.load.return_value["blacklist"] = ["text"]
                await service.search("danbooru", "blue_hair", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_count, 2)
                self.assertEqual(adapter.search.await_args.args[-1], ("text",))

    @patch("nodes.gallery.service.MediaProxy")
    async def test_service_normalizes_query_before_adapter_and_shares_cache(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            adapter = DanbooruAdapter()
            adapter.search = AsyncMock(return_value=GalleryPage((), None, True))
            adapter.known_tags = AsyncMock(return_value=frozenset({"red_hair"}))
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "blacklist": [], "credentials": {"danbooru": {}}}
            with patch("nodes.gallery.service.adapter_for", return_value=adapter), patch("nodes.gallery.service.get_gallery_settings_store", return_value=store):
                await service.search("danbooru", "red hair,", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_args.args[1], "red_hair")
                await service.search("danbooru", " red  hair , ", [], "latest", None, 60)
                self.assertEqual(adapter.search.await_count, 1)

    @patch("nodes.gallery.service.MediaProxy")
    async def test_execution_bytes_writes_and_reuses_the_originals_cache(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            url = "https://cdn.donmai.us/original/11/aa.jpg"
            service._media.fetch_media = AsyncMock(return_value=(b"image-bytes", "image/jpeg", url))
            first = await service.execution_bytes("danbooru", "post-1", url)
            second = await service.execution_bytes("danbooru", "post-1", url)
            self.assertEqual(first, b"image-bytes")
            self.assertEqual(second, first)
            self.assertEqual(service._media.fetch_media.await_count, 1)
            path = service._cache_path("danbooru", "post-1", url)
            self.assertTrue(path.exists())
            self.assertEqual(path.read_bytes(), first)
            self.assertEqual(path.parent.name, "danbooru")

    @patch("nodes.gallery.service.MediaProxy")
    async def test_execution_cache_path_sanitizes_post_ids_and_stays_source_scoped(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            path = service._cache_path("gelbooru", "post/../id", "https://img3.gelbooru.com/1.jpg")
            self.assertIn("gelbooru", path.parts)
            self.assertNotIn("..", path.name)
            self.assertTrue(path.name.endswith(".bin"))
            self.assertNotEqual(
                service._cache_path("danbooru", "post-1", "https://cdn.donmai.us/1.jpg"),
                service._cache_path("gelbooru", "post-1", "https://img3.gelbooru.com/1.jpg"),
            )


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
