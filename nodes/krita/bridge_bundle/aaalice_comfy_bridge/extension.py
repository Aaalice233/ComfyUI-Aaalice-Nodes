"""Krita-side implementation of the Aaalice snapshot protocol."""

from __future__ import annotations

import json
import os
import tempfile
import time
import traceback
from pathlib import Path
from uuid import uuid4

from krita import Extension, Krita
from PyQt5.QtCore import QByteArray, QTimer
from PyQt5.QtGui import QImage

PROTOCOL_VERSION = 1
BRIDGE_VERSION = "1.2.0"
STALE_FILE_AGE = 24 * 60 * 60
METADATA_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _root() -> Path:
    return Path(tempfile.gettempdir()) / "aaalice-krita-bridge"


def _atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(str(temporary), str(path))
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


class AaaliceComfyBridgeExtension(Extension):
    def __init__(self, parent):
        super().__init__(parent)
        self.root = _root()
        self.requests = self.root / "requests"
        self.responses = self.root / "responses"
        self.payloads = self.root / "payloads"
        self.timer = None
        self.last_status_write = 0.0

    def setup(self):
        for path in (self.requests, self.responses, self.payloads):
            path.mkdir(parents=True, exist_ok=True)
        self._cleanup_stale_files()
        self._write_status()
        self.timer = QTimer()
        self.timer.timeout.connect(self._tick)
        self.timer.start(250)

    def createActions(self, window):
        del window

    def _document_info(self):
        document = Krita.instance().activeDocument()
        if document is None:
            return None
        return {
            "name": document.name() or "Untitled",
            "width": int(document.width()),
            "height": int(document.height()),
            "color_model": str(document.colorModel()),
        }

    def _write_status(self):
        _atomic_json(self.root / "status.json", {
            "protocol": PROTOCOL_VERSION,
            "bridge_version": BRIDGE_VERSION,
            "updated_at": time.time(),
            "document": self._document_info(),
        })
        self.last_status_write = time.time()

    def _cleanup_stale_files(self):
        cutoff = time.time() - STALE_FILE_AGE
        for directory in (self.requests, self.responses, self.payloads):
            for path in directory.iterdir():
                try:
                    if path.is_file() and path.stat().st_mtime < cutoff:
                        path.unlink()
                except FileNotFoundError:
                    pass

    def _tick(self):
        try:
            if time.time() - self.last_status_write >= 1.0:
                self._write_status()
            for request_path in sorted(self.requests.glob("*.json")):
                self._handle_request(request_path)
        except Exception:
            traceback.print_exc()

    def _response(self, request_id: str, **data):
        _atomic_json(self.responses / f"{request_id}.json", {
            "protocol": PROTOCOL_VERSION,
            "request_id": request_id,
            **data,
        })

    def _failure(self, request_id: str, code: str, message: str):
        self._response(request_id, status="error", error={"code": code, "message": message})

    def _handle_request(self, request_path: Path):
        processing = request_path.with_suffix(".processing")
        try:
            request_path.rename(processing)
        except FileNotFoundError:
            return
        file_request_id = processing.stem
        request_id = file_request_id
        try:
            with processing.open("r", encoding="utf-8") as handle:
                request = json.load(handle)
            request_id = str(request.get("request_id") or file_request_id)
            if request.get("protocol") != PROTOCOL_VERSION:
                self._failure(request_id, "protocol-mismatch", "ComfyUI and Krita Bridge protocol versions do not match")
                return
            if request.get("action") != "fetch_snapshot":
                self._failure(request_id, "unknown-action", "Krita Bridge does not support this request action")
                return
            if request_id != file_request_id:
                self._failure(file_request_id, "request-mismatch", "request identity does not match its filename")
                return
            deadline = request.get("deadline")
            if not isinstance(deadline, (int, float)) or time.time() > float(deadline):
                self._failure(request_id, "request-expired", "the Krita snapshot request expired before it was handled")
                return
            self._response(request_id, status="processing")
            self._fetch_snapshot(request_id)
        except Exception as exc:
            self._failure(request_id, "bridge-error", f"Krita Bridge failed to process the request: {exc}")
            traceback.print_exc()
        finally:
            try:
                processing.unlink()
            except FileNotFoundError:
                pass

    @staticmethod
    def _source_path(document):
        filename = document.fileName()
        if not filename:
            return None
        path = Path(filename)
        if path.suffix.lower() not in METADATA_IMAGE_EXTENSIONS:
            return None
        return str(path.resolve())

    def _fetch_snapshot(self, request_id: str):
        document = Krita.instance().activeDocument()
        if document is None:
            self._failure(request_id, "no-active-document", "Krita has no active document")
            return
        width = int(document.width())
        height = int(document.height())
        original_batch_mode = document.batchmode()
        try:
            document.setBatchmode(True)
            document.refreshProjection()
            image_path = self.payloads / f"{request_id}-image.png"
            self._save_projection(document, image_path, width, height)
            selection = document.selection()
            if selection is None:
                selection_data = {"present": False, "mask_path": None, "bounds": None}
            else:
                mask_path = self.payloads / f"{request_id}-mask.png"
                self._save_selection(selection, mask_path, width, height)
                selection_data = {
                    "present": True,
                    "mask_path": str(mask_path.resolve()),
                    "bounds": [int(selection.x()), int(selection.y()), int(selection.width()), int(selection.height())],
                }
            self._response(
                request_id,
                status="success",
                document={
                    "name": document.name() or "Untitled",
                    "width": width,
                    "height": height,
                    "color_model": str(document.colorModel()),
                },
                image_path=str(image_path.resolve()),
                source_path=self._source_path(document),
                selection=selection_data,
            )
        finally:
            document.setBatchmode(original_batch_mode)

    @staticmethod
    def _save_projection(document, path: Path, width: int, height: int):
        pixels = document.pixelData(0, 0, width, height)
        if not pixels or pixels.size() != width * height * 4:
            raise RuntimeError("Krita returned an invalid active-document projection")
        image = QImage(pixels, width, height, width * 4, QImage.Format_ARGB32)
        if image.isNull() or not image.save(str(path), "PNG"):
            raise RuntimeError("Krita could not export the active-document projection")

    @staticmethod
    def _save_selection(selection, path: Path, width: int, height: int):
        pixels = selection.pixelData(0, 0, width, height)
        if not pixels or pixels.size() != width * height:
            raise RuntimeError("Krita returned an invalid selection mask")
        buffer = QByteArray(pixels)
        image = QImage(buffer, width, height, width, QImage.Format_Grayscale8)
        if image.isNull() or not image.save(str(path), "PNG"):
            raise RuntimeError("Krita could not export the current selection")
