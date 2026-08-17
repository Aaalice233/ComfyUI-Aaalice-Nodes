from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.gallery.adapters import DanbooruAdapter


class DanbooruRankingTests(unittest.IsolatedAsyncioTestCase):
    async def test_daily_ranking_uses_latest_completed_day(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[{"id": 7, "preview_file_url": "https://cdn.donmai.us/preview.jpg"}])
        with patch("nodes.gallery.adapters.date") as current_date:
            current_date.today.return_value = date(2026, 8, 17)
            page = await adapter.ranking(None, "day", "3", 20, {})
        url = adapter._get_json.await_args.args[1]
        params = adapter._get_json.await_args.kwargs["params"]
        self.assertTrue(url.endswith("/explore/posts/popular.json"))
        self.assertEqual((params["scale"], params["page"], params["date"]), ("day", 3, "2026-08-16"))
        self.assertEqual(page.page, 3)

    async def test_weekly_ranking_keeps_rolling_period(self):
        adapter = DanbooruAdapter()
        adapter._get_json = AsyncMock(return_value=[])
        await adapter.ranking(None, "week", None, 20, {})
        params = adapter._get_json.await_args.kwargs["params"]
        self.assertNotIn("date", params)
