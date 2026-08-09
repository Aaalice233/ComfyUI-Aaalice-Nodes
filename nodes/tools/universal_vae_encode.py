"""Universal VAE encoding with explicit image-batch and video semantics."""

from __future__ import annotations

from copy import copy
from typing import Any

from comfy_api.latest import io

IMAGE_BATCH = "image_batch"
VIDEO_FRAMES = "video_frames"
INPUT_MODES = (IMAGE_BATCH, VIDEO_FRAMES)


def _vae_for_input_mode(vae: Any, input_mode: str) -> Any:
    if input_mode not in INPUT_MODES:
        raise ValueError(
            f"UniversalVAEEncode: unsupported input_mode {input_mode!r}; "
            f"expected one of {INPUT_MODES}."
        )

    if vae.latent_dim != 3:
        if input_mode == VIDEO_FRAMES:
            raise ValueError(
                "UniversalVAEEncode: video_frames requires a 3D/video VAE; "
                "use image_batch with this VAE."
            )
        return vae

    # Current ComfyUI stores this input-layout choice on VAE. A shallow copy
    # keeps the shared model and patcher while avoiding mutation of the VAE
    # object used by other nodes in the same workflow.
    configured_vae = copy(vae)
    configured_vae.not_video = input_mode == IMAGE_BATCH
    return configured_vae


class UniversalVAEEncode(io.ComfyNode):
    """Encode independent images or an ordered video with the same VAE input."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="UniversalVAEEncode",
            display_name="🧬 Universal VAE Encode",
            category="Aaalice/tools",
            description=(
                "Encode an IMAGE batch as independent images or as one ordered video. "
                "ComfyUI keeps ownership of VAE batching, memory management, and tiled fallback."
            ),
            inputs=[
                io.Image.Input(
                    "pixels",
                    tooltip="Images to encode. Batch entries follow the selected input mode.",
                ),
                io.Vae.Input("vae", tooltip="VAE used to encode the input."),
                io.Combo.Input(
                    "input_mode",
                    options=list(INPUT_MODES),
                    default=IMAGE_BATCH,
                    tooltip=(
                        "Independent Images preserves one latent sample per image. "
                        "Video Frames requires a 3D/video VAE and treats the complete batch as one ordered clip."
                    ),
                ),
            ],
            outputs=[
                io.Latent.Output(
                    "latent",
                    display_name="latent",
                    tooltip="Encoded latent with batch and temporal layout determined by Input Mode.",
                ),
            ],
            search_aliases=[
                "vae encode batched",
                "image batch vae encode",
                "video vae encode",
                "qwen image vae",
                "seedvr2 vae",
            ],
        )

    @classmethod
    def execute(cls, pixels: Any, vae: Any, input_mode: str = IMAGE_BATCH) -> io.NodeOutput:
        if pixels.shape[0] == 0:
            raise ValueError("UniversalVAEEncode: pixels batch must contain at least one image.")

        encoder = _vae_for_input_mode(vae, input_mode)
        return io.NodeOutput({"samples": encoder.encode(pixels)})


__all__ = [
    "IMAGE_BATCH",
    "INPUT_MODES",
    "UniversalVAEEncode",
    "VIDEO_FRAMES",
]
