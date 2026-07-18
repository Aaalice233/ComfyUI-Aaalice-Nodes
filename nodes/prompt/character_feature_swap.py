"""CharacterFeatureSwapNode — transfer selected character features with an LLM."""

from __future__ import annotations

from comfy import model_management
from comfy_api.latest import io

from .._lib.character_feature_swap import parse_features_payload, render_prompt_template
from .character_feature_swap_settings import create_chat_completion
from .character_feature_swap_store import get_character_feature_swap_store


class CharacterFeatureSwapNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="CharacterFeatureSwapNode",
            display_name="🧬 Character Feature Swap",
            category="Aaalice/prompt",
            description="Transfer selected character features while preserving the original prompt's language and format.",
            inputs=[
                io.String.Input(
                    "original_prompt",
                    force_input=True,
                    tooltip="Base prompt whose unselected content is preserved.",
                ),
                io.String.Input(
                    "character_prompt",
                    force_input=True,
                    tooltip="Reference character prompt that supplies replacement features.",
                ),
            ],
            outputs=[io.String.Output("new_prompt", display_name="New Prompt", tooltip="Prompt with selected features replaced.")],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, features_json: str = ""):
        try:
            parse_features_payload(features_json)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    async def execute(
        cls,
        original_prompt: str,
        character_prompt: str,
        features_json: str = "",
        config_revision: int = 0,
        **_kwargs,
    ) -> io.NodeOutput:
        del config_revision
        if not isinstance(original_prompt, str) or not original_prompt.strip():
            raise ValueError("original_prompt must not be empty")
        if not isinstance(character_prompt, str) or not character_prompt.strip():
            raise ValueError("character_prompt must not be empty")
        validation = cls.validate_inputs(features_json)
        if validation is not True:
            raise ValueError(validation)
        model_management.throw_exception_if_processing_interrupted()
        features = parse_features_payload(features_json)
        settings = get_character_feature_swap_store().load()
        prompt = render_prompt_template(
            settings["prompt_template"],
            original_prompt,
            character_prompt,
            features,
        )
        result = await create_chat_completion(settings, prompt)
        model_management.throw_exception_if_processing_interrupted()
        return io.NodeOutput(result)
