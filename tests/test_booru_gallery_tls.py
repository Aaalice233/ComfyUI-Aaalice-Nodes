from __future__ import annotations

import json
import ssl
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import aiohttp

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.gallery.adapters import DanbooruAdapter, GalleryTLSCertificateError
from nodes.gallery.media import MediaProxy
from nodes.gallery.routes import _error


class GalleryTLSFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_certificate_failure_is_structured_complete_and_not_retried(self):
        adapter = DanbooruAdapter()
        connection_key = MagicMock()
        connection_key.host = "danbooru.donmai.us"
        connection_key.port = 443
        connection_key.ssl = True
        certificate_error = aiohttp.ClientConnectorCertificateError(
            connection_key,
            ssl.SSLCertVerificationError(1, "certificate has expired"),
        )
        session = MagicMock()
        session.get.side_effect = certificate_error

        with self.assertRaises(GalleryTLSCertificateError) as ctx:
            await adapter._get_json(session, "https://danbooru.donmai.us/posts.json")

        self.assertEqual(ctx.exception.code, "tls_certificate_error")
        self.assertIn(str(certificate_error), str(ctx.exception))
        self.assertEqual(session.get.call_count, 1)
        self.assertNotIn("ssl", session.get.call_args.kwargs)
        payload = json.loads(_error(ctx.exception).body)
        self.assertEqual(payload["code"], "tls_certificate_error")
        self.assertIn("certificate has expired", payload["message"])

    async def test_media_certificate_failure_is_structured_and_not_retried(self):
        connection_key = MagicMock()
        connection_key.host = "cdn.donmai.us"
        connection_key.port = 443
        connection_key.ssl = True
        certificate_error = aiohttp.ClientConnectorCertificateError(
            connection_key,
            ssl.SSLCertVerificationError(1, "certificate has expired"),
        )
        session = MagicMock()
        session.get.side_effect = certificate_error

        with tempfile.TemporaryDirectory() as directory:
            proxy = MediaProxy(Path(directory))
            with patch.object(proxy, "session", return_value=session):
                with self.assertRaises(GalleryTLSCertificateError) as ctx:
                    await proxy.fetch_media("danbooru", "https://cdn.donmai.us/image.jpg", lambda _url: None)

        self.assertEqual(ctx.exception.code, "tls_certificate_error")
        self.assertIn(str(certificate_error), str(ctx.exception))
        self.assertEqual(session.get.call_count, 1)
        payload = json.loads(_error(ctx.exception).body)
        self.assertEqual(payload["code"], "tls_certificate_error")
        self.assertIn("certificate has expired", payload["message"])


if __name__ == "__main__":
    unittest.main()
