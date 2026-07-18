from __future__ import annotations

import inspect
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from aiohttp import web

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.character_feature_swap import (
    DEFAULT_CHARACTER_SWAP_TEMPLATE,
    parse_chat_completion,
    parse_features_payload,
    render_prompt_template,
    validate_prompt_template,
)
from nodes.prompt import NODE_CLASSES
from nodes.prompt.character_feature_swap import CharacterFeatureSwapNode
from nodes.prompt.character_feature_swap_settings import (
    CharacterFeatureSwapSettingsStore,
    create_chat_completion,
    default_settings,
    fetch_models,
)


class CharacterFeatureSwapPureTests(unittest.TestCase):
    def test_feature_payload_keeps_only_enabled_unique_values(self):
        payload = json.dumps({"version": 1, "features": [
            {"text": "hair style", "enabled": False},
            {"text": "eye color", "enabled": True},
            "eye color",
            " clothing ",
        ]})
        self.assertEqual(parse_features_payload(payload), ["eye color", "clothing"])

    def test_template_replacement_preserves_unrelated_braces(self):
        template = "JSON {keep}: {original_prompt} | {character_prompt} | {target_features}"
        rendered = render_prompt_template(template, "原角色", "参考角色", ["hair style", "瞳色"])
        self.assertEqual(rendered, "JSON {keep}: 原角色 | 参考角色 | hair style, 瞳色")

    def test_default_template_covers_natural_and_tag_inputs_without_format_switch(self):
        rendered = render_prompt_template(
            DEFAULT_CHARACTER_SWAP_TEMPLATE,
            "a smiling girl with long hair",
            "1boy, short hair, green eyes",
            ["hair style"],
        )
        self.assertIn("a smiling girl with long hair", rendered)
        self.assertIn("1boy, short hair, green eyes", rendered)
        self.assertIn("hair style", rendered)
        self.assertIn("natural language", rendered)
        self.assertIn("comma-separated tag list", rendered)

    def test_template_requires_all_placeholders(self):
        with self.assertRaisesRegex(ValueError, "character_prompt"):
            validate_prompt_template("{original_prompt} {target_features}")

    def test_chat_completion_requires_non_empty_standard_content(self):
        self.assertEqual(parse_chat_completion({"choices": [{"message": {"content": " result "}}]}), "result")
        with self.assertRaisesRegex(ValueError, "empty prompt"):
            parse_chat_completion({"choices": [{"message": {"content": " "}}]})


