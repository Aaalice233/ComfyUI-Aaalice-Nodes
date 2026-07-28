"""Discovery and invocation adapter for the optional prompt-assistant package.

prompt-assistant is loaded by ComfyUI as a top-level package whose import name
is derived from its directory, so a plain ``import prompt_assistant`` is not
reliable. Discovery scans ``sys.modules`` for a loaded package matching a
structural fingerprint instead of a fixed name, which also survives users
renaming the custom node folder.
"""

from __future__ import annotations

import logging
import os
import sys
from importlib import import_module
from types import ModuleType
from typing import Callable, NamedTuple

from comfy.model_management import InterruptProcessingException

logger = logging.getLogger(__name__)


class AssistantApi(NamedTuple):
    """Entry points borrowed from a loaded prompt-assistant package."""

    package: ModuleType
    expand_prompt: Callable
    run_llm_task: Callable
    task_expand: str
    source_node: str
    generate_request_id: Callable


_UNRESOLVED = object()
_cached: AssistantApi | None | object = _UNRESOLVED


def _fingerprint(package: ModuleType) -> AssistantApi | None:
    """Return the borrowed API surface when ``package`` is prompt-assistant."""
    try:
        llm = import_module(".services.llm", package=package.__name__)
        node_base = import_module(".node.base.llm_node_base", package=package.__name__)
        common = import_module(".utils.common", package=package.__name__)
        expand_prompt = getattr(llm.LLMService, "expand_prompt", None)
        run_llm_task = getattr(node_base.LLMNodeBase, "_run_llm_task", None)
        if not callable(expand_prompt) or not callable(run_llm_task):
            return None
        return AssistantApi(
            package=package,
            expand_prompt=expand_prompt,
            run_llm_task=run_llm_task,
            task_expand=common.TASK_EXPAND,
            source_node=common.SOURCE_NODE,
            generate_request_id=common.generate_request_id,
        )
    except (ImportError, AttributeError):
        return None


def _candidate_packages() -> list[ModuleType]:
    packages = []
    for module in list(sys.modules.values()):
        path = getattr(module, "__path__", None)
        if not path:
            continue
        try:
            # Some modules (e.g. torch namespaces) expose a non-sequence __path__.
            dirname = os.path.basename(os.path.normpath(str(path[0]))).lower()
        except Exception:
            continue
        if "prompt" in dirname or "assistant" in dirname:
            packages.append(module)
    return packages


def resolve_prompt_assistant() -> AssistantApi | None:
    """Locate the loaded prompt-assistant package, or None when unavailable.

    Import failures mean the package is not installed; any other error while
    probing is logged with its original cause and treated as unavailable.
    """
    global _cached
    if _cached is not _UNRESOLVED:
        return _cached  # type: ignore[return-value]
    result: AssistantApi | None = None
    for package in _candidate_packages():
        try:
            result = _fingerprint(package)
        except Exception:
            logger.exception(
                "PromptAssistantBridge failed while probing %s for the prompt-assistant API",
                getattr(package, "__name__", "<unknown>"),
            )
            result = None
        if result is not None:
            break
    _cached = result
    return result


def expand(text: str, stream_callback: Callable[[str], None] | None = None) -> str:
    """Expand ``text`` with prompt-assistant's active rule and LLM service.

    ``stream_callback`` receives each streamed content delta and exists only
    for live display; the returned string is always the authoritative result.

    Raises RuntimeError carrying the assistant's original error when the
    expansion fails; InterruptProcessingException propagates unchanged.
    """
    api = resolve_prompt_assistant()
    if api is None:
        raise RuntimeError("prompt-assistant is not installed")
    request_id = api.generate_request_id("exp", None, "0")
    result = api.run_llm_task(
        api.expand_prompt,
        "prompt-assistant",
        prompt=text,
        request_id=request_id,
        task_type=api.task_expand,
        source=api.source_node,
        stream_callback=stream_callback,
    )
    if result and result.get("success"):
        expanded = str((result.get("data") or {}).get("expanded", "")).strip()
        if not expanded:
            raise RuntimeError("prompt-assistant returned an empty expansion")
        return expanded
    error = (result or {}).get("error", "unknown error")
    if error == "任务被中断":
        raise InterruptProcessingException()
    raise RuntimeError(f"prompt-assistant expansion failed: {error}")


__all__ = ["AssistantApi", "expand", "resolve_prompt_assistant"]
