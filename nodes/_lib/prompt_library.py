"""SQLite prompt-library domain service and portable archive codec."""

from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

from .prompt_library_archive import PromptLibraryArchive
from .prompt_library_categories import CATEGORY_COLOR_PALETTE, PromptCategoryMixin, category_color as _category_color
from .prompt_library_category_migration import migrate_legacy_category_paths_in_db

SCHEMA_VERSION = 2
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024
MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024
MAX_EXPANDED_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_MANIFEST_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_FILES = 100_000
IMPORT_STAGE_TTL_SECONDS = 60 * 60
DEFAULT_COLLECTION_ID = "00000000-0000-5000-8000-000000000001"
DEFAULT_COLLECTION_NAME = "Favorites"


def _archive_configuration() -> dict[str, Any]:
    return {
        "SCHEMA_VERSION": SCHEMA_VERSION,
        "MAX_IMAGE_BYTES": MAX_IMAGE_BYTES,
        "MAX_IMPORT_BYTES": MAX_IMPORT_BYTES,
        "MAX_EXPORT_BYTES": MAX_EXPORT_BYTES,
        "MAX_EXPANDED_ARCHIVE_BYTES": MAX_EXPANDED_ARCHIVE_BYTES,
        "MAX_MANIFEST_BYTES": MAX_MANIFEST_BYTES,
        "MAX_ARCHIVE_FILES": MAX_ARCHIVE_FILES,
        "IMPORT_STAGE_TTL_SECONDS": IMPORT_STAGE_TTL_SECONDS,
        "CATEGORY_COLOR_PALETTE": CATEGORY_COLOR_PALETTE,
    }


def _id(value: Any = None) -> str:
    return value if isinstance(value, str) and value else str(uuid.uuid4())


def _text(value: Any, field: str, *, empty: bool = True) -> str:
    if not isinstance(value, str) or (not empty and not value.strip()):
        raise ValueError(f"{field} must be a string" + ("" if empty else " and cannot be empty"))
    return value


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