class CharacterFeatureSwapSettingsTests(unittest.TestCase):
    def test_store_masks_preserves_and_clears_api_key(self):
        with tempfile.TemporaryDirectory() as directory:
            store = CharacterFeatureSwapSettingsStore(Path(directory) / "settings.json")
            first = store.save({"api_key": "secret", "model": "model-a"})
            self.assertTrue(first["has_api_key"])
            self.assertNotIn("api_key", first)
            revision = first["revision"]
            second = store.save({"api_key": "", "model": "model-b"})
            self.assertTrue(second["has_api_key"])
            self.assertEqual(store.load()["api_key"], "secret")
            self.assertGreater(second["revision"], revision)
            third = store.save({"clear_api_key": True})
            self.assertFalse(third["has_api_key"])
            self.assertEqual(store.load()["api_key"], "")

    def test_store_rejects_invalid_timeout_thinking_mode_and_template(self):
        with tempfile.TemporaryDirectory() as directory:
            store = CharacterFeatureSwapSettingsStore(Path(directory) / "settings.json")
            for update in (
                {"timeout": 0},
                {"thinking_mode": "medium"},
                {"prompt_template": "{original_prompt}"},
            ):
                with self.subTest(update=update), self.assertRaises(ValueError):
                    store.save(update)

    def test_legacy_provider_url_is_dropped_and_thinking_defaults_off(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text(json.dumps({
                "api_base_url": "https://openrouter.ai/api/v1",
                "api_key": "secret",
                "model": "deepseek-v4-flash",
                "timeout": 60,
                "prompt_template": DEFAULT_CHARACTER_SWAP_TEMPLATE,
                "revision": 2,
            }), encoding="utf-8")
            store = CharacterFeatureSwapSettingsStore(path)
            settings = store.load()
            self.assertNotIn("api_base_url", settings)
            self.assertEqual(settings["thinking_mode"], "disabled")
            self.assertNotIn("api_base_url", store.public())


class CharacterFeatureSwapTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mode = "success"
        self.seen_authorization = None
        self.seen_models_content_type = None
        self.seen_chat_content_type = None
        self.seen_chat_body = None
        app = web.Application()
        app.router.add_get("/v1/models", self._models)
        app.router.add_post("/v1/chat/completions", self._chat)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await self.site.start()
        port = self.site._server.sockets[0].getsockname()[1]
        self.base_url_patch = patch(
            "nodes.prompt.character_feature_swap_settings.DEEPSEEK_API_BASE_URL",
            f"http://127.0.0.1:{port}/v1",
        )
        self.base_url_patch.start()
        self.settings = default_settings()
        self.settings.update({
            "api_key": "secret",
            "model": "model-a",
            "timeout": 2,
        })

    async def asyncTearDown(self):
        self.base_url_patch.stop()
        await self.runner.cleanup()

    async def _models(self, request):
        self.seen_authorization = request.headers.get("Authorization")
        self.seen_models_content_type = request.headers.get("Content-Type")
        if self.mode == "http_error":
            return web.json_response({"error": "denied"}, status=401)
        if self.mode == "invalid_models":
            return web.json_response({"models": []})
        return web.json_response({"data": [{"id": "model-b"}, {"id": "model-a"}]})

    async def _chat(self, request):
        self.seen_authorization = request.headers.get("Authorization")
        self.seen_chat_content_type = request.headers.get("Content-Type")
        body = await request.json()
        self.seen_chat_body = body
        if self.mode == "http_error":
            return web.json_response({"error": "denied"}, status=401)
        if self.mode == "invalid_json":
            return web.Response(text="not-json", content_type="text/plain")
        if self.mode == "empty":
            return web.json_response({"choices": [{"message": {"content": ""}}]})
        self.assertEqual(body["model"], "model-a")
        self.assertEqual(body["messages"], [{"role": "user", "content": "request"}])
        return web.json_response({"choices": [{"message": {"content": "result"}}]})

    async def test_models_and_chat_use_deepseek_contract(self):
        self.assertEqual(await fetch_models(self.settings), ["model-a", "model-b"])
        self.assertEqual(await create_chat_completion(self.settings, "request"), "result")
        self.assertEqual(self.seen_authorization, "Bearer secret")
        self.assertIsNone(self.seen_models_content_type)
        self.assertEqual(self.seen_chat_content_type, "application/json")
        self.assertEqual(self.seen_chat_body["thinking"], {"type": "disabled"})
        self.assertFalse(self.seen_chat_body["stream"])
        self.assertNotIn("reasoning_effort", self.seen_chat_body)

    async def test_thinking_effort_uses_only_deepseek_supported_levels(self):
        for effort in ("high", "max"):
            with self.subTest(effort=effort):
                self.settings["thinking_mode"] = effort
                self.assertEqual(await create_chat_completion(self.settings, "request"), "result")
                self.assertEqual(self.seen_chat_body["thinking"], {"type": "enabled"})
                self.assertEqual(self.seen_chat_body["reasoning_effort"], effort)

    async def test_missing_api_key_fails_before_network(self):
        self.settings["api_key"] = ""
        with self.assertRaisesRegex(ValueError, "DeepSeek API Key"):
            await create_chat_completion(self.settings, "request")

    async def test_http_error_keeps_status_and_body(self):
        self.mode = "http_error"
        with self.assertRaisesRegex(RuntimeError, "HTTP 401.*denied"):
            await create_chat_completion(self.settings, "request")

    async def test_invalid_and_empty_responses_fail_explicitly(self):
        self.mode = "invalid_json"
        with self.assertRaisesRegex(RuntimeError, "invalid JSON"):
            await create_chat_completion(self.settings, "request")
        self.mode = "empty"
        with self.assertRaisesRegex(ValueError, "empty prompt"):
            await create_chat_completion(self.settings, "request")
        self.mode = "invalid_models"
        with self.assertRaisesRegex(RuntimeError, "data list"):
            await fetch_models(self.settings)


class CharacterFeatureSwapNodeTests(unittest.IsolatedAsyncioTestCase):
    def test_registration_and_schema(self):
        self.assertIn(CharacterFeatureSwapNode, NODE_CLASSES)
        schema = CharacterFeatureSwapNode.define_schema()
        self.assertEqual(schema.node_id, "CharacterFeatureSwapNode")
        self.assertEqual(schema.category, "Aaalice/prompt")
        self.assertEqual([item.id for item in schema.inputs], ["original_prompt", "character_prompt"])
        self.assertTrue(all(item.force_input for item in schema.inputs))
        self.assertEqual([item.id for item in schema.outputs], ["new_prompt"])
        self.assertTrue(schema.accept_all_inputs)

    def test_custom_validation_does_not_read_connected_prompt_values(self):
        parameters = inspect.signature(CharacterFeatureSwapNode.validate_inputs).parameters
        self.assertNotIn("original_prompt", parameters)
        self.assertNotIn("character_prompt", parameters)
        payload = json.dumps({"version": 1, "features": [{"text": "eye color", "enabled": True}]})
        self.assertIs(CharacterFeatureSwapNode.validate_inputs(payload), True)

    async def test_execute_uses_local_settings_and_returns_llm_prompt(self):
        payload = json.dumps({"version": 1, "features": [{"text": "eye color", "enabled": True}]})
        settings = {"prompt_template": DEFAULT_CHARACTER_SWAP_TEMPLATE}
        store = Mock()
        store.load.return_value = settings
        completion = AsyncMock(return_value="green-eyed heroine")
        with (
            patch("nodes.prompt.character_feature_swap.get_character_feature_swap_store", return_value=store),
            patch("nodes.prompt.character_feature_swap.create_chat_completion", completion),
            patch("nodes.prompt.character_feature_swap.model_management.throw_exception_if_processing_interrupted"),
        ):
            output = await CharacterFeatureSwapNode.execute("blue-eyed heroine", "green eyes", payload, 3)
        self.assertEqual(output.args, ("green-eyed heroine",))
        sent_prompt = completion.await_args.args[1]
        self.assertIn("blue-eyed heroine", sent_prompt)
        self.assertIn("green eyes", sent_prompt)
        self.assertIn("eye color", sent_prompt)

    async def test_execute_rejects_empty_input_and_disabled_features(self):
        payload = json.dumps({"version": 1, "features": [{"text": "eyes", "enabled": False}]})
        with self.assertRaisesRegex(ValueError, "original_prompt"):
            await CharacterFeatureSwapNode.execute("", "reference", payload)
        with self.assertRaisesRegex(ValueError, "at least one"):
            await CharacterFeatureSwapNode.execute("original", "reference", payload)


if __name__ == "__main__":
    unittest.main()
