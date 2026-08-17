from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from multidict import MultiDict

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.gallery.adapters import AITagAdapter, DanbooruAdapter, GalleryPage, GelbooruAdapter
from nodes.gallery import routes
from nodes.gallery.random_sampling import sample_favorites, sample_ranking, sample_search
from nodes.gallery.service import GalleryService, TTLCache


class GalleryRandomSamplingTests(unittest.IsolatedAsyncioTestCase):
    async def test_random_is_a_mode_not_a_duplicate_collection_sort(self):
        self.assertNotIn("random", DanbooruAdapter.capabilities.sort_values)

    async def test_native_random_search_passes_blacklist_without_result_caching(self):
        adapter = DanbooruAdapter()
        adapter.search = AsyncMock(return_value=GalleryPage((), None, True))
        result = await sample_search(adapter, None, "blue_hair", ["general"], 60, {}, ("watermark",), TTLCache(8, 300))
        self.assertIsInstance(result, GalleryPage)
        args = adapter.search.await_args.args
        self.assertEqual((args[3], args[4]), ("random", None))
        self.assertEqual(args[-1], ("watermark",))

    async def test_danbooru_two_tag_search_keeps_both_slots_and_sends_free_rating_metatag(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[
            {"id": 7, "rating": "g", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
            {"id": 8, "rating": "e", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
        ])
        for credentials in ({}, {"username": "member", "apiKey": "secret"}):
            page = await adapter.search(None, "original fantasy", ["general"], "latest", None, 20, credentials)
            self.assertEqual(adapter._get_json.await_args.kwargs["params"]["tags"], "original fantasy rating:general")
            self.assertEqual([post.post_id for post in page.posts], ["7"])

    async def test_danbooru_id_cursor_uses_indexed_pagination(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[])
        credentials = {"username": "member", "apiKey": "secret"}
        page = await adapter.search_id_cursor(None, "original fantasy", ["general"], "a0", 60, credentials)
        self.assertEqual(page.page, 1)
        self.assertEqual(adapter._get_json.await_args.kwargs["params"], {
            "tags": "original fantasy rating:general",
            "page": "a0",
            "limit": 60,
            "login": "member",
            "api_key": "secret",
        })
        with self.assertRaisesRegex(ValueError, "post id cursor is invalid"):
            await adapter.search_id_cursor(None, "original fantasy", ["general"], "1000", 60, credentials)

    async def test_danbooru_native_random_keeps_rating_and_applies_local_filters(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[
            {"id": 7, "rating": "g", "preview_file_url": "https://cdn.donmai.us/7.jpg"},
            {"id": 8, "rating": "e", "preview_file_url": "https://cdn.donmai.us/8.jpg"},
            {"id": 9, "rating": "g", "tag_string": "watermark", "preview_file_url": "https://cdn.donmai.us/9.jpg"},
        ])
        page = await adapter.search(None, "blue_hair", ["general"], "random", None, 60, {}, ("watermark",))
        tags = adapter._get_json.await_args.kwargs["params"]["tags"]
        self.assertEqual(tags, "blue_hair rating:general random:60")
        self.assertNotIn("order:random", tags)
        self.assertEqual([post.post_id for post in page.posts], ["7"])
        self.assertIn("local-blacklist-filtered", page.warnings)

    async def test_danbooru_two_tag_random_search_uses_cached_id_bounds(self):
        latest = GalleryPage((SimpleNamespace(post_id="1000"),), None, True)
        oldest = GalleryPage((SimpleNamespace(post_id="100"),), None, True)
        sampled = GalleryPage((SimpleNamespace(post_id="500"),), None, True)
        for credentials in ({}, {"username": "member", "apiKey": "secret"}):
            with self.subTest(credentials=credentials):
                adapter = DanbooruAdapter()
                adapter.search = AsyncMock(return_value=latest)
                adapter.search_id_cursor = AsyncMock(side_effect=(oldest, sampled, sampled))
                cache = TTLCache(8, 300)
                with patch("nodes.gallery.random_sampling.secrets.randbelow", return_value=399):
                    first = await sample_search(adapter, None, "original   fantasy", ["general"], 30, credentials, ("blocked",), cache)
                    second = await sample_search(adapter, None, "original fantasy", ["general"], 30, credentials, ("blocked",), cache)
                self.assertIs(first, sampled)
                self.assertIs(second, sampled)
                adapter.search.assert_awaited_once_with(None, "original fantasy", ["general"], "latest", "1", 60, credentials, ())
                self.assertEqual([call.args[3] for call in adapter.search_id_cursor.await_args_list], ["a0", "b500", "b500"])
                self.assertEqual(adapter.search_id_cursor.await_args_list[0].args[4:], (60, credentials, ()))
                self.assertEqual(adapter.search_id_cursor.await_args_list[-1].args[4:], (30, credentials, ("blocked",)))

    async def test_danbooru_id_bounds_are_isolated_by_rating_and_account(self):
        latest = GalleryPage((SimpleNamespace(post_id="1000"),), None, True)
        oldest = GalleryPage((SimpleNamespace(post_id="100"),), None, True)
        sampled = GalleryPage((SimpleNamespace(post_id="500"),), None, True)
        adapter = DanbooruAdapter()
        adapter.search = AsyncMock(return_value=latest)
        adapter.search_id_cursor = AsyncMock(side_effect=(oldest, sampled, sampled, oldest, sampled, oldest, sampled))
        cache = TTLCache(8, 300)
        alice = {"username": "Alice", "apiKey": "first"}
        bob = {"username": "Bob", "apiKey": "second"}
        cases = (
            ("original   fantasy", ["general"], alice),
            ("original fantasy", ["general"], alice),
            ("original fantasy", ["sensitive"], alice),
            ("original fantasy", ["general"], bob),
        )
        with patch("nodes.gallery.random_sampling.secrets.randbelow", return_value=399):
            for query, ratings, credentials in cases:
                await sample_search(adapter, None, query, ratings, 60, credentials, (), cache)
        self.assertEqual(adapter.search.await_count, 3)
        self.assertEqual([call.args[3] for call in adapter.search_id_cursor.await_args_list].count("a0"), 3)

    async def test_danbooru_empty_cursor_result_falls_back_to_filtered_latest_page(self):
        latest_probe = GalleryPage((SimpleNamespace(post_id="1000"),), None, True)
        filtered_latest = GalleryPage((SimpleNamespace(post_id="999"),), None, True)
        oldest = GalleryPage((SimpleNamespace(post_id="100"),), None, True)
        adapter = DanbooruAdapter()
        adapter.search = AsyncMock(side_effect=(latest_probe, filtered_latest))
        adapter.search_id_cursor = AsyncMock(side_effect=(oldest, GalleryPage((), None, True)))
        with patch("nodes.gallery.random_sampling.secrets.randbelow", return_value=399):
            result = await sample_search(
                adapter, None, "original fantasy", ["general"], 60, {}, ("blocked",), TTLCache(8, 300),
            )
        self.assertIs(result, filtered_latest)
        self.assertEqual(adapter.search.await_args_list[0].args[-1], ())
        self.assertEqual(adapter.search.await_args_list[1].args[-1], ("blocked",))

    async def test_danbooru_rejects_queries_above_the_public_tag_limit(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[])
        with self.assertRaisesRegex(ValueError, "at most 2 public search tags"):
            await adapter.search(None, "one two three", [], "latest", None, 60, {"username": "member", "apiKey": "secret"})
        adapter._get_json.assert_not_awaited()

    async def test_aitag_random_search_samples_all_pages_and_caches_only_total_count(self):
        adapter = AITagAdapter()
        adapter.search = AsyncMock(side_effect=[
            GalleryPage((), "2", False, page=1, total=121),
            GalleryPage((), "3", False, page=2, total=121),
            GalleryPage((), None, True, page=3, total=121),
        ])
        cache = TTLCache(8, 300)
        with patch("nodes.gallery.random_sampling.secrets.randbelow", side_effect=[1, 2]):
            first = await sample_search(adapter, None, "portrait", [], 60, {}, ("watermark",), cache)
            second = await sample_search(adapter, None, "portrait", [], 60, {}, ("watermark",), cache)
        self.assertEqual((first.page, second.page), (2, 3))
        self.assertEqual([call.args[4] for call in adapter.search.await_args_list], ["1", "2", "3"])
        self.assertEqual(adapter.search.await_count, 3)

    async def test_aitag_adapters_expose_upstream_totals_for_page_sampling(self):
        adapter = AITagAdapter()
        adapter._get_json = AsyncMock(return_value={"items": [], "total": 121})
        search_page = await adapter.search(None, "portrait", [], "new", "1", 60, {})
        ranking_page = await adapter.ranking(None, "month", "1", 60, {})
        self.assertEqual((search_page.total, ranking_page.total), (121, 121))

    async def test_random_ranking_and_favorites_keep_feed_specific_contracts(self):
        ranking_adapter = DanbooruAdapter()
        ranking_adapter.ranking = AsyncMock(return_value=GalleryPage((), None, True))
        await sample_ranking(ranking_adapter, None, "week", [], 60, {}, ("blocked",), TTLCache(8, 300))
        self.assertIsNone(ranking_adapter.ranking.await_args.args[2])
        self.assertEqual(ranking_adapter.ranking.await_args.args[-1], ("blocked",))

        favorite_adapter = DanbooruAdapter()
        favorite_adapter.search = AsyncMock(return_value=GalleryPage((), None, True))
        await sample_favorites(favorite_adapter, None, 60, {"username": "alice"}, ("blocked",))
        args = favorite_adapter.search.await_args.args
        self.assertEqual((args[1], args[3], args[4]), ("ordfav:alice", "random", None))
        self.assertEqual(args[-1], ("blocked",))

    async def test_gelbooru_random_sort_uses_its_native_random_metatag(self):
        adapter = GelbooruAdapter()
        adapter._get_json = AsyncMock(return_value={"post": []})
        await adapter.search(None, "blue_hair", [], "random", None, 60, {"userId": "42", "apiKey": "secret"})
        self.assertEqual(adapter._get_json.await_args.kwargs["params"]["tags"], "blue_hair sort:random")


class GalleryRandomRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_browse_routes_forward_explicit_random_mode(self):
        service = MagicMock()
        service.search = AsyncMock(return_value={"posts": []})
        service.ranking = AsyncMock(return_value={"posts": []})
        service.favorites = AsyncMock(return_value={"posts": []})
        cases = (
            (routes.search, service.search, {"source": "danbooru", "random": "1"}),
            (routes.ranking, service.ranking, {"source": "danbooru", "period": "week", "random": "1"}),
            (routes.favorites, service.favorites, {"source": "danbooru", "random": "1"}),
        )
        with patch("nodes.gallery.routes.get_gallery_service", return_value=service):
            for handler, method, query in cases:
                with self.subTest(handler=handler.__name__):
                    response = await handler(SimpleNamespace(query=MultiDict(query)))
                    self.assertEqual(response.status, 200)
                    self.assertIs(method.await_args.args[-1], True)


class GalleryRandomServiceTests(unittest.IsolatedAsyncioTestCase):
    @patch("nodes.gallery.service.MediaProxy")
    async def test_random_search_bypasses_result_cache_but_reuses_query_normalization(self, _media_cls):
        with tempfile.TemporaryDirectory() as directory:
            service = GalleryService(Path(directory))
            adapter = DanbooruAdapter()
            adapter.normalize_tag_query = AsyncMock(return_value="blue_hair")
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "blacklist": ["watermark"], "credentials": {"danbooru": {}}}
            sampled = AsyncMock(side_effect=[GalleryPage((), None, True), GalleryPage((), None, True)])
            with patch("nodes.gallery.service.adapter_for", return_value=adapter), patch("nodes.gallery.service.get_gallery_settings_store", return_value=store), patch("nodes.gallery.service.sample_search", sampled):
                await service.search("danbooru", "blue hair", [], "latest", None, 60, random_mode=True)
                await service.search("danbooru", "blue hair", [], "latest", None, 60, random_mode=True)
            self.assertEqual(sampled.await_count, 2)
            self.assertEqual(adapter.normalize_tag_query.await_count, 1)
            self.assertEqual(sampled.await_args.args[2], "blue_hair")
            self.assertEqual(sampled.await_args.args[-2], ("watermark",))


if __name__ == "__main__":
    unittest.main()
