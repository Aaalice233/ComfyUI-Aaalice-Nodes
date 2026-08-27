"""Load an input image together with transferable generation metadata."""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path
from typing import Any

import folder_paths
from comfy_api.latest import io

from .._lib.image_file_metadata import extract_image_generation_parameters
from .._lib.image_generation_metadata import build_image_generation_metadata


def _resolve_image_path(image: str) -> Path:
    if not folder_paths.exists_annotated_filepath(image):
        raise FileNotFoundError(
            "LoadImageWithMetadata: image does not exist or is outside an allowed "
            f"ComfyUI folder: {image!r}"
        )
    return Path(folder_paths.get_annotated_filepath(image))


def _input_image_options() -> list[str]:
    input_dir = folder_paths.get_input_directory()
    files = [
        name
        for name in os.listdir(input_dir)
        if os.path.isfile(os.path.join(input_dir, name))
    ]
    return sorted(folder_paths.filter_files_content_types(files, ["image"]))


def _load_image_tensors(image: str) -> tuple[Any, Any]:
    core_nodes = sys.modules.get("nodes")
    mappings = getattr(core_nodes, "NODE_CLASS_MAPPINGS", None)
    loader_class = mappings.get("LoadImage") if isinstance(mappings, dict) else None
    load_image = getattr(loader_class, "load_image", None)
    if loader_class is None or not callable(load_image):
        raise RuntimeError(
            "LoadImageWithMetadata requires a compatible ComfyUI Load Image node; "
            "update ComfyUI and restart it."
        )
    result = load_image(loader_class(), image)
    if not isinstance(result, tuple) or len(result) != 2:
        raise RuntimeError(
            "LoadImageWithMetadata received an incompatible result from ComfyUI Load Image."
        )
    return result


class LoadImageWithMetadata(io.ComfyNode):
    """Extend the official input-image loader with complete metadata."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="LoadImageWithMetadata",
            display_name="🧾 Load Image with Metadata",
            category="Aaalice/tools",
            description=(
                "Load a PNG, JPEG, or WebP from the input folder and return its image, "
                "mask, and complete generation parameters."
            ),
            inputs=[
                io.Combo.Input(
                    "image",
                    options=_input_image_options(),
                    upload=io.UploadType.image,
                    tooltip="Input image to load. Images can also be uploaded or dropped here.",
                ),
            ],
            outputs=[
                io.Image.Output(
                    "image",
                    display_name="image",
                    tooltip="Loaded image pixels.",
                ),
                io.Mask.Output(
                    "mask",
                    display_name="mask",
                    tooltip="Loaded alpha mask, matching ComfyUI Load Image behavior.",
                ),
                io.Custom("METADATA").Output(
                    "metadata",
                    display_name="metadata",
                    tooltip="Complete source parameters, or explicit empty metadata when none exist.",
                ),
            ],
            search_aliases=[
                "load image metadata",
                "load image with metadata",
                "generation parameters",
                "transfer metadata",
            ],
        )

    @classmethod
    def validate_inputs(cls, image: str) -> bool | str:
        if not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True

    @classmethod
    def fingerprint_inputs(cls, image: str, **_kwargs) -> str:
        image_path = _resolve_image_path(image)
        digest = hashlib.sha256()
        with image_path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @classmethod
    def execute(cls, image: str) -> io.NodeOutput:
        image_path = _resolve_image_path(image)
        parameters = extract_image_generation_parameters(image_path)
        loaded_image, mask = _load_image_tensors(image)
        return io.NodeOutput(
            loaded_image,
            mask,
            build_image_generation_metadata(parameters),
        )


__all__ = ["LoadImageWithMetadata"]
