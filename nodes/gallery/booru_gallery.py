"""BooruGalleryNode — execute an ordered, immutable gallery selection snapshot."""

from __future__ import annotations

import asyncio

from comfy import model_management
from comfy_api.latest import io

from .._lib.booru_gallery import materialize_prompts, parse_gallery_payload
from .service import get_gallery_service


class BooruGalleryNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="BooruGalleryNode",
            display_name="🖼️ Booru Gallery",
            category="Aaalice/gallery",
            description="Search supported booru sites and output an ordered image and prompt snapshot.",
            inputs=[],
            outputs=[
                io.Image.Output("images", is_output_list=True),
                io.String.Output("prompts", is_output_list=True),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, gallery_payload: str = ""):
        try:
            parse_gallery_payload(gallery_payload)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    async def execute(cls, gallery_payload: str = "", **_kwargs) -> io.NodeOutput:
        selections, options = parse_gallery_payload(gallery_payload)
        if not selections:
            return io.NodeOutput([], [])
        model_management.throw_exception_if_processing_interrupted()
        service = get_gallery_service()

        async def load(selection):
            data = await service.execution_bytes(selection.source, selection.post_id, selection.media_url)
            model_management.throw_exception_if_processing_interrupted()
            try:
                return await asyncio.to_thread(service.decode_image, data)
            except Exception as exc:
                raise RuntimeError(f"{selection.source} decode post {selection.post_id} failed: {exc}") from exc

        # gather preserves the selection order and fails the whole node atomically.
        images = await asyncio.gather(*(load(selection) for selection in selections))
        model_management.throw_exception_if_processing_interrupted()
        return io.NodeOutput(images, materialize_prompts(selections, options))
