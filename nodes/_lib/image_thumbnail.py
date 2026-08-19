"""Small cached previews for local ComfyUI image references."""

from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageOps

THUMBNAIL_MAX_EDGE = 256


@lru_cache(maxsize=256)
def render_image_thumbnail(path: str, modified_ns: int, source_size: int) -> bytes:
    """Render a bounded WebP preview; stat values make overwritten files new cache keys."""
    del modified_ns, source_size
    with Image.open(path) as source:
        source.seek(0)
        source.thumbnail(
            (THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE),
            Image.Resampling.LANCZOS,
            reducing_gap=3.0,
        )
        with ImageOps.exif_transpose(source) as image:
            output = io.BytesIO()
            if image.mode in {"RGB", "RGBA"}:
                image.save(output, format="WEBP", quality=75, method=4)
            else:
                has_alpha = "A" in image.getbands() or "transparency" in image.info
                with image.convert("RGBA" if has_alpha else "RGB") as converted:
                    converted.save(output, format="WEBP", quality=75, method=4)
            return output.getvalue()


def thumbnail_etag(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return f'"{stat.st_mtime_ns:x}-{stat.st_size:x}-{THUMBNAIL_MAX_EDGE:x}"', stat.st_mtime_ns, stat.st_size


__all__ = ["THUMBNAIL_MAX_EDGE", "render_image_thumbnail", "thumbnail_etag"]
