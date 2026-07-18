"""Local settings and DeepSeek transport for CharacterFeatureSwap."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
import aiohttp

from .._lib.character_feature_swap import (
    DEFAULT_CHARACTER_SWAP_TEMPLATE,
    parse_chat_completion,
    validate_prompt_template,
)

DEEPSEEK_API_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"
DEFAULT_TIMEOUT = 60
DEFAULT_THINKING_MODE = "disabled"
THINKING_MODES = frozenset({"disabled", "high", "max"})


def default_settings() -> dict:
    return {
        "api_key": "",
        "model": DEFAULT_MODEL,
        "timeout": DEFAULT_TIMEOUT,
        "thinking_mode": DEFAULT_THINKING_MODE,
        "prompt_template": DEFAULT_CHARACTER_SWAP_TEMPLATE,
        "revision": 1,
    }


def normalize_settings(raw: object) -> dict:
    source = raw if isinstance(raw, dict) else {}
    defaults = default_settings()
    try:
        timeout = int(source.get("timeout", defaults["timeout"]))
    except (TypeError, ValueError) as exc:
        raise ValueError("timeout must be an integer") from exc
    if not 1 <= timeout <= 300:
        raise ValueError("timeout must be between 1 and 300 seconds")
    try:
        revision = max(1, int(source.get("revision", defaults["revision"])))
    except (TypeError, ValueError) as exc:
        raise ValueError("revision must be an integer") from exc
    thinking_mode = str(source.get("thinking_mode", defaults["thinking_mode"])).strip().lower()
    if thinking_mode not in THINKING_MODES:
        raise ValueError("thinking_mode must be disabled, high, or max")
    return {
        "api_key": str(source.get("api_key", "")),
        "model": str(source.get("model", "")).strip(),
        "timeout": timeout,
        "thinking_mode": thinking_mode,
        "prompt_template": validate_prompt_template(source.get("prompt_template", defaults["prompt_template"])),
        "revision": revision,
    }


class CharacterFeatureSwapSettingsStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()

    def load(self) -> dict:
        with self._lock:
            if not self.path.exists():
                return default_settings()
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                return normalize_settings(raw)
            except (OSError, json.JSONDecodeError, ValueError) as exc:
                raise RuntimeError(f"failed to load Character Feature Swap settings from {self.path}: {exc}") from exc

    def public(self) -> dict:
        settings = self.load()
        return {
            "model": settings["model"],
            "timeout": settings["timeout"],
            "thinking_mode": settings["thinking_mode"],
            "prompt_template": settings["prompt_template"],
            "revision": settings["revision"],
            "has_api_key": bool(settings["api_key"]),
            "default_prompt_template": DEFAULT_CHARACTER_SWAP_TEMPLATE,
        }

    def save(self, update: object) -> dict:
        if not isinstance(update, dict):
            raise ValueError("settings body must be a JSON object")
        with self._lock:
            current = self.load()
            candidate = dict(current)
            for key in ("model", "timeout", "thinking_mode", "prompt_template"):
                if key in update:
                    candidate[key] = update[key]
            if update.get("clear_api_key") is True:
                candidate["api_key"] = ""
            elif isinstance(update.get("api_key"), str) and update["api_key"].strip():
                candidate["api_key"] = update["api_key"].strip()
            candidate["revision"] = current["revision"] + 1
            normalized = normalize_settings(candidate)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
            temporary.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temporary, self.path)
            return self.public()


def settings_for_request(stored: dict, overrides: object) -> dict:
    data = overrides if isinstance(overrides, dict) else {}
    merged = dict(stored)
    for key in ("model", "timeout", "thinking_mode"):
        if key in data:
            merged[key] = data[key]
    if isinstance(data.get("api_key"), str) and data["api_key"].strip():
        merged["api_key"] = data["api_key"].strip()
    return normalize_settings(merged)


def _headers(settings: dict) -> dict[str, str]:
    headers = {}
    if settings["api_key"]:
        headers["Authorization"] = f"Bearer {settings['api_key']}"
    return headers


async def fetch_models(settings: dict) -> list[str]:
    if not settings["api_key"]:
        raise ValueError("DeepSeek API Key is not configured")
    timeout = aiohttp.ClientTimeout(total=settings["timeout"])
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{DEEPSEEK_API_BASE_URL}/models", headers=_headers(settings)) as response:
                body = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"DeepSeek model request failed with HTTP {response.status}: {body[:1000]}")
                try:
                    data = json.loads(body)
                except json.JSONDecodeError as exc:
                    raise RuntimeError("DeepSeek model request returned invalid JSON") from exc
    except TimeoutError as exc:
        raise TimeoutError(f"DeepSeek model request timed out after {settings['timeout']} seconds") from exc
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("DeepSeek model response does not contain a data list")
    models = sorted({str(row.get("id", "")).strip() for row in rows if isinstance(row, dict) and row.get("id")})
    return models


async def create_chat_completion(settings: dict, prompt: str) -> str:
    if not settings["api_key"]:
        raise ValueError("DeepSeek API Key is not configured")
    if not settings["model"]:
        raise ValueError("Model is not configured")
    timeout = aiohttp.ClientTimeout(total=settings["timeout"])
    thinking_mode = settings["thinking_mode"]
    payload = {
        "model": settings["model"],
        "messages": [{"role": "user", "content": prompt}],
        "thinking": {"type": "disabled" if thinking_mode == "disabled" else "enabled"},
        "stream": False,
    }
    if thinking_mode != "disabled":
        payload["reasoning_effort"] = thinking_mode
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{DEEPSEEK_API_BASE_URL}/chat/completions",
                headers=_headers(settings),
                json=payload,
            ) as response:
                body = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"DeepSeek chat completion failed with HTTP {response.status}: {body[:1000]}")
                try:
                    data = json.loads(body)
                except json.JSONDecodeError as exc:
                    raise RuntimeError("DeepSeek chat completion returned invalid JSON") from exc
    except TimeoutError as exc:
        raise TimeoutError(
            f"DeepSeek chat completion timed out after {settings['timeout']} seconds "
            f"(model={settings['model']}, thinking={thinking_mode})"
        ) from exc
    return parse_chat_completion(data)
