"""Pure CharacterFeatureSwap prompt and payload helpers."""

from __future__ import annotations

import json
from collections.abc import Mapping

REQUIRED_TEMPLATE_FIELDS = (
    "{original_prompt}",
    "{character_prompt}",
    "{target_features}",
)

DEFAULT_CHARACTER_SWAP_TEMPLATE = """You edit image-generation prompts by transferring selected character features.

The inputs may be natural language, a comma-separated tag list, or a mixture. Preserve the language, syntax, ordering style, weights, and formatting of the Original Prompt.

Rules:
1. Treat the Original Prompt as the complete base of the result.
2. Replace only the feature categories listed in Target Features.
3. Take replacement details only from the Reference Character Prompt.
4. If the reference does not contain a selected feature, keep the original feature unchanged.
5. Preserve identity, character count, pose, expression, composition, background, style, quality terms, LoRA syntax, embeddings, and every unselected feature.
6. Return only the rewritten prompt. Do not add explanations, headings, quotes, Markdown, or code fences.

Original Prompt:
{original_prompt}

Reference Character Prompt:
{character_prompt}

Target Features:
{target_features}

Rewritten Prompt:"""


def validate_prompt_template(template: object) -> str:
    value = str(template or "")
    if not value.strip():
        raise ValueError("prompt_template must not be empty")
    missing = [field for field in REQUIRED_TEMPLATE_FIELDS if field not in value]
    if missing:
        raise ValueError(f"prompt_template is missing required placeholders: {', '.join(missing)}")
    return value


def render_prompt_template(
    template: str,
    original_prompt: str,
    character_prompt: str,
    target_features: list[str],
) -> str:
    rendered = validate_prompt_template(template)
    replacements = {
        "{original_prompt}": original_prompt,
        "{character_prompt}": character_prompt,
        "{target_features}": ", ".join(target_features),
    }
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


def parse_features_payload(payload_json: object) -> list[str]:
    if not isinstance(payload_json, str) or not payload_json.strip():
        raise ValueError("features_json is required")
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError as exc:
        raise ValueError("features_json must be valid JSON") from exc
    if not isinstance(payload, Mapping) or payload.get("version") != 1:
        raise ValueError("features_json must use version 1")
    raw_features = payload.get("features")
    if not isinstance(raw_features, list):
        raise ValueError("features_json.features must be a list")
    features: list[str] = []
    seen: set[str] = set()
    for item in raw_features:
        if isinstance(item, Mapping):
            if item.get("enabled") is False:
                continue
            text = str(item.get("text", "")).strip()
        else:
            text = str(item).strip()
        if text and text not in seen:
            seen.add(text)
            features.append(text)
    if not features:
        raise ValueError("at least one replacement feature must be enabled")
    return features


def parse_chat_completion(data: object) -> str:
    if not isinstance(data, Mapping):
        raise ValueError("DeepSeek response must be a JSON object")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        raise ValueError("DeepSeek response does not contain choices[0]")
    message = choices[0].get("message")
    if not isinstance(message, Mapping):
        raise ValueError("DeepSeek response does not contain choices[0].message")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("DeepSeek response returned an empty prompt")
    return content.strip()
