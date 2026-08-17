from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.gallery.media import MediaProxy


class FakeMediaResponse:
    def __init__(self, body, status=200, content_type="image/jpeg", delay=0):
        self.status = status
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}
        self.content = self
        self.body = body
        self.delay = delay

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def iter_chunked(self, _size):
        if self.delay:
            await asyncio.sleep(self.delay)
        yield self.body


class FakeMediaSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.gets: list[str] = []
        self.requests: list[tuple[str, dict]] = []

    def get(self, url, **kwargs):
        self.gets.append(url)
        self.requests.append((url, kwargs))
        return self.responses[min(len(self.gets), len(self.responses)) - 1]



class GalleryMediaProxyTests(unittest.IsolatedAsyncioTestCase):
    async def test_cache_round_trip_and_content_type_header(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"image-bytes", content_type="image/webp")])
            with patch.object(proxy, "session", return_value=session):
                data, content_type, final = await proxy.fetch_media("safebooru", "https://cdn.test/a.jpg", lambda _url: None)
            self.assertEqual((data, content_type, final), (b"image-bytes", "image/webp", "https://cdn.test/a.jpg"))
            files = list((Path(directory) / "media").glob("*.bin"))
            self.assertEqual(len(files), 1)
            with patch.object(proxy, "session") as mocked:
                data, content_type, _final = await proxy.fetch_media("safebooru", "https://cdn.test/a.jpg", lambda _url: None)
            mocked.assert_not_called()
            self.assertEqual((data, content_type), (b"image-bytes", "image/webp"))

    async def test_source_media_headers_are_sent_with_the_image_request(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"image")])
            with patch.object(proxy, "session", return_value=session):
                await proxy.fetch_media("gelbooru", "https://img4.gelbooru.com/a.jpg", lambda _url: None, {"Referer": "https://gelbooru.com/"})
            self.assertEqual(session.requests[0][1]["headers"], {"Accept": "image/*", "Referer": "https://gelbooru.com/"})

    async def test_concurrent_same_url_downloads_once(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"x")])
            with patch.object(proxy, "session", return_value=session):
                results = await asyncio.gather(
                    proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None),
                    proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None),
                    proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None),
                )
            self.assertEqual(len(session.gets), 1)
            self.assertEqual([item[0] for item in results], [b"x", b"x", b"x"])

    async def test_failed_download_does_not_write_cache_and_can_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"", status=503), FakeMediaResponse(b"ok")])
            with patch.object(proxy, "session", return_value=session):
                data, _content_type, _final = await proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None)
            self.assertEqual(data, b"ok")
            self.assertEqual(len(session.gets), 2)
            self.assertEqual(len(list((Path(directory) / "media").glob("*.bin"))), 1)

    async def test_persistent_upstream_failure_reports_and_skips_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"", status=503) for _ in range(3)])
            with patch.object(proxy, "session", return_value=session):
                with self.assertRaisesRegex(RuntimeError, "failed after 3 attempts"):
                    await proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None)
            self.assertFalse((Path(directory) / "media").exists())

    async def test_rate_limited_media_retries_but_404_stays_hard(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"", status=429), FakeMediaResponse(b"ok")])
            with patch.object(proxy, "session", return_value=session):
                data, _content_type, _final = await proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None)
            self.assertEqual(data, b"ok")
            self.assertEqual(len(session.gets), 2)
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"", status=404)])
            with patch.object(proxy, "session", return_value=session):
                with self.assertRaisesRegex(RuntimeError, "HTTP 404"):
                    await proxy.fetch_media("danbooru", "https://cdn.test/missing.jpg", lambda _url: None)
            self.assertEqual(len(session.gets), 1)

    async def test_cancelled_waiter_does_not_cancel_shared_download(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"x", delay=0.05)])
            with patch.object(proxy, "session", return_value=session):
                task = asyncio.create_task(proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None))
                await asyncio.sleep(0.01)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                await asyncio.sleep(0.1)
                self.assertEqual(len(list((Path(directory) / "media").glob("*.bin"))), 1)
                self.assertEqual(len(session.gets), 1)

    async def test_redirects_follow_until_final_media(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            moved = FakeMediaResponse(b"", status=302)
            moved.headers["Location"] = "https://cdn.test/final.jpg"
            session = FakeMediaSession([moved, FakeMediaResponse(b"final")])
            with patch.object(proxy, "session", return_value=session):
                data, _content_type, final = await proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None)
            self.assertEqual((data, final), (b"final", "https://cdn.test/final.jpg"))
            self.assertEqual(len(session.gets), 2)

    async def test_prune_trims_oldest_media_and_originals_under_shared_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            store = MagicMock()
            store.load.return_value = {"timeout": 30, "cacheBudgetMiB": 1}
            with patch("nodes.gallery.media.get_gallery_settings_store", return_value=store):
                for name in ("1.jpg", "2.jpg", "3.jpg"):
                    await proxy._write_cache(f"https://cdn.test/{name}", "image/jpeg", b"x" * (384 * 1024))
                originals = Path(directory) / "originals" / "danbooru"
                originals.mkdir(parents=True)
                (originals / "old.bin").write_bytes(b"y" * (384 * 1024))
                os.utime(proxy._cache_path("https://cdn.test/1.jpg"), (100, 100))
                os.utime(proxy._cache_path("https://cdn.test/2.jpg"), (200, 200))
                os.utime(proxy._cache_path("https://cdn.test/3.jpg"), (300, 300))
                os.utime(originals / "old.bin", (400, 400))
                proxy.prune()
            self.assertFalse(proxy._cache_path("https://cdn.test/1.jpg").exists())
            self.assertFalse(proxy._cache_path("https://cdn.test/2.jpg").exists())
            self.assertTrue(proxy._cache_path("https://cdn.test/3.jpg").exists())
            self.assertTrue((originals / "old.bin").exists())

    async def test_large_media_passes_through_without_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"x" * 64)])
            with patch("nodes.gallery.media.MAX_CACHED_BYTES", 16), patch.object(proxy, "session", return_value=session):
                data, _content_type, _final = await proxy.fetch_media("danbooru", "https://cdn.test/big.jpg", lambda _url: None)
            self.assertEqual(len(data), 64)
            self.assertFalse((Path(directory) / "media").exists())

    async def test_session_is_shared_until_timeout_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            store = MagicMock()
            store.load.return_value = {"timeout": 30}
            with patch("nodes.gallery.media.get_gallery_settings_store", return_value=store), patch("nodes.gallery.media.SESSION_RETIRE_SECONDS", 0):
                first = proxy.session()
                self.assertIs(proxy.session(), first)
                self.assertTrue(first.trust_env)
                store.load.return_value = {"timeout": 60}
                second = proxy.session()
                self.assertIsNot(second, first)
                await asyncio.sleep(0.05)
            await proxy.close()
            self.assertEqual(proxy._states, {})

    async def test_sessions_are_scoped_to_the_running_loop(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            store = MagicMock()
            store.load.return_value = {"timeout": 30}
            with patch("nodes.gallery.media.get_gallery_settings_store", return_value=store):
                current = proxy.session()

                def other_loop_session():
                    async def get():
                        session = proxy.session()
                        await session.close()
                        return session
                    return asyncio.run(get())

                other = await asyncio.to_thread(other_loop_session)
                self.assertIsNot(other, current)
                self.assertIs(proxy.session(), current)
            await proxy.close()

    async def test_clear_removes_media_cache_files(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            session = FakeMediaSession([FakeMediaResponse(b"x")])
            with patch.object(proxy, "session", return_value=session):
                await proxy.fetch_media("danbooru", "https://cdn.test/a.jpg", lambda _url: None)
            proxy.clear()
            self.assertEqual(list((Path(directory) / "media").glob("*.bin")), [])


    async def test_cached_media_file_streams_header_offset_without_loading_body(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            body = b"x" * 4096
            await proxy._write_cache("https://cdn.test/stream.jpg", "image/webp", body)
            resolved = proxy.cached_media_file("https://cdn.test/stream.jpg")
            self.assertIsNotNone(resolved)
            content_type, path, offset = resolved
            self.assertEqual(content_type, "image/webp")
            with open(path, "rb") as stream:
                stream.seek(offset)
                self.assertEqual(stream.read(), body)
            self.assertIsNone(proxy.cached_media_file("https://cdn.test/missing.jpg"))

    async def test_cached_media_file_rejects_unknown_content_type_header(self):
        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            path = proxy._cache_path("https://cdn.test/bogus.jpg")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"text/html\n<html>")
            self.assertIsNone(proxy.cached_media_file("https://cdn.test/bogus.jpg"))
