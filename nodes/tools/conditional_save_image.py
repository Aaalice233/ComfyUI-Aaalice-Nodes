"""ConditionalSaveImage — save images only when the enabled toggle is on.

Delegates all saving work to LoraManager's SaveImageLM when that pack is
installed (metadata, recipes, %seed% filename variables, webp/jpeg, ...).
Without LoraManager it falls back to the core SaveImage behavior (PNG with
embedded prompt/workflow metadata). Either way, disabling the toggle turns
the node into a pure pass-through and nothing is written to disk.
"""

from __future__ import annotations

import sys
from typing import Any
from uuid import uuid4

from comfy_api.latest import io

_LORAMANAGER_SAVE_ID = "Save Image (LoraManager)"


def _node_class_mappings() -> dict:
    """ComfyUI's global node registry, resolved lazily.

    This package ships its own ``nodes`` subpackage, so a top-level
    ``import nodes`` is ambiguous whenever the package root sits on
    ``sys.path`` (unit tests, tooling). At ComfyUI runtime the core module
    is always loaded first, so reading ``sys.modules`` is unambiguous.
    """
    core_nodes = sys.modules.get("nodes")
    if core_nodes is None:
        import nodes as core_nodes
    return getattr(core_nodes, "NODE_CLASS_MAPPINGS", {})


def _loramanager_save_class():
    """Return LoraManager's SaveImageLM class, or None when the pack is absent."""
    return _node_class_mappings().get(_LORAMANAGER_SAVE_ID)


class ConditionalSaveImage(io.ComfyNode):
    """Pass images through; save them only while the enabled toggle is on."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ConditionalSaveImage",
            display_name="💾 Conditional Save Image",
            category="Aaalice/tools",
            description=(
                "Save images only when enabled; otherwise pass them through unchanged. "
                "Uses LoraManager's save implementation when installed, otherwise the core PNG save."
            ),
            inputs=[
                io.Image.Input("images", tooltip="Images to save (passed through unchanged)."),
                io.Custom("METADATA").Input(
                    "metadata",
                    optional=True,
                    tooltip="Optional Metadata Overwrite (LoraManager) output; establishes execution order before saving.",
                ),
                io.Boolean.Input(
                    "enabled",
                    default=True,
                    tooltip="When off, nothing is saved and the images are passed through unchanged.",
                ),
                io.String.Input(
                    "filename_prefix",
                    default="ComfyUI",
                    tooltip="Base filename. With LoraManager installed, patterns like %seed%/%date:...% are supported.",
                ),
                io.Combo.Input("file_format", options=["png", "jpeg", "webp"], default="png"),
                io.Boolean.Input("lossless_webp", default=False),
                io.Int.Input("quality", default=100, min=1, max=100),
                io.Int.Input("webp_method", default=6, min=0, max=6),
                io.Int.Input("jpeg_subsampling", default=0, min=0, max=2),
                io.Boolean.Input("embed_workflow", default=False),
                io.Boolean.Input("save_with_metadata", default=True),
                io.Boolean.Input("add_loras_to_prompt", default=True),
                io.Boolean.Input("add_counter_to_filename", default=True),
                io.Boolean.Input("save_as_recipe", default=False),
            ],
            outputs=[
                io.Image.Output(display_name="images", tooltip="The unchanged input images."),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            not_idempotent=True,
            search_aliases=["save image", "conditional save", "toggle save"],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> str:
        # Saving is a side effect: never serve this node from cache.
        return uuid4().hex

    @classmethod
    def execute(
        cls,
        images: Any,
        metadata: Any = None,
        enabled: bool = True,
        filename_prefix: str = "ComfyUI",
        file_format: str = "png",
        lossless_webp: bool = False,
        quality: int = 100,
        webp_method: int = 6,
        jpeg_subsampling: int = 0,
        embed_workflow: bool = False,
        save_with_metadata: bool = True,
        add_loras_to_prompt: bool = False,
        add_counter_to_filename: bool = True,
        save_as_recipe: bool = False,
    ) -> io.NodeOutput:
        # LoraManager applies the overwrite through its collector; the socket makes
        # that node execute before this save node without replacing collector data.
        _ = metadata
        if not enabled:
            return io.NodeOutput(images, ui={"images": []})

        hidden = cls.hidden
        save_class = _loramanager_save_class()
        if save_class is not None:
            result = save_class().process_image(
                images,
                hidden.unique_id,
                filename_prefix=filename_prefix,
                file_format=file_format,
                prompt=hidden.prompt,
                extra_pnginfo=hidden.extra_pnginfo,
                lossless_webp=lossless_webp,
                quality=quality,
                webp_method=webp_method,
                jpeg_subsampling=jpeg_subsampling,
                embed_workflow=embed_workflow,
                save_with_metadata=save_with_metadata,
                add_counter_to_filename=add_counter_to_filename,
                save_as_recipe=save_as_recipe,
                add_loras_to_prompt=add_loras_to_prompt,
            )
            # LoraManager returns its normalized image list as "result"; downstream
            # nodes expect the original batch tensor, so only reuse its ui payload.
            ui = result.get("ui") if isinstance(result, dict) else None
            return io.NodeOutput(images, ui=ui)

        if file_format != "png":
            raise ValueError(
                "ConditionalSaveImage: jpeg/webp requires ComfyUI-Lora-Manager; only png is available without it."
            )
        if save_as_recipe or add_loras_to_prompt:
            raise ValueError(
                "ConditionalSaveImage: save_as_recipe/add_loras_to_prompt require ComfyUI-Lora-Manager."
            )
        result = _node_class_mappings()["SaveImage"]().save_images(
            images,
            filename_prefix=filename_prefix,
            prompt=hidden.prompt if save_with_metadata else None,
            extra_pnginfo=hidden.extra_pnginfo if embed_workflow else None,
        )
        return io.NodeOutput(images, ui=result.get("ui"))
