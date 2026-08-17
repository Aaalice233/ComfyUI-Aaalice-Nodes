"""Portable archive codec delegated by :mod:`prompt_library`."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .prompt_library_archive_categories import (
    archive_categories_parent_first,
    migrate_legacy_category_paths,
    migrate_v1_archive_categories,
    validate_archive_category_tree,
)


class PromptLibraryArchive:
    """Owns archive staging, validation, migration, and transactional import."""

    def __init__(
        self,
        library: Any,
        configuration: Callable[[], dict[str, Any]],
        detect_image: Callable[[bytes], tuple[str, str]],
        category_color: Callable[[Any, str | None], str],
    ) -> None:
        self.library = library
        self.configuration = configuration
        self.detect_image = detect_image
        self.category_color = category_color

    def __getattr__(self, name: str) -> Any:
        configuration = self.configuration()
        if name in configuration:
            return configuration[name]
        return getattr(self.library, name)

    @staticmethod
    def _category_scope(categories: list[dict[str, Any]], category_id: str) -> set[str]:
        by_parent: dict[str | None, list[str]] = {}
        for category in categories:
            by_parent.setdefault(category.get("parentId"), []).append(category["id"])
        if not any(category["id"] == category_id for category in categories):
            raise KeyError(f"category not found: {category_id}")
        scope: set[str] = set()
        pending = [category_id]
        while pending:
            current = pending.pop()
            if current in scope:
                raise ValueError(f"category tree contains a cycle at {current}")
            scope.add(current)
            pending.extend(by_parent.get(current, []))
        return scope

    @staticmethod
    def _with_category_ancestors(categories: list[dict[str, Any]], category_ids: set[str]) -> set[str]:
        by_id = {category["id"]: category for category in categories}
        result = set(category_ids)
        for category_id in tuple(category_ids):
            current = category_id
            seen: set[str] = set()
            while current in by_id:
                if current in seen:
                    raise ValueError(f"category tree contains a cycle at {current}")
                seen.add(current)
                result.add(current)
                parent_id = by_id[current].get("parentId")
                if parent_id is None:
                    break
                current = parent_id
        return result

    def export_archive_to_path(self, *, entry_ids: list[str] | None = None, category_id: str | None = None,
                               collection_id: str | None = None) -> Path:
        snapshot = self.snapshot()
        selected = snapshot["entries"]
        complete_export = entry_ids is None and category_id is None and collection_id is None
        if entry_ids is not None:
            wanted = set(entry_ids)
            selected = [entry for entry in selected if entry["id"] in wanted]
        category_scope: set[str] | None = None
        if category_id:
            category_scope = self._category_scope(snapshot["categories"], category_id)
            selected = [entry for entry in selected if entry["categoryId"] in category_scope]
        if collection_id:
            selected = [entry for entry in selected if any(item["collectionId"] == collection_id for item in entry["collections"])]
        selected_ids = {entry["id"] for entry in selected}
        category_ids = {entry["categoryId"] for entry in selected if entry["categoryId"]}
        if complete_export:
            category_ids = {category["id"] for category in snapshot["categories"]}
        elif category_scope is not None:
            category_ids.update(category_scope)
        category_ids = self._with_category_ancestors(snapshot["categories"], category_ids)
        collection_ids = {item["collectionId"] for entry in selected for item in entry["collections"]}
        tag_ids = {tag for entry in selected for tag in entry["tagIds"]}
        manifest = {
            "format": "aaalice-prompt-library", "version": self.SCHEMA_VERSION,
            "categories": [item for item in snapshot["categories"] if item["id"] in category_ids],
            "collections": [item for item in snapshot["collections"] if item["id"] in collection_ids],
            "tags": [item for item in snapshot["tags"] if item["id"] in tag_ids],
            "entries": [{key: value for key, value in entry.items() if key != "lastUsedAt"} for entry in selected],
            "selection": {"entryIds": sorted(selected_ids)},
        }
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        if len(manifest_bytes) > self.MAX_MANIFEST_BYTES:
            raise ValueError(f"export manifest exceeds {self.MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
        assets = [self.asset(digest)[0] for digest in sorted({entry["previewHash"] for entry in selected if entry["previewHash"]})]
        if len(manifest_bytes) + sum(path.stat().st_size for path in assets) > self.MAX_EXPORT_BYTES:
            raise ValueError("export content exceeds 2 GiB limit")
        fd, name = tempfile.mkstemp(dir=self.root, prefix="export-", suffix=".zip")
        os.close(fd)
        output = Path(name)
        try:
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                archive.writestr("manifest.json", manifest_bytes)
                for path in assets:
                    archive.write(path, f"assets/{path.name}")
            if output.stat().st_size > self.MAX_EXPORT_BYTES:
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
        cutoff = time.time() - self.IMPORT_STAGE_TTL_SECONDS
        for path in self.stage_root.iterdir():
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)

    def prepare_export(self, **filters: Any) -> tuple[str, int]:
        cutoff = time.time() - self.IMPORT_STAGE_TTL_SECONDS
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
        if source.stat().st_size > self.MAX_IMPORT_BYTES:
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
            if len(manifest_bytes) > self.MAX_MANIFEST_BYTES:
                raise ValueError(f"import manifest exceeds {self.MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
            (stage / "manifest.json").write_bytes(manifest_bytes)
            return token, manifest
        except Exception:
            shutil.rmtree(stage, ignore_errors=True)
            raise

    def _decode_import_path(self, source: Path, filename: str, asset_root: Path) -> dict[str, Any]:
        with source.open("rb") as handle:
            signature = handle.read(2)
        if filename.lower().endswith(".json") or signature != b"PK":
            if source.stat().st_size > self.MAX_MANIFEST_BYTES:
                raise ValueError(f"import JSON exceeds {self.MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
            try:
                raw = json.loads(source.read_text(encoding="utf-8-sig"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("invalid prompt-library JSON") from exc
            return self._normalize_old_json(raw)
        with zipfile.ZipFile(source) as archive:
            infos = archive.infolist()
            if len(infos) > self.MAX_ARCHIVE_FILES:
                raise ValueError("archive contains too many files")
            total = 0
            for info in infos:
                path = PurePosixPath(info.filename)
                if path.is_absolute() or ".." in path.parts or "\\" in info.filename:
                    raise ValueError(f"unsafe archive path: {info.filename}")
                total += info.file_size
                if total > self.MAX_EXPANDED_ARCHIVE_BYTES:
                    raise ValueError(
                        f"expanded archive exceeds {self.MAX_EXPANDED_ARCHIVE_BYTES // (1024 * 1024)} MiB limit"
                    )
            names = {info.filename for info in infos}
            if "manifest.json" in names:
                manifest_info = archive.getinfo("manifest.json")
                if manifest_info.file_size > self.MAX_MANIFEST_BYTES:
                    raise ValueError(f"manifest.json exceeds {self.MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
                try:
                    manifest = self._migrate_manifest(json.loads(archive.read("manifest.json")))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise ValueError("archive has no valid manifest.json") from exc
                for info in infos:
                    if not info.filename.startswith("assets/") or info.is_dir():
                        continue
                    if info.file_size > self.MAX_IMAGE_BYTES:
                        raise ValueError(f"preview image exceeds {self.MAX_IMAGE_BYTES} bytes")
                    content = archive.read(info)
                    digest = PurePosixPath(info.filename).stem
                    if hashlib.sha256(content).hexdigest() != digest:
                        raise ValueError(f"asset hash mismatch: {info.filename}")
                    self.detect_image(content)
                    (asset_root / f"{digest}.{self.detect_image(content)[1]}").write_bytes(content)
            elif "data.json" in names:
                if archive.getinfo("data.json").file_size > self.MAX_MANIFEST_BYTES:
                    raise ValueError(f"data.json exceeds {self.MAX_MANIFEST_BYTES // (1024 * 1024)} MiB limit")
                try:
                    legacy_data = json.loads(archive.read("data.json"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise ValueError("legacy archive has no valid data.json") from exc
                legacy_infos = {info.filename.replace("\\", "/"): info for info in infos if info.filename.startswith("preview/") and not info.is_dir()}
                def load_legacy(name: str) -> bytes | None:
                    info = legacy_infos.get(name)
                    if info is None:
                        return None
                    if info.file_size > self.MAX_IMAGE_BYTES:
                        raise ValueError(f"preview image exceeds {self.MAX_IMAGE_BYTES} bytes")
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

    def _migrate_manifest(self, manifest: Any) -> Any:
        if not isinstance(manifest, dict) or manifest.get("format") != "aaalice-prompt-library":
            return manifest
        version = manifest.get("version")
        if version == self.SCHEMA_VERSION:
            return manifest
        if version != 1:
            return manifest
        migrated = dict(manifest)
        migrated["version"] = self.SCHEMA_VERSION
        migrated["categories"] = migrate_v1_archive_categories(manifest.get("categories", []))
        return migrated

    def _validate_manifest(self, manifest: Any) -> None:
        if not isinstance(manifest, dict) or manifest.get("format") != "aaalice-prompt-library":
            raise ValueError("unsupported prompt-library manifest")
        if manifest.get("version") not in {1, self.SCHEMA_VERSION}:
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
                if "position" in item and (
                    not isinstance(item["position"], int) or isinstance(item["position"], bool)
                    or (field == "categories" and item["position"] < 0)
                ):
                    raise ValueError(f"manifest {field}[{index}] has an invalid position")
                if field == "categories" and "color" in item:
                    try:
                        self.category_color(item["color"])
                    except ValueError as exc:
                        raise ValueError(f"manifest categories[{index}] has an invalid color") from exc
                seen.add(item["id"])
        categories = manifest["categories"]
        for index, item in enumerate(categories):
            parent_id = item.get("parentId") if manifest.get("version") != 1 else None
            if parent_id is not None and (not isinstance(parent_id, str) or not parent_id):
                raise ValueError(f"manifest categories[{index}] has an invalid parentId")
        category_tree = migrate_v1_archive_categories(categories) if manifest.get("version") == 1 else categories
        validate_archive_category_tree(category_tree, (item["id"] for item in self.snapshot()["categories"]))

    def _entry_problem(self, raw: Any, manifest: dict[str, Any]) -> str | None:
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

    def _normalize_old_json(
        self,
        raw: Any,
        legacy_loader: Any = None,
        asset_sink: Any = None,
    ) -> dict[str, Any]:
        if isinstance(raw, dict) and raw.get("format") == "aaalice-prompt-library":
            migrated = self._migrate_manifest(raw)
            self._validate_manifest(migrated)
            return migrated
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
                               "color": self.CATEGORY_COLOR_PALETTE[category_position % len(self.CATEGORY_COLOR_PALETTE)],
                               "parentId": None})
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
                            _mime, extension = self.detect_image(content)
                            preview_hash = hashlib.sha256(content).hexdigest()
                            asset_sink(preview_hash, content, extension)
                else:
                    continue
                legacy_key = value.get("id") if isinstance(value, dict) else None
                entry_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"aaalice:legacy-entry:{category_name}:{legacy_key or text}"))
                entries.append({"id": entry_id, "title": str(title), "text": str(text), "note": note,
                                "categoryId": category_id, "position": position, "tagIds": entry_tag_ids, "collections": [],
                                "previewHash": preview_hash})
        return {"format": "aaalice-prompt-library", "version": self.SCHEMA_VERSION,
                "categories": migrate_legacy_category_paths(categories),
                "collections": [], "tags": tags, "entries": entries}

    def preflight_import(self, manifest: dict[str, Any]) -> dict[str, Any]:
        manifest = self._migrate_manifest(manifest)
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
        manifest = self._migrate_manifest(manifest)
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
            mime, extension = self.detect_image(content)
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
                local_category_ids = (row["id"] for row in db.execute("SELECT id FROM categories"))
                for item in archive_categories_parent_first(manifest["categories"], local_category_ids):
                    if db.execute("SELECT 1 FROM categories WHERE id = ?", (item["id"],)).fetchone():
                        continue
                    parent_id = item.get("parentId")
                    siblings = self.library._category_siblings(db, parent_id)
                    position = len(siblings)
                    color = self.category_color(
                        item.get("color"),
                        self.CATEGORY_COLOR_PALETTE[position % len(self.CATEGORY_COLOR_PALETTE)],
                    )
                    db.execute(
                        "INSERT INTO categories(id,name,position,color,parent_id) VALUES (?,?,?,?,?)",
                        (item["id"], item["name"], position, color, parent_id),
                    )
                    siblings.append(item["id"])
                    self.library._write_category_order(db, parent_id, siblings)
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
