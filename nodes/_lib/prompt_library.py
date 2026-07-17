"""SQLite prompt-library domain service and portable archive codec."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import time
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SCHEMA_VERSION = 1
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024
MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024
MAX_EXPANDED_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_MANIFEST_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_FILES = 100_000
IMPORT_STAGE_TTL_SECONDS = 60 * 60
DEFAULT_COLLECTION_ID = "00000000-0000-5000-8000-000000000001"
DEFAULT_COLLECTION_NAME = "Favorites"
CATEGORY_COLOR_PALETTE = (
    "#7C3AED", "#2563EB", "#0891B2", "#0D9488",
    "#059669", "#65A30D", "#CA8A04", "#D97706",
    "#EA580C", "#DC2626", "#E11D48", "#DB2777",
    "#C026D3", "#9333EA", "#4F46E5", "#0284C7",
)


def _id(value: Any = None) -> str:
    return value if isinstance(value, str) and value else str(uuid.uuid4())


def _text(value: Any, field: str, *, empty: bool = True) -> str:
    if not isinstance(value, str) or (not empty and not value.strip()):
        raise ValueError(f"{field} must be a string" + ("" if empty else " and cannot be empty"))
    return value


def _category_color(value: Any, fallback: str | None = None) -> str:
    if value is None or value == "":
        if fallback is not None:
            return fallback
        raise ValueError("category color is required")
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#" or any(
        character not in "0123456789abcdefABCDEF" for character in value[1:]
    ):
        raise ValueError("category color must use #RRGGBB format")
    return value.upper()


def detect_image(data: bytes) -> tuple[str, str]:
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError(f"preview image exceeds {MAX_IMAGE_BYTES} bytes")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    raise ValueError("preview image must be PNG, JPEG, GIF, or WebP")


class PromptLibrary:
    def __init__(self, root: str | os.PathLike[str]):
        self.root = Path(root)
        self.db_path = self.root / "prompt-library.sqlite3"
        self.asset_root = self.root / "assets"
        self.stage_root = self.root / "import-staging"
        self.export_root = self.root / "export-staging"
        self.root.mkdir(parents=True, exist_ok=True)
        self.asset_root.mkdir(parents=True, exist_ok=True)
        self.stage_root.mkdir(parents=True, exist_ok=True)
        self.export_root.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    @contextmanager
    def connection(self):
        db = self._connect()
        try:
            yield db
        finally:
            db.close()

    def _initialize(self) -> None:
        with self.connection() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
                    color TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS assets (
                    hash TEXT PRIMARY KEY, mime TEXT NOT NULL, extension TEXT NOT NULL, size INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
                    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
                    preview_hash TEXT REFERENCES assets(hash) ON DELETE SET NULL,
                    position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS entry_tags (
                    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
                    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY(entry_id, tag_id)
                );
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS collection_entries (
                    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(collection_id, entry_id)
                );
                """
            )
            columns = {row["name"] for row in db.execute("PRAGMA table_info(categories)")}
            if "color" not in columns:
                db.execute("ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT ''")
            category_rows = db.execute("SELECT id, color FROM categories ORDER BY position, name, id").fetchall()
            for index, row in enumerate(category_rows):
                fallback = CATEGORY_COLOR_PALETTE[index % len(CATEGORY_COLOR_PALETTE)]
                try:
                    color = _category_color(row["color"], fallback)
                except ValueError:
                    color = fallback
                if row["color"] != color:
                    db.execute("UPDATE categories SET color = ? WHERE id = ?", (color, row["id"]))
            default_position = int(db.execute("SELECT COALESCE(MIN(position), 1) - 1 FROM collections").fetchone()[0])
            db.execute(
                "INSERT OR IGNORE INTO collections(id, name, position) VALUES (?, ?, ?)",
                (DEFAULT_COLLECTION_ID, DEFAULT_COLLECTION_NAME, default_position),
            )
            db.commit()

    @contextmanager
    def transaction(self):
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _rows(db: sqlite3.Connection, query: str, values: Iterable[Any] = ()) -> list[dict[str, Any]]:
        return [dict(row) for row in db.execute(query, tuple(values)).fetchall()]

    def snapshot(self) -> dict[str, Any]:
        with self.connection() as db:
            entries = self._rows(db, "SELECT * FROM entries ORDER BY position, title, id")
            tags = self._rows(db, "SELECT * FROM tags ORDER BY name, id")
            entry_tags: dict[str, list[str]] = {}
            for row in db.execute("SELECT entry_id, tag_id FROM entry_tags ORDER BY tag_id"):
                entry_tags.setdefault(row["entry_id"], []).append(row["tag_id"])
            memberships: dict[str, list[dict[str, Any]]] = {}
            for row in db.execute(
                "SELECT collection_id, entry_id, position FROM collection_entries ORDER BY collection_id, position"
            ):
                memberships.setdefault(row["entry_id"], []).append(
                    {"collectionId": row["collection_id"], "position": row["position"]}
                )
            for entry in entries:
                entry["categoryId"] = entry.pop("category_id")
                entry["previewHash"] = entry.pop("preview_hash")
                entry["updatedAt"] = entry.pop("updated_at")
                entry["tagIds"] = entry_tags.get(entry["id"], [])
                entry["collections"] = memberships.get(entry["id"], [])
            return {
                "version": SCHEMA_VERSION,
                "categories": self._rows(db, "SELECT * FROM categories ORDER BY position, name, id"),
                "collections": self._rows(db, "SELECT * FROM collections ORDER BY position, name, id"),
                "tags": tags,
                "entries": entries,
            }

    def _next_position(self, db: sqlite3.Connection, table: str) -> int:
        return int(db.execute(f"SELECT COALESCE(MAX(position), -1) + 1 FROM {table}").fetchone()[0])

    @staticmethod
    def _next_category_color(db: sqlite3.Connection, position: int) -> str:
        used = {row[0].upper() for row in db.execute("SELECT color FROM categories") if row[0]}
        return next(
            (color for color in CATEGORY_COLOR_PALETTE if color not in used),
            CATEGORY_COLOR_PALETTE[position % len(CATEGORY_COLOR_PALETTE)],
        )

    def create_category(self, data: dict[str, Any]) -> dict[str, Any]:
        category_id = _id(data.get("id"))
        with self.transaction() as db:
            position = int(data.get("position", self._next_position(db, "categories")))
            color = _category_color(data.get("color"), self._next_category_color(db, position))
            db.execute("INSERT INTO categories(id, name, position, color) VALUES (?, ?, ?, ?)",
                       (category_id, _text(data.get("name"), "category name", empty=False), position, color))
        return next(item for item in self.snapshot()["categories"] if item["id"] == category_id)

    def update_category(self, category_id: str, data: dict[str, Any]) -> None:
        self._update_named("categories", category_id, data)

    def delete_category(self, category_id: str) -> None:
        self._delete("categories", category_id)

    def create_collection(self, data: dict[str, Any]) -> dict[str, Any]:
        collection_id = _id(data.get("id"))
        with self.transaction() as db:
            position = int(data.get("position", self._next_position(db, "collections")))
            db.execute("INSERT INTO collections(id, name, position) VALUES (?, ?, ?)",
                       (collection_id, _text(data.get("name"), "collection name", empty=False), position))
        return next(item for item in self.snapshot()["collections"] if item["id"] == collection_id)

    def update_collection(self, collection_id: str, data: dict[str, Any]) -> None:
        self._update_named("collections", collection_id, data)

    def delete_collection(self, collection_id: str) -> None:
        if collection_id == DEFAULT_COLLECTION_ID:
            raise ValueError("the default favorites collection cannot be deleted")
        self._delete("collections", collection_id)

    def _update_named(self, table: str, item_id: str, data: dict[str, Any]) -> None:
        fields: list[str] = []
        values: list[Any] = []
        if "name" in data:
            fields.append("name = ?")
            values.append(_text(data["name"], f"{table} name", empty=False))
        if "position" in data:
            fields.append("position = ?")
            values.append(int(data["position"]))
        if table == "categories" and "color" in data:
            fields.append("color = ?")
            values.append(_category_color(data["color"]))
        if not fields:
            return
        with self.transaction() as db:
            cursor = db.execute(f"UPDATE {table} SET {', '.join(fields)} WHERE id = ?", (*values, item_id))
            if not cursor.rowcount:
                raise KeyError(f"{table} item not found: {item_id}")

    def _delete(self, table: str, item_id: str) -> None:
        with self.transaction() as db:
            cursor = db.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
            if not cursor.rowcount:
                raise KeyError(f"{table} item not found: {item_id}")

    def create_entry(self, data: dict[str, Any]) -> dict[str, Any]:
        entry_id = _id(data.get("id"))
        with self.transaction() as db:
            position = int(data.get("position", self._next_position(db, "entries")))
            db.execute(
                "INSERT INTO entries(id,title,text,note,category_id,position) VALUES (?,?,?,?,?,?)",
                (entry_id, _text(data.get("title"), "entry title", empty=False),
                 _text(data.get("text"), "entry text"), _text(data.get("note", ""), "entry note"),
                 data.get("categoryId"), position),
            )
            self._set_entry_relations(db, entry_id, data)
        return self.get_entry(entry_id)

    def get_entry(self, entry_id: str) -> dict[str, Any]:
        for entry in self.snapshot()["entries"]:
            if entry["id"] == entry_id:
                return entry
        raise KeyError(f"entry not found: {entry_id}")

    def update_entry(self, entry_id: str, data: dict[str, Any]) -> dict[str, Any]:
        mapping = {"title": "title", "text": "text", "note": "note", "categoryId": "category_id", "position": "position"}
        fields: list[str] = []
        values: list[Any] = []
        for source, column in mapping.items():
            if source not in data:
                continue
            value = data[source]
            if source in {"title", "text", "note"}:
                value = _text(value, f"entry {source}", empty=source != "title")
            if source == "position":
                value = int(value)
            fields.append(f"{column} = ?")
            values.append(value)
        with self.transaction() as db:
            exists = db.execute("SELECT 1 FROM entries WHERE id = ?", (entry_id,)).fetchone()
            if not exists:
                raise KeyError(f"entry not found: {entry_id}")
            if fields:
                db.execute(f"UPDATE entries SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (*values, entry_id))
            self._set_entry_relations(db, entry_id, data)
        return self.get_entry(entry_id)

    def _set_entry_relations(self, db: sqlite3.Connection, entry_id: str, data: dict[str, Any]) -> None:
        if "tags" in data:
            tags = data["tags"]
            if not isinstance(tags, list):
                raise ValueError("entry tags must be a list")
            db.execute("DELETE FROM entry_tags WHERE entry_id = ?", (entry_id,))
            for name in dict.fromkeys(_text(tag, "tag", empty=False).strip() for tag in tags):
                row = db.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
                tag_id = row[0] if row else str(uuid.uuid4())
                if not row:
                    db.execute("INSERT INTO tags(id, name) VALUES (?, ?)", (tag_id, name))
                db.execute("INSERT INTO entry_tags(entry_id, tag_id) VALUES (?, ?)", (entry_id, tag_id))
        if "collectionIds" in data:
            collection_ids = data["collectionIds"]
            if not isinstance(collection_ids, list):
                raise ValueError("entry collectionIds must be a list")
            db.execute("DELETE FROM collection_entries WHERE entry_id = ?", (entry_id,))
            for position, collection_id in enumerate(dict.fromkeys(collection_ids)):
                db.execute(
                    "INSERT INTO collection_entries(collection_id, entry_id, position) VALUES (?, ?, ?)",
                    (collection_id, entry_id, position),
                )

    def delete_entry(self, entry_id: str) -> None:
        with self.transaction() as db:
            row = db.execute("SELECT preview_hash FROM entries WHERE id = ?", (entry_id,)).fetchone()
            if not row:
                raise KeyError(f"entry not found: {entry_id}")
            preview_hash = row[0]
            db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        if preview_hash:
            self._cleanup_asset(preview_hash)

    def delete_entries(self, entry_ids: list[str]) -> int:
        unique_ids = list(dict.fromkeys(entry_ids))
        if not unique_ids:
            return 0
        with self.transaction() as db:
            placeholders = ",".join("?" for _ in unique_ids)
            rows = db.execute(
                f"SELECT id, preview_hash FROM entries WHERE id IN ({placeholders})",
                unique_ids,
            ).fetchall()
            if len(rows) != len(unique_ids):
                raise KeyError("one or more prompt entries are missing")
            preview_hashes = {row[1] for row in rows if row[1]}
            db.execute(f"DELETE FROM entries WHERE id IN ({placeholders})", unique_ids)
        for preview_hash in preview_hashes:
            self._cleanup_asset(preview_hash)
        return len(unique_ids)

    def batch_update_entries(
        self,
        entry_ids: list[str],
        *,
        category_id: str | None = None,
        set_category: bool = False,
        add_collection_id: str | None = None,
        remove_collection_id: str | None = None,
    ) -> int:
        unique_ids = list(dict.fromkeys(entry_ids))
        if not unique_ids:
            return 0
        with self.transaction() as db:
            placeholders = ",".join("?" for _ in unique_ids)
            found = int(db.execute(f"SELECT COUNT(*) FROM entries WHERE id IN ({placeholders})", unique_ids).fetchone()[0])
            if found != len(unique_ids):
                raise KeyError("one or more prompt entries are missing")
            if set_category:
                db.execute(f"UPDATE entries SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
                           (category_id, *unique_ids))
            if add_collection_id:
                start = int(db.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM collection_entries WHERE collection_id = ?",
                    (add_collection_id,),
                ).fetchone()[0])
                for offset, entry_id in enumerate(unique_ids):
                    db.execute(
                        "INSERT OR IGNORE INTO collection_entries(collection_id,entry_id,position) VALUES (?,?,?)",
                        (add_collection_id, entry_id, start + offset),
                    )
            if remove_collection_id:
                db.execute(
                    f"DELETE FROM collection_entries WHERE collection_id = ? AND entry_id IN ({placeholders})",
                    (remove_collection_id, *unique_ids),
                )
        return len(unique_ids)

    def reorder(self, kind: str, ordered_ids: list[str], *, collection_id: str | None = None) -> None:
        if len(ordered_ids) != len(set(ordered_ids)):
            raise ValueError("reorder ids must be unique")
        table = {"categories": "categories", "collections": "collections", "entries": "entries"}.get(kind)
        with self.transaction() as db:
            if kind == "collection_entries":
                if not collection_id:
                    raise ValueError("collectionId is required for collection entry ordering")
                for position, entry_id in enumerate(ordered_ids):
                    cursor = db.execute(
                        "UPDATE collection_entries SET position = ? WHERE collection_id = ? AND entry_id = ?",
                        (position, collection_id, entry_id),
                    )
                    if not cursor.rowcount:
                        raise KeyError(f"collection entry not found: {entry_id}")
                return
            if not table:
                raise ValueError(f"unsupported reorder kind: {kind}")
            for position, item_id in enumerate(ordered_ids):
                cursor = db.execute(f"UPDATE {table} SET position = ? WHERE id = ?", (position, item_id))
                if not cursor.rowcount:
                    raise KeyError(f"{kind} item not found: {item_id}")

    def set_preview(self, entry_id: str, data: bytes) -> dict[str, Any]:
        mime, extension = detect_image(data)
        digest = hashlib.sha256(data).hexdigest()
        asset_path = self.asset_root / f"{digest}.{extension}"
        temporary: Path | None = None
        created_asset = False
        try:
            with self.transaction() as db:
                row = db.execute("SELECT preview_hash FROM entries WHERE id = ?", (entry_id,)).fetchone()
                if not row:
                    raise KeyError(f"entry not found: {entry_id}")
                previous = row[0]
                if not asset_path.exists():
                    fd, name = tempfile.mkstemp(dir=self.asset_root, prefix="upload-")
                    os.close(fd)
                    temporary = Path(name)
                    temporary.write_bytes(data)
                    temporary.replace(asset_path)
                    temporary = None
                    created_asset = True
                db.execute("INSERT OR IGNORE INTO assets(hash,mime,extension,size) VALUES (?,?,?,?)",
                           (digest, mime, extension, len(data)))
                db.execute("UPDATE entries SET preview_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (digest, entry_id))
        except Exception:
            if temporary:
                temporary.unlink(missing_ok=True)
            if created_asset:
                asset_path.unlink(missing_ok=True)
            raise
        if previous and previous != digest:
            self._cleanup_asset(previous)
        return {"hash": digest, "mime": mime, "extension": extension, "size": len(data)}

    def delete_preview(self, entry_id: str) -> None:
        with self.transaction() as db:
            row = db.execute("SELECT preview_hash FROM entries WHERE id = ?", (entry_id,)).fetchone()
            if not row:
                raise KeyError(f"entry not found: {entry_id}")
            digest = row[0]
            db.execute("UPDATE entries SET preview_hash = NULL WHERE id = ?", (entry_id,))
        if digest:
            self._cleanup_asset(digest)

    def _cleanup_asset(self, digest: str) -> None:
        with self.transaction() as db:
            if db.execute("SELECT 1 FROM entries WHERE preview_hash = ?", (digest,)).fetchone():
                return
            row = db.execute("SELECT extension FROM assets WHERE hash = ?", (digest,)).fetchone()
            db.execute("DELETE FROM assets WHERE hash = ?", (digest,))
        if row:
            (self.asset_root / f"{digest}.{row[0]}").unlink(missing_ok=True)

    def asset(self, digest: str) -> tuple[Path, str]:
        with self.connection() as db:
            row = db.execute("SELECT extension,mime FROM assets WHERE hash = ?", (digest,)).fetchone()
        if not row:
            raise KeyError(f"asset not found: {digest}")
        return self.asset_root / f"{digest}.{row['extension']}", row["mime"]

    def export_archive_to_path(self, *, entry_ids: list[str] | None = None, category_id: str | None = None,
                               collection_id: str | None = None) -> Path:
        snapshot = self.snapshot()
        selected = snapshot["entries"]
        if entry_ids is not None:
            wanted = set(entry_ids)
            selected = [entry for entry in selected if entry["id"] in wanted]
        if category_id:
            selected = [entry for entry in selected if entry["categoryId"] == category_id]
        if collection_id:
            selected = [entry for entry in selected if any(item["collectionId"] == collection_id for item in entry["collections"])]
        selected_ids = {entry["id"] for entry in selected}
        category_ids = {entry["categoryId"] for entry in selected if entry["categoryId"]}
        collection_ids = {item["collectionId"] for entry in selected for item in entry["collections"]}
        tag_ids = {tag for entry in selected for tag in entry["tagIds"]}
        manifest = {
            "format": "aaalice-prompt-library", "version": SCHEMA_VERSION,
            "categories": [item for item in snapshot["categories"] if item["id"] in category_ids],
            "collections": [item for item in snapshot["collections"] if item["id"] in collection_ids],
            "tags": [item for item in snapshot["tags"] if item["id"] in tag_ids],
            "entries": selected,
            "selection": {"entryIds": sorted(selected_ids)},
        }
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        if len(manifest_bytes) > MAX_MANIFEST_BYTES:
            raise ValueError(f"export manifest exceeds {MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
        assets = [self.asset(digest)[0] for digest in sorted({entry["previewHash"] for entry in selected if entry["previewHash"]})]
        if len(manifest_bytes) + sum(path.stat().st_size for path in assets) > MAX_EXPORT_BYTES:
            raise ValueError("export content exceeds 2 GiB limit")
        fd, name = tempfile.mkstemp(dir=self.root, prefix="export-", suffix=".zip")
        os.close(fd)
        output = Path(name)
        try:
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                archive.writestr("manifest.json", manifest_bytes)
                for path in assets:
                    archive.write(path, f"assets/{path.name}")
            if output.stat().st_size > MAX_EXPORT_BYTES:
                raise ValueError("export archive exceeds 2 GiB limit")
            return output
        except Exception:
            output.unlink(missing_ok=True)
            raise

    def _stage_path(self, token: str) -> Path:
        if not isinstance(token, str) or len(token) != 36 or any(character not in "0123456789abcdef-" for character in token):
            raise ValueError("invalid import token")
        path = self.stage_root / token
        if path.parent != self.stage_root or not path.is_dir():
            raise KeyError("import preview has expired or does not exist")
        return path

    def cleanup_import_stages(self) -> None:
        cutoff = time.time() - IMPORT_STAGE_TTL_SECONDS
        for path in self.stage_root.iterdir():
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)

    def prepare_export(self, **filters: Any) -> tuple[str, int]:
        cutoff = time.time() - IMPORT_STAGE_TTL_SECONDS
        for path in self.export_root.glob("*.zip"):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        path = self.export_archive_to_path(**filters)
        token = str(uuid.uuid4())
        target = self.export_root / f"{token}.zip"
        path.replace(target)
        return token, target.stat().st_size

    def export_path(self, token: str) -> Path:
        if not isinstance(token, str) or len(token) != 36 or any(character not in "0123456789abcdef-" for character in token):
            raise ValueError("invalid export token")
        path = self.export_root / f"{token}.zip"
        if path.parent != self.export_root or not path.is_file():
            raise KeyError("export has expired or does not exist")
        return path

    def discard_import(self, token: str) -> None:
        shutil.rmtree(self._stage_path(token), ignore_errors=True)

    def prepare_import(self, source: Path, filename: str = "") -> tuple[str, dict[str, Any]]:
        if source.stat().st_size > MAX_IMPORT_BYTES:
            raise ValueError("import file exceeds 2 GiB limit")
        self.cleanup_import_stages()
        token = str(uuid.uuid4())
        stage = self.stage_root / token
        (stage / "assets").mkdir(parents=True)
        try:
            manifest = self._decode_import_path(source, filename, stage / "assets")
            self._validate_manifest(manifest)
            referenced_assets = {entry.get("previewHash") for entry in manifest["entries"] if isinstance(entry, dict) and entry.get("previewHash")}
            staged_assets = {path.stem for path in (stage / "assets").iterdir() if path.is_file()}
            if referenced_assets - staged_assets:
                raise ValueError(f"missing preview asset: {sorted(referenced_assets - staged_assets)[0]}")
            if staged_assets - referenced_assets:
                raise ValueError(f"archive contains unreferenced preview assets: {sorted(staged_assets - referenced_assets)[0]}")
            manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
            if len(manifest_bytes) > MAX_MANIFEST_BYTES:
                raise ValueError(f"import manifest exceeds {MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
            (stage / "manifest.json").write_bytes(manifest_bytes)
            return token, manifest
        except Exception:
            shutil.rmtree(stage, ignore_errors=True)
            raise

    def _decode_import_path(self, source: Path, filename: str, asset_root: Path) -> dict[str, Any]:
        with source.open("rb") as handle:
            signature = handle.read(2)
        if filename.lower().endswith(".json") or signature != b"PK":
            if source.stat().st_size > MAX_MANIFEST_BYTES:
                raise ValueError(f"import JSON exceeds {MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
            try:
                raw = json.loads(source.read_text(encoding="utf-8-sig"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("invalid prompt-library JSON") from exc
            return self._normalize_old_json(raw)
        with zipfile.ZipFile(source) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_FILES:
                raise ValueError("archive contains too many files")
            total = 0
            for info in infos:
                path = PurePosixPath(info.filename)
                if path.is_absolute() or ".." in path.parts or "\\" in info.filename:
                    raise ValueError(f"unsafe archive path: {info.filename}")
                total += info.file_size
                if total > MAX_EXPANDED_ARCHIVE_BYTES:
                    raise ValueError(
                        f"expanded archive exceeds {MAX_EXPANDED_ARCHIVE_BYTES // (1024 * 1024)} MiB limit"
                    )
            names = {info.filename for info in infos}
            if "manifest.json" in names:
                manifest_info = archive.getinfo("manifest.json")
                if manifest_info.file_size > MAX_MANIFEST_BYTES:
                    raise ValueError(f"manifest.json exceeds {MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
                try:
                    manifest = json.loads(archive.read("manifest.json"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise ValueError("archive has no valid manifest.json") from exc
                for info in infos:
                    if not info.filename.startswith("assets/") or info.is_dir():
                        continue
                    if info.file_size > MAX_IMAGE_BYTES:
                        raise ValueError(f"preview image exceeds {MAX_IMAGE_BYTES} bytes")
                    content = archive.read(info)
                    digest = PurePosixPath(info.filename).stem
                    if hashlib.sha256(content).hexdigest() != digest:
                        raise ValueError(f"asset hash mismatch: {info.filename}")
                    detect_image(content)
                    (asset_root / f"{digest}.{detect_image(content)[1]}").write_bytes(content)
            elif "data.json" in names:
                if archive.getinfo("data.json").file_size > MAX_MANIFEST_BYTES:
                    raise ValueError(f"data.json exceeds {MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
                try:
                    legacy_data = json.loads(archive.read("data.json"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise ValueError("legacy archive has no valid data.json") from exc
                legacy_infos = {info.filename.replace("\\", "/"): info for info in infos if info.filename.startswith("preview/") and not info.is_dir()}
                def load_legacy(name: str) -> bytes | None:
                    info = legacy_infos.get(name)
                    if info is None:
                        return None
                    if info.file_size > MAX_IMAGE_BYTES:
                        raise ValueError(f"preview image exceeds {MAX_IMAGE_BYTES} bytes")
                    return archive.read(info)

                def store_legacy(digest: str, content: bytes, extension: str) -> None:
                    (asset_root / f"{digest}.{extension}").write_bytes(content)
                manifest = self._normalize_old_json(legacy_data, load_legacy, store_legacy)
            else:
                raise ValueError("archive has neither manifest.json nor legacy data.json")
        return manifest

    def staged_import(self, token: str) -> tuple[dict[str, Any], dict[str, Path]]:
        stage = self._stage_path(token)
        try:
            manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("staged import manifest is invalid") from exc
        assets = {path.stem: path for path in (stage / "assets").iterdir() if path.is_file()}
        return manifest, assets

    @staticmethod
    def _validate_manifest(manifest: Any) -> None:
        if not isinstance(manifest, dict) or manifest.get("format") != "aaalice-prompt-library":
            raise ValueError("unsupported prompt-library manifest")
        if manifest.get("version") != SCHEMA_VERSION:
            raise ValueError(f"unsupported prompt-library version: {manifest.get('version')!r}")
        for field in ("categories", "collections", "tags", "entries"):
            if not isinstance(manifest.get(field), list):
                raise ValueError(f"manifest {field} must be a list")
        for field in ("categories", "collections", "tags"):
            seen: set[str] = set()
            for index, item in enumerate(manifest[field]):
                if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
                    raise ValueError(f"manifest {field}[{index}] has no valid id")
                if item["id"] in seen:
                    raise ValueError(f"manifest {field} contains duplicate id: {item['id']}")
                if not isinstance(item.get("name"), str) or not item["name"].strip():
                    raise ValueError(f"manifest {field}[{index}] has no valid name")
                if "position" in item and (not isinstance(item["position"], int) or isinstance(item["position"], bool)):
                    raise ValueError(f"manifest {field}[{index}] has an invalid position")
                if field == "categories" and "color" in item:
                    try:
                        _category_color(item["color"])
                    except ValueError as exc:
                        raise ValueError(f"manifest categories[{index}] has an invalid color") from exc
                seen.add(item["id"])

    @staticmethod
    def _entry_problem(raw: Any, manifest: dict[str, Any]) -> str | None:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not raw["id"]:
            return "entry has no valid id"
        for field in ("title", "text", "note"):
            if field in raw and not isinstance(raw[field], str):
                return f"entry {field} must be a string"
        if not isinstance(raw.get("text"), str):
            return "entry text must be a string"
        if "position" in raw and (not isinstance(raw["position"], int) or isinstance(raw["position"], bool)):
            return "entry position must be an integer"
        category_ids = {item["id"] for item in manifest["categories"]}
        if raw.get("categoryId") is not None and raw.get("categoryId") not in category_ids:
            return "entry references an unknown category"
        tag_ids = raw.get("tagIds", [])
        known_tags = {item["id"] for item in manifest["tags"]}
        if not isinstance(tag_ids, list) or not all(isinstance(item, str) and item in known_tags for item in tag_ids):
            return "entry contains an invalid tag reference"
        memberships = raw.get("collections", [])
        known_collections = {item["id"] for item in manifest["collections"]}
        if not isinstance(memberships, list):
            return "entry collections must be a list"
        for membership in memberships:
            if not isinstance(membership, dict) or membership.get("collectionId") not in known_collections:
                return "entry contains an invalid collection reference"
            if "position" in membership and (not isinstance(membership["position"], int) or isinstance(membership["position"], bool)):
                return "entry collection position must be an integer"
        preview_hash = raw.get("previewHash")
        if preview_hash is not None and (not isinstance(preview_hash, str) or len(preview_hash) != 64 or any(character not in "0123456789abcdef" for character in preview_hash)):
            return "entry preview hash must be lowercase SHA-256"
        return None

    @staticmethod
    def _normalize_old_json(
        raw: Any,
        legacy_loader: Any = None,
        asset_sink: Any = None,
    ) -> dict[str, Any]:
        if isinstance(raw, dict) and raw.get("format") == "aaalice-prompt-library":
            PromptLibrary._validate_manifest(raw)
            return raw
        entries: list[dict[str, Any]] = []
        categories: list[dict[str, Any]] = []
        tags: list[dict[str, str]] = []
        tag_ids: dict[str, str] = {}
        source = raw.get("categories", raw) if isinstance(raw, dict) else raw
        if not isinstance(source, (dict, list)):
            raise ValueError("unsupported legacy prompt-library JSON")
        if isinstance(source, dict):
            iterable = source.items()
        elif all(isinstance(item, dict) and "prompts" in item for item in source):
            iterable = [(item.get("name", f"Category {index + 1}"), item.get("prompts", [])) for index, item in enumerate(source)]
        else:
            iterable = [("Imported", source)]
        for category_position, (category_name, values) in enumerate(iterable):
            category_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"aaalice:legacy-category:{category_name}"))
            categories.append({"id": category_id, "name": str(category_name), "position": category_position,
                               "color": CATEGORY_COLOR_PALETTE[category_position % len(CATEGORY_COLOR_PALETTE)]})
            if isinstance(values, dict):
                values = values.get("prompts", values.get("items", []))
            if not isinstance(values, list):
                continue
            for position, value in enumerate(values):
                preview_hash = None
                note = ""
                entry_tag_ids: list[str] = []
                if isinstance(value, str):
                    title, text = value, value
                elif isinstance(value, dict):
                    text = value.get("prompt", value.get("text", ""))
                    title = value.get("alias", value.get("name", value.get("title", text)))
                    note = str(value.get("description", value.get("note", "")) or "")
                    raw_tags = value.get("tags", [])
                    if isinstance(raw_tags, str):
                        raw_tags = [item.strip() for item in raw_tags.split(",")]
                    if isinstance(raw_tags, list):
                        for raw_tag in raw_tags:
                            if isinstance(raw_tag, dict):
                                tag_name = raw_tag.get("name", raw_tag.get("label", raw_tag.get("value", "")))
                            else:
                                tag_name = raw_tag
                            tag_name = str(tag_name or "").strip()
                            if not tag_name:
                                continue
                            tag_key = tag_name.casefold()
                            tag_id = tag_ids.get(tag_key)
                            if tag_id is None:
                                tag_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"aaalice:legacy-tag:{tag_key}"))
                                tag_ids[tag_key] = tag_id
                                tags.append({"id": tag_id, "name": tag_name})
                            entry_tag_ids.append(tag_id)
                    image_name = value.get("image")
                    if image_name and legacy_loader is not None and asset_sink is not None:
                        normalized_name = str(image_name).replace("\\", "/")
                        candidates = (normalized_name, f"preview/{PurePosixPath(normalized_name).name}")
                        content = next((content for name in candidates if (content := legacy_loader(name)) is not None), None)
                        if content is not None:
                            _mime, extension = detect_image(content)
                            preview_hash = hashlib.sha256(content).hexdigest()
                            asset_sink(preview_hash, content, extension)
                else:
                    continue
                legacy_key = value.get("id") if isinstance(value, dict) else None
                entry_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"aaalice:legacy-entry:{category_name}:{legacy_key or text}"))
                entries.append({"id": entry_id, "title": str(title), "text": str(text), "note": note,
                                "categoryId": category_id, "position": position, "tagIds": entry_tag_ids, "collections": [],
                                "previewHash": preview_hash})
        return {"format": "aaalice-prompt-library", "version": SCHEMA_VERSION, "categories": categories,
                "collections": [], "tags": tags, "entries": entries}

    def preflight_import(self, manifest: dict[str, Any]) -> dict[str, Any]:
        self._validate_manifest(manifest)
        local = {entry["id"]: entry for entry in self.snapshot()["entries"]}
        result = {"new": [], "update": [], "duplicate": [], "conflict": [], "invalid": []}
        by_text = {(entry["title"], entry["text"]): entry["id"] for entry in local.values()}
        seen: set[str] = set()
        for raw in manifest["entries"]:
            problem = self._entry_problem(raw, manifest)
            if problem:
                result["invalid"].append({"entry": raw, "reason": problem})
                continue
            entry_id = raw["id"]
            if entry_id in seen:
                result["invalid"].append({"entry": raw, "reason": "duplicate id in import"})
                continue
            seen.add(entry_id)
            if entry_id in local:
                same = local[entry_id]["title"] == raw.get("title") and local[entry_id]["text"] == raw["text"]
                result["update" if same else "conflict"].append(raw)
            elif (raw.get("title"), raw["text"]) in by_text:
                result["duplicate"].append({**raw, "localId": by_text[(raw.get("title"), raw["text"])]})
            else:
                result["new"].append(raw)
        return result

    def apply_import(
        self,
        manifest: dict[str, Any],
        assets: dict[str, Path],
        resolutions: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        self._validate_manifest(manifest)
        invalid = self.preflight_import(manifest)["invalid"]
        if invalid:
            raise ValueError(f"manifest contains invalid entry data: {invalid[0]['reason']}")
        resolutions = resolutions or {}
        imported = 0
        referenced_assets = {raw.get("previewHash") for raw in manifest["entries"] if isinstance(raw, dict) and raw.get("previewHash")}
        extra_assets = set(assets) - referenced_assets
        if extra_assets:
            raise ValueError(f"archive contains unreferenced preview assets: {sorted(extra_assets)[0]}")
        prepared_assets: list[tuple[str, Path, str, str, int]] = []
        for digest, source in assets.items():
            content = source.read_bytes()
            if hashlib.sha256(content).hexdigest() != digest:
                raise ValueError(f"preview asset hash mismatch: {digest}")
            mime, extension = detect_image(content)
            prepared_assets.append((digest, source, mime, extension, len(content)))
        for raw in manifest["entries"]:
            digest = raw.get("previewHash")
            if digest and digest not in assets:
                raise ValueError(f"missing preview asset: {digest}")

        created_paths: list[Path] = []
        replaced_assets: set[str] = set()
        try:
            with self.transaction() as db:
                for digest, source, mime, extension, size in prepared_assets:
                    path = self.asset_root / f"{digest}.{extension}"
                    if not path.exists():
                        shutil.copyfile(source, path)
                        created_paths.append(path)
                    db.execute(
                        "INSERT OR IGNORE INTO assets(hash,mime,extension,size) VALUES (?,?,?,?)",
                        (digest, mime, extension, size),
                    )
                for item in manifest["categories"]:
                    position = int(item.get("position", 0))
                    color = _category_color(item.get("color"), CATEGORY_COLOR_PALETTE[position % len(CATEGORY_COLOR_PALETTE)])
                    db.execute(
                        "INSERT OR IGNORE INTO categories(id,name,position,color) VALUES (?,?,?,?)",
                        (item["id"], item["name"], position, color),
                    )
                for item in manifest["collections"]:
                    db.execute(
                        "INSERT OR IGNORE INTO collections(id,name,position) VALUES (?,?,?)",
                        (item["id"], item["name"], int(item.get("position", 0))),
                    )
                for tag in manifest["tags"]:
                    db.execute("INSERT OR IGNORE INTO tags(id,name) VALUES (?,?)", (tag["id"], tag["name"]))
                for raw in manifest["entries"]:
                    entry_id = raw["id"]
                    exists = db.execute("SELECT 1 FROM entries WHERE id = ?", (entry_id,)).fetchone()
                    policy = resolutions.get(entry_id, "import" if not exists else "local")
                    if policy not in {"local", "import", "duplicate"}:
                        raise ValueError(f"invalid import resolution for {entry_id}: {policy}")
                    if policy == "local":
                        continue
                    if not exists and policy == "import":
                        duplicate = db.execute(
                            "SELECT id FROM entries WHERE title = ? AND text = ?", (raw.get("title", raw["text"]), raw["text"])
                        ).fetchone()
                        if duplicate:
                            entry_id = duplicate[0]
                            exists = True
                    if policy == "duplicate":
                        entry_id = str(uuid.uuid4())
                        exists = None
                    values = (
                        raw.get("title", raw["text"]), raw["text"], raw.get("note", ""),
                        raw.get("categoryId"), raw.get("previewHash"), int(raw.get("position", 0)),
                    )
                    if exists:
                        previous = db.execute("SELECT preview_hash FROM entries WHERE id = ?", (entry_id,)).fetchone()[0]
                        if previous and previous != raw.get("previewHash"):
                            replaced_assets.add(previous)
                        db.execute(
                            "UPDATE entries SET title=?,text=?,note=?,category_id=?,preview_hash=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                            (*values, entry_id),
                        )
                        db.execute("DELETE FROM entry_tags WHERE entry_id=?", (entry_id,))
                        db.execute("DELETE FROM collection_entries WHERE entry_id=?", (entry_id,))
                    else:
                        db.execute(
                            "INSERT INTO entries(id,title,text,note,category_id,preview_hash,position) VALUES (?,?,?,?,?,?,?)",
                            (entry_id, *values),
                        )
                    for tag_id in raw.get("tagIds", []):
                        db.execute("INSERT OR IGNORE INTO entry_tags(entry_id,tag_id) VALUES (?,?)", (entry_id, tag_id))
                    for membership in raw.get("collections", []):
                        db.execute(
                            "INSERT OR IGNORE INTO collection_entries(collection_id,entry_id,position) VALUES (?,?,?)",
                            (membership["collectionId"], entry_id, int(membership.get("position", 0))),
                        )
                    imported += 1
        except Exception:
            for path in created_paths:
                path.unlink(missing_ok=True)
            raise
        for digest in replaced_assets:
            self._cleanup_asset(digest)
        return {"imported": imported}
