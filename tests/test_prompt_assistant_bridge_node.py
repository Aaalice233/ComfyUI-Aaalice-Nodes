"""Runtime contract tests for the V3 PromptAssistantBridge node and its client."""

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.append(str(Path(__file__).resolve().parents[3]))

from comfy.model_management import InterruptProcessingException  # noqa: E402
from nodes.prompt import NODE_CLASSES  # noqa: E402
from nodes.prompt import prompt_assistant_bridge_client as client  # noqa: E402
from nodes.prompt.prompt_assistant_bridge import PromptAssistantBridge  # noqa: E402


class PromptAssistantBridgeSchemaTests(unittest.TestCase):
    def test_node_is_registered_with_bridge_contract(self):
        self.assertIn(PromptAssistantBridge, NODE_CLASSES)
        schema = PromptAssistantBridge.define_schema()
        self.assertEqual(schema.node_id, "PromptAssistantBridge")
        self.assertEqual(schema.category, "Aaalice/prompt")
        self.assertEqual(schema.display_name, "✨ Prompt Assistant Bridge")
        self.assertEqual([item.id for item in schema.inputs], ["text", "enabled"])
        text_input, enabled_input = schema.inputs
        self.assertTrue(text_input.optional)
        self.assertTrue(text_input.force_input)
        self.assertTrue(enabled_input.default)
        # Plain switch without button labels keeps the auto widget-linked socket
        # for external control (e.g. a ParameterPanel boolean output).
        self.assertIsNone(enabled_input.label_on)
        self.assertIsNone(enabled_input.label_off)
        self.assertIsNot(enabled_input.socketless, True)
        self.assertEqual([item.id for item in schema.outputs], ["text"])

    def test_fingerprint_tracks_text_and_switch(self):
        base = PromptAssistantBridge.fingerprint_inputs(text="a", enabled=True)
        self.assertEqual(base, PromptAssistantBridge.fingerprint_inputs(text="a", enabled=True))
        self.assertNotEqual(base, PromptAssistantBridge.fingerprint_inputs(text="a", enabled=False))
        self.assertNotEqual(base, PromptAssistantBridge.fingerprint_inputs(text="b", enabled=True))


class PromptAssistantBridgeExecuteTests(unittest.TestCase):
    def test_disabled_passes_through_without_touching_client(self):
        with mock.patch.object(client, "resolve_prompt_assistant") as resolve:
            output = PromptAssistantBridge.execute("some prompt", enabled=False)
        self.assertEqual(output.args, ("some prompt",))
        self.assertIsNone(output.ui)
        resolve.assert_not_called()

    def test_empty_text_passes_through(self):
        with mock.patch.object(client, "resolve_prompt_assistant") as resolve:
            output = PromptAssistantBridge.execute("   ", enabled=True)
        self.assertEqual(output.args, ("   ",))
        self.assertIsNone(output.ui)
        resolve.assert_not_called()

    def test_missing_assistant_passes_through_without_ui_payload(self):
        with mock.patch.object(client, "resolve_prompt_assistant", return_value=None):
            output = PromptAssistantBridge.execute("some prompt", enabled=True)
        self.assertEqual(output.args, ("some prompt",))
        self.assertIsNone(output.ui)

    def test_success_returns_expanded_text(self):
        with (
            mock.patch.object(client, "resolve_prompt_assistant", return_value=object()),
            mock.patch.object(client, "expand", return_value="expanded prompt") as expand,
        ):
            output = PromptAssistantBridge.execute("some prompt", enabled=True)
        self.assertEqual(output.args, ("expanded prompt",))
        self.assertIsNone(output.ui)
        expand.assert_called_once_with("some prompt")

    def test_failure_keeps_source_and_reports_ui_payload(self):
        with (
            mock.patch.object(client, "resolve_prompt_assistant", return_value=object()),
            mock.patch.object(client, "expand", side_effect=RuntimeError("boom")),
        ):
            with self.assertLogs("nodes.prompt.prompt_assistant_bridge", level="WARNING") as captured:
                output = PromptAssistantBridge.execute("some prompt", enabled=True)
        self.assertEqual(output.args, ("some prompt",))
        items = output.ui["aaalice_prompt_assistant_bridge"]
        self.assertEqual(items, [{"status": "expand_failed", "message": "boom"}])
        self.assertTrue(any("boom" in line for line in captured.output))

    def test_interrupt_propagates(self):
        with (
            mock.patch.object(client, "resolve_prompt_assistant", return_value=object()),
            mock.patch.object(client, "expand", side_effect=InterruptProcessingException()),
        ):
            with self.assertRaises(InterruptProcessingException):
                PromptAssistantBridge.execute("some prompt", enabled=True)


def _fake_assistant_modules(name: str, dirname: str) -> dict:
    """Build sys.modules entries for a package matching the prompt-assistant fingerprint."""
    package = types.ModuleType(name)
    package.__path__ = [f"/custom_nodes/{dirname}"]
    llm = types.ModuleType(f"{name}.services.llm")
    llm.LLMService = types.SimpleNamespace(expand_prompt=lambda **kwargs: None)
    node_base = types.ModuleType(f"{name}.node.base.llm_node_base")
    node_base.LLMNodeBase = types.SimpleNamespace(_run_llm_task=lambda *args, **kwargs: None)
    common = types.ModuleType(f"{name}.utils.common")
    common.TASK_EXPAND = "提示词优化"
    common.SOURCE_NODE = "节点-"
    common.generate_request_id = lambda *args: "req"
    return {
        name: package,
        f"{name}.services.llm": llm,
        f"{name}.node.base.llm_node_base": node_base,
        f"{name}.utils.common": common,
    }


class PromptAssistantBridgeClientDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self._patcher = mock.patch.dict(sys.modules, _fake_assistant_modules("fake_pa_package", "prompt-assistant-renamed"))
        self._patcher.start()
        self._cached = client._cached
        client._cached = client._UNRESOLVED

    def tearDown(self):
        self._patcher.stop()
        client._cached = self._cached

    def test_fingerprint_match_survives_renamed_directory(self):
        api = client.resolve_prompt_assistant()
        self.assertIsNotNone(api)
        self.assertEqual(client.js_base(), "/extensions/prompt-assistant-renamed/js")

    def test_non_matching_package_is_not_detected(self):
        stranger = types.ModuleType("fake_stranger_package")
        stranger.__path__ = ["/custom_nodes/prompt-tools"]
        with mock.patch.dict(sys.modules, {"fake_stranger_package": stranger}):
            client._cached = client._UNRESOLVED
            api = client._fingerprint(stranger)
        self.assertIsNone(api)


if __name__ == "__main__":
    unittest.main()
