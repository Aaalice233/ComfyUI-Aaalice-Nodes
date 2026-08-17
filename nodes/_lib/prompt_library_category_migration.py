from __future__ import annotations

import sqlite3

from .prompt_library_archive_categories import archive_categories_parent_first, migrate_legacy_category_paths

LEGACY_PATH_MIGRATION_KEY = "legacy-category-paths-v1"


def migrate_legacy_category_paths_in_db(db: sqlite3.Connection) -> None:
    migrated = db.execute("SELECT value FROM library_metadata WHERE key = ?", (LEGACY_PATH_MIGRATION_KEY,)).fetchone()
    if migrated:
        return
    categories = [
        {
            "id": row["id"],
            "name": row["name"],
            "color": row["color"],
            "parentId": row["parent_id"],
            "position": row["position"],
        }
        for row in db.execute("SELECT id, name, color, parent_id, position FROM categories")
    ]
    converted = migrate_legacy_category_paths(categories)
    existing_ids = {category["id"] for category in categories}
    generated = [category for category in converted if category["id"] not in existing_ids]
    for category in archive_categories_parent_first(generated, existing_ids):
        db.execute(
            "INSERT INTO categories(id, name, color, parent_id, position) VALUES (?, ?, ?, ?, ?)",
            (category["id"], category["name"], category["color"], category["parentId"], category["position"]),
        )
    for category in converted:
        if category["id"] in existing_ids:
            db.execute(
                "UPDATE categories SET name = ?, parent_id = ?, position = ? WHERE id = ?",
                (category["name"], category["parentId"], category["position"], category["id"]),
            )
    db.execute("INSERT INTO library_metadata(key, value) VALUES (?, '1')", (LEGACY_PATH_MIGRATION_KEY,))
