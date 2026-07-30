from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.tools.discord_share_routes import public_config


class DiscordShareRouteTests(unittest.TestCase):
    def test_bundled_relay_enables_the_feature_without_local_configuration(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                public_config(),
                {
                    "enabled": True,
                    "relay_url": "https://aaalice-discord-share.ljk2515448788ljk.workers.dev",
                    "community_url": "",
                },
            )

    def test_public_urls_can_be_overridden_without_secrets(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AAALICE_DISCORD_SHARE_RELAY_URL": "https://relay.example/",
                "AAALICE_DISCORD_SHARE_COMMUNITY_URL": "https://discord.gg/example",
            },
            clear=True,
        ):
            self.assertEqual(
                public_config(),
                {
                    "enabled": True,
                    "relay_url": "https://relay.example",
                    "community_url": "https://discord.gg/example",
                },
            )

    def test_invalid_public_url_is_rejected(self) -> None:
        with patch.dict(
            os.environ,
            {"AAALICE_DISCORD_SHARE_RELAY_URL": "javascript:alert(1)"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "absolute HTTP"):
                public_config()

if __name__ == "__main__":
    unittest.main()
