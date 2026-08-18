"""Preview-image validation and storage normalization for the prompt library."""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PREVIEW_SOURCE_BYTES = 256 * 1024 * 1024
MAX_PREVIEW_SOURCE_PIXELS = 64 * 1024 * 1024
PREVIEW_MAX_EDGE = 2048
PREVIEW_TARGET_BYTES = 2 * 1024 * 1024


def detect_image(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    raise ValueError("preview image must be PNG, JPEG, GIF, or WebP")


def _webp(frame: Image.Image, quality: int) -> bytes:
    output = BytesIO()
    frame.save(output, format="WEBP", quality=quality, method=4)
    return output.getvalue()


def normalize_preview_image(data: bytes) -> tuple[bytes, str, str]:
    """Validate a source image and compact previews that exceed display needs."""
    if len(data) > MAX_PREVIEW_SOURCE_BYTES:
        raise ValueError("preview image source exceeds the safety limit")
    mime, extension = detect_image(data)
    try:
        with Image.open(BytesIO(data)) as source:
            width, height = source.size
            if width <= 0 or height <= 0 or width * height > MAX_PREVIEW_SOURCE_PIXELS:
                raise ValueError("preview image dimensions exceed the safety limit")
            needs_normalization = len(data) > PREVIEW_TARGET_BYTES or max(width, height) > PREVIEW_MAX_EDGE
            if bool(getattr(source, "is_animated", False)) or not needs_normalization:
                source.load()
                return data, mime, extension

            source.seek(0)
            frame = ImageOps.exif_transpose(source).copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("preview image is invalid or damaged") from exc

    frame.thumbnail((PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE), Image.Resampling.LANCZOS)
    has_alpha = "A" in frame.getbands() or (frame.mode == "P" and "transparency" in frame.info)
    frame = frame.convert("RGBA" if has_alpha else "RGB")
    encoded = b""
    for quality in (88, 80, 72, 64, 56):
        encoded = _webp(frame, quality)
        if len(encoded) <= PREVIEW_TARGET_BYTES:
            break
    while len(encoded) > PREVIEW_TARGET_BYTES and max(frame.size) > 512:
        scale = max(0.5, min(0.9, (PREVIEW_TARGET_BYTES / len(encoded)) ** 0.5 * 0.95))
        frame = frame.resize(
            (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
            Image.Resampling.LANCZOS,
        )
        encoded = _webp(frame, 56)
    return encoded, "image/webp", "webp"