class PromptLibrary(PromptCategoryMixin):
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
        self._archive = PromptLibraryArchive(self, _archive_configuration, detect_image, _category_color)
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
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
                    color TEXT NOT NULL DEFAULT '',
                    parent_id TEXT REFERENCES categories(id)
                );
                CREATE TABLE IF NOT EXISTS library_metadata (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS assets (
                    hash TEXT PRIMARY KEY, mime TEXT NOT NULL, extension TEXT NOT NULL, size INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
                    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
                    preview_hash TEXT REFERENCES assets(hash) ON DELETE SET NULL,
                    position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_used_at INTEGER NOT NULL DEFAULT 0
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
            if "parent_id" not in columns:
                db.execute("ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id)")
            db.execute("CREATE INDEX IF NOT EXISTS categories_parent_position ON categories(parent_id, position)")
            entry_columns = {row["name"] for row in db.execute("PRAGMA table_info(entries)")}
            if "last_used_at" not in entry_columns:
                db.execute("ALTER TABLE entries ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0")
            category_rows = db.execute("SELECT id, color, parent_id, position FROM categories ORDER BY position, name, id").fetchall()
            self._validate_category_rows(category_rows)
            for index, row in enumerate(category_rows):
                fallback = CATEGORY_COLOR_PALETTE[index % len(CATEGORY_COLOR_PALETTE)]
                try:
                    color = _category_color(row["color"], fallback)
                except ValueError:
                    color = fallback
                if row["color"] != color:
                    db.execute("UPDATE categories SET color = ? WHERE id = ?", (color, row["id"]))
            migrate_legacy_category_paths_in_db(db)
            migrated_rows = db.execute("SELECT id, color, parent_id, position FROM categories").fetchall()
            self._validate_category_rows(migrated_rows)
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
                entry["lastUsedAt"] = entry.pop("last_used_at")
                entry["tagIds"] = entry_tags.get(entry["id"], [])
                entry["collections"] = memberships.get(entry["id"], [])
            categories = self._rows(db, "SELECT * FROM categories")
            by_parent: dict[str | None, list[dict[str, Any]]] = {}
            for category in categories:
                by_parent.setdefault(category["parent_id"], []).append(category)
            for siblings in by_parent.values():
                siblings.sort(key=lambda item: (item["position"], item["name"], item["id"]))
            ordered_categories: list[dict[str, Any]] = []
            pending = list(reversed(by_parent.get(None, [])))
            while pending:
                category = pending.pop()
                ordered_categories.append(category)
                pending.extend(reversed(by_parent.get(category["id"], [])))
            if len(ordered_categories) != len(categories):
                raise ValueError("category tree cannot be serialized")
            for category in ordered_categories:
                category["parentId"] = category.pop("parent_id")
            return {
                "version": SCHEMA_VERSION,
                "categories": ordered_categories,
                "collections": self._rows(db, "SELECT * FROM collections ORDER BY position, name, id"),
                "tags": tags,
                "entries": entries,
            }

    def _next_position(self, db: sqlite3.Connection, table: str) -> int:
        return int(db.execute(f"SELECT COALESCE(MAX(position), -1) + 1 FROM {table}").fetchone()[0])

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

    def record_usage(self, entry_ids: list[str]) -> int:
        unique_ids = list(dict.fromkeys(entry_ids))
        if not unique_ids:
            return 0
        with self.transaction() as db:
            placeholders = ",".join("?" for _ in unique_ids)
            found = int(db.execute(
                f"SELECT COUNT(*) FROM entries WHERE id IN ({placeholders})", unique_ids
            ).fetchone()[0])
            if found != len(unique_ids):
                raise KeyError("one or more prompt entries are missing")
            previous = int(db.execute("SELECT COALESCE(MAX(last_used_at), 0) FROM entries").fetchone()[0])
            used_at = max(int(time.time() * 1000), previous + 1)
            db.execute(
                f"UPDATE entries SET last_used_at = ? WHERE id IN ({placeholders})",
                (used_at, *unique_ids),
            )
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
            if kind == "categories":
                by_parent: dict[str | None, list[str]] = {}
                for item_id in ordered_ids:
                    row = db.execute("SELECT parent_id FROM categories WHERE id = ?", (item_id,)).fetchone()
                    if not row:
                        raise KeyError(f"categories item not found: {item_id}")
                    by_parent.setdefault(row["parent_id"], []).append(item_id)
                for parent_id, category_ids in by_parent.items():
                    current = self._category_siblings(db, parent_id)
                    if set(category_ids) != set(current):
                        raise ValueError("category reorder must contain every sibling in the affected parent")
                    self._write_category_order(db, parent_id, category_ids)
                return
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
        return self._archive.export_archive_to_path(
            entry_ids=entry_ids,
            category_id=category_id,
            collection_id=collection_id,
        )

    def _stage_path(self, token: str) -> Path:
        return self._archive._stage_path(token)

    def cleanup_import_stages(self) -> None:
        self._archive.cleanup_import_stages()

    def prepare_export(self, **filters: Any) -> tuple[str, int]:
        return self._archive.prepare_export(**filters)

    def export_path(self, token: str) -> Path:
        return self._archive.export_path(token)

    def discard_import(self, token: str) -> None:
        self._archive.discard_import(token)

    def prepare_import(self, source: Path, filename: str = "") -> tuple[str, dict[str, Any]]:
        return self._archive.prepare_import(source, filename)

    def _decode_import_path(self, source: Path, filename: str, asset_root: Path) -> dict[str, Any]:
        return self._archive._decode_import_path(source, filename, asset_root)

    def staged_import(self, token: str) -> tuple[dict[str, Any], dict[str, Path]]:
        return self._archive.staged_import(token)

    def _validate_manifest(self, manifest: Any) -> None:
        self._archive._validate_manifest(manifest)

    def _entry_problem(self, raw: Any, manifest: dict[str, Any]) -> str | None:
        return self._archive._entry_problem(raw, manifest)

    def _normalize_old_json(
        self,
        raw: Any,
        legacy_loader: Any = None,
        asset_sink: Any = None,
    ) -> dict[str, Any]:
        return self._archive._normalize_old_json(raw, legacy_loader, asset_sink)

    def preflight_import(self, manifest: dict[str, Any]) -> dict[str, Any]:
        return self._archive.preflight_import(manifest)

    def apply_import(
        self,
        manifest: dict[str, Any],
        assets: dict[str, Path],
        resolutions: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return self._archive.apply_import(manifest, assets, resolutions)
