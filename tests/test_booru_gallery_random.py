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

    async def test_danbooru_random_search_uses_sampling_metatag_instead_of_full_sort(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[])
        await adapter.search(None, "blue_hair", ["general"], "random", None, 60, {})
        tags = adapter._get_json.await_args.kwargs["params"]["tags"]
        self.assertEqual(tags, "blue_hair rating:general random:60")
        self.assertNotIn("order:random", tags)

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
