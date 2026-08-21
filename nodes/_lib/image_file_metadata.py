"""Read A1111 generation parameters from supported image files."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import ExifTags, Image

SUPPORTED_IMAGE_METADATA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
_EXPECTED_FORMATS = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".webp": "WEBP",
}
USER_COMMENT_TAG = 37510


def decode_exif_user_comment(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, bytes):
        raise TypeError("EXIF UserComment must be bytes or text")
    if value.startswith(b"UNICODE\0"):
        return value[8:].decode("utf-16be")
    if value.startswith(b"ASCII\0\0\0"):
        return value[8:].decode("ascii")
    if value.startswith(b"JIS\0\0\0\0\0"):
        return value[8:].decode("shift_jis")
    return value.decode("utf-8")


def read_exif_parameters(image: Image.Image) -> str | None:
    exif = image.getexif()
    user_comment = exif.get(USER_COMMENT_TAG)
    if user_comment is None:
        user_comment = exif.get_ifd(ExifTags.IFD.Exif).get(USER_COMMENT_TAG)
    if user_comment is None:
        return None
    return decode_exif_user_comment(user_comment) or None


def extract_image_generation_parameters(image_path: Path) -> str | None:
    extension = image_path.suffix.lower()
    if extension not in SUPPORTED_IMAGE_METADATA_EXTENSIONS:
        raise ValueError(
            "only PNG, JPEG, and WebP images support generation metadata; "
            f"received {extension or 'a file without an extension'}"
        )

    with Image.open(image_path) as image:
        expected_format = _EXPECTED_FORMATS[extension]
        if image.format != expected_format:
            raise ValueError(
                "file extension and image format do not match "
                f"({extension} / {image.format or 'unknown'})"
            )
        if image.format == "PNG":
            parameters = image.info.get("parameters")
            if parameters is None:
                return None
            if not isinstance(parameters, str):
                raise TypeError("PNG parameters metadata must be text")
            return parameters or None
        return read_exif_parameters(image)


__all__ = [
    "SUPPORTED_IMAGE_METADATA_EXTENSIONS",
    "USER_COMMENT_TAG",
    "decode_exif_user_comment",
    "extract_image_generation_parameters",
    "read_exif_parameters",
]
