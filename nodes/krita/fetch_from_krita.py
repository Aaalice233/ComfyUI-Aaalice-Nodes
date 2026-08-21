"""FetchFromKrita — snapshot the active Krita document at execution time."""

from __future__ import annotations

from uuid import uuid4

from comfy import model_management
from comfy_api.latest import io

from .._lib.image_generation_metadata import build_image_generation_metadata
from .._lib.krita_snapshot import KritaSnapshotError
from .bridge_client import fetch_snapshot


class FetchFromKrita(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="FetchFromKrita",
            display_name="🎨 Fetch from Krita",
            category="Aaalice/krita",
            description="Read the active Krita document and its current selection when this node executes.",
            inputs=[],
            outputs=[
                io.Image.Output("image", display_name="Image", tooltip="Visible composite of the active Krita document."),
                io.Mask.Output("mask", display_name="Mask", tooltip="Current Krita selection, or an empty mask when no selection exists."),
                io.Custom("METADATA").Output(
                    "metadata",
                    display_name="Metadata",
                    tooltip="Generation parameters from the original PNG, JPEG, or WebP opened in Krita, or explicit empty metadata.",
                ),
            ],
            not_idempotent=True,
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> str:
        return uuid4().hex

    @classmethod
    async def execute(cls) -> io.NodeOutput:
        try:
            image, mask, snapshot = await fetch_snapshot(
                interrupt=model_management.throw_exception_if_processing_interrupted,
            )
        except KritaSnapshotError as exc:
            raise RuntimeError(f"failed to fetch the active Krita document [{exc.code}]: {exc}") from exc
        model_management.throw_exception_if_processing_interrupted()
        document = snapshot.document
        return io.NodeOutput(
            image,
            mask,
            build_image_generation_metadata(snapshot.parameters),
            ui={"aaalice_krita_snapshot": [{
                "document": document.name,
                "width": document.width,
                "height": document.height,
                "color_model": document.color_model,
                "selection_present": snapshot.selection_present,
                "selection_bounds": list(snapshot.selection_bounds) if snapshot.selection_bounds else None,
            }]},
        )


__all__ = ["FetchFromKrita"]
