"""SQLite category-tree operations for the prompt library."""

from __future__ import annotations

import sqlite3
import uuid
from typing import Any, Iterable

CATEGORY_COLOR_PALETTE = (
    "#7C3AED", "#2563EB", "#0891B2", "#0D9488",
    "#059669", "#65A30D", "#CA8A04", "#D97706",
    "#EA580C", "#DC2626", "#E11D48", "#DB2777",
    "#C026D3", "#9333EA", "#4F46E5", "#0284C7",
)


def category_color(value: Any, fallback: str | None = None) -> str:
    if value is None or value == "":
        if fallback is not None:
            return fallback
        raise ValueError("category color is required")
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#" or any(
        character not in "0123456789abcdefABCDEF" for character in value[1:]
    ):
        raise ValueError("category color must use #RRGGBB format")
    return value.upper()


def _category_id(value: Any = None) -> str:
    return value if isinstance(value, str) and value else str(uuid.uuid4())


def _category_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("category name must be a string and cannot be empty")
    return value


class PromptCategoryMixin:
    @staticmethod
    def _validate_category_rows(rows: Iterable[Any]) -> None:
        categories = [dict(row) for row in rows]
        ids = {item["id"] for item in categories}
        if len(ids) != len(categories):
            raise ValueError("category tree contains duplicate ids")
        parents = {item["id"]: item.get("parent_id") for item in categories}
        for item in categories:
            category_id = item["id"]
            position = item.get("position")
            if not isinstance(position, int) or isinstance(position, bool) or position < 0:
                raise ValueError(f"category {category_id} has an invalid position")
            parent_id = parents[category_id]
            if parent_id is None:
                continue
            if parent_id not in ids:
                raise ValueError(f"category {category_id} references missing parent {parent_id}")
            if parent_id == category_id:
                raise ValueError(f"category {category_id} cannot be its own parent")
        resolved: set[str] = set()
        for category_id in ids:
            path: set[str] = set()
            cursor: str | None = category_id
            while cursor is not None and cursor not in resolved:
                if cursor in path:
                    raise ValueError(f"category tree contains a cycle at {cursor}")
                path.add(cursor)
                cursor = parents[cursor]
            resolved.update(path)

    @staticmethod
    def _next_category_color(db: sqlite3.Connection, position: int) -> str:
        used = {row["color"].upper() for row in db.execute("SELECT color FROM categories WHERE color IS NOT NULL")}
        for color in CATEGORY_COLOR_PALETTE:
            if color not in used:
                return color
        return CATEGORY_COLOR_PALETTE[position % len(CATEGORY_COLOR_PALETTE)]

    @staticmethod
    def _category_siblings(db: sqlite3.Connection, parent_id: str | None, *, exclude: str | None = None) -> list[str]:
        rows = db.execute(
            "SELECT id FROM categories WHERE parent_id IS ? ORDER BY position, name COLLATE NOCASE, id",
            (parent_id,),
        ).fetchall()
        return [row["id"] for row in rows if row["id"] != exclude]

    @staticmethod
    def _write_category_order(db: sqlite3.Connection, parent_id: str | None, category_ids: list[str]) -> None:
        for position, category_id in enumerate(category_ids):
            db.execute(
                "UPDATE categories SET parent_id = ?, position = ? WHERE id = ?",
                (parent_id, position, category_id),
            )

    @staticmethod
    def _category_descendants(db: sqlite3.Connection, category_id: str) -> list[str]:
        children: dict[str, list[str]] = {}
        for row in db.execute("SELECT id, parent_id FROM categories"):
            if row["parent_id"] is not None:
                children.setdefault(row["parent_id"], []).append(row["id"])
        descendants: list[str] = []
        stack = list(reversed(children.get(category_id, [])))
        seen = {category_id}
        while stack:
            item_id = stack.pop()
            if item_id in seen:
                raise ValueError(f"category tree contains a cycle at {item_id}")
            seen.add(item_id)
            descendants.append(item_id)
            stack.extend(reversed(children.get(item_id, [])))
        return descendants

    @staticmethod
    def _validate_parent(db: sqlite3.Connection, category_id: str | None, parent_id: Any) -> str | None:
        if parent_id is not None and (not isinstance(parent_id, str) or not parent_id):
            raise ValueError("parentId must be a category id or null")
        if category_id is not None and parent_id == category_id:
            raise ValueError("category cannot be its own parent")
        if parent_id is not None and not db.execute("SELECT 1 FROM categories WHERE id = ?", (parent_id,)).fetchone():
            raise KeyError(f"parent category not found: {parent_id}")
        return parent_id

    def create_category(self, data: dict[str, Any]) -> dict[str, Any]:
        item_id = _category_id(data.get("id"))
        name = _category_name(data.get("name"))
        parent_id = data.get("parentId")
        with self.transaction() as db:
            self._validate_parent(db, item_id, parent_id)
            siblings = self._category_siblings(db, parent_id)
            position = data.get("position", len(siblings))
            if isinstance(position, bool) or not isinstance(position, int) or position < 0 or position > len(siblings):
                raise ValueError("category position is outside the sibling list")
            palette_position = int(db.execute("SELECT COUNT(*) FROM categories").fetchone()[0])
            color = category_color(data.get("color"), self._next_category_color(db, palette_position))
            db.execute(
                "INSERT INTO categories(id,name,color,parent_id,position) VALUES (?,?,?,?,?)",
                (item_id, name, color, parent_id, position),
            )
            siblings.insert(position, item_id)
            self._write_category_order(db, parent_id, siblings)
        return next(item for item in self.snapshot()["categories"] if item["id"] == item_id)

    def update_category(self, category_id: str, data: dict[str, Any]) -> None:
        with self.transaction() as db:
            current = db.execute("SELECT parent_id FROM categories WHERE id = ?", (category_id,)).fetchone()
            if not current:
                raise KeyError(f"categories item not found: {category_id}")
            fields: list[str] = []
            values: list[Any] = []
            if "name" in data:
                fields.append("name = ?")
                values.append(_category_name(data["name"]))
            if "color" in data:
                fields.append("color = ?")
                values.append(category_color(data["color"]))
            if fields:
                db.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", (*values, category_id))
            if "position" in data:
                self._move_category(db, category_id, current["parent_id"], data["position"])

    def _move_category(self, db: sqlite3.Connection, category_id: str, parent_id: Any, index: Any) -> None:
        row = db.execute("SELECT parent_id FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not row:
            raise KeyError(f"category not found: {category_id}")
        parent_id = self._validate_parent(db, category_id, parent_id)
        if parent_id in self._category_descendants(db, category_id):
            raise ValueError("category cannot be moved into its own descendant")
        if isinstance(index, bool) or not isinstance(index, int):
            raise ValueError("category move index must be an integer")
        old_parent_id = row["parent_id"]
        old_siblings = self._category_siblings(db, old_parent_id, exclude=category_id)
        target_siblings = old_siblings if old_parent_id == parent_id else self._category_siblings(db, parent_id, exclude=category_id)
        if index < 0 or index > len(target_siblings):
            raise ValueError(f"category move index {index} is outside 0..{len(target_siblings)}")
        target_siblings.insert(index, category_id)
        if old_parent_id != parent_id:
            self._write_category_order(db, old_parent_id, old_siblings)
        self._write_category_order(db, parent_id, target_siblings)

    def move_category(self, category_id: str, parent_id: str | None, index: int) -> None:
        with self.transaction() as db:
            self._move_category(db, category_id, parent_id, index)

    def delete_category(self, category_id: str, *, delete_descendants: bool = False) -> None:
        with self.transaction() as db:
            row = db.execute("SELECT parent_id FROM categories WHERE id = ?", (category_id,)).fetchone()
            if not row:
                raise KeyError(f"category not found: {category_id}")
            parent_id = row["parent_id"]
            current_siblings = self._category_siblings(db, parent_id)
            insertion = current_siblings.index(category_id)
            siblings = [item_id for item_id in current_siblings if item_id != category_id]
            if delete_descendants:
                category_ids = [category_id, *self._category_descendants(db, category_id)]
                placeholders = ",".join("?" for _ in category_ids)
                db.execute(f"UPDATE entries SET category_id = NULL WHERE category_id IN ({placeholders})", category_ids)
                for item_id in reversed(category_ids):
                    db.execute("DELETE FROM categories WHERE id = ?", (item_id,))
            else:
                db.execute("UPDATE entries SET category_id = NULL WHERE category_id = ?", (category_id,))
                children = self._category_siblings(db, category_id)
                siblings[insertion:insertion] = children
                self._write_category_order(db, parent_id, siblings)
                db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
                return
            self._write_category_order(db, parent_id, siblings)
