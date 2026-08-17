from __future__ import annotations

from typing import Any, Iterable


def migrate_v1_archive_categories(categories: Any) -> Any:
    if not isinstance(categories, list):
        return categories
    return [({**category, "parentId": None}) if isinstance(category, dict) else category for category in categories]


def validate_archive_category_tree(categories: list[dict[str, Any]], local_category_ids: Iterable[str] = ()) -> None:
    category_ids = {category["id"] for category in categories}
    known_ids = category_ids | set(local_category_ids)
    parent_by_id = {category["id"]: category.get("parentId") for category in categories}
    for category in categories:
        category_id = category["id"]
        parent_id = category.get("parentId")
        if parent_id is None:
            continue
        if parent_id == category_id:
            raise ValueError(f"category {category_id} cannot be its own parent")
        if parent_id not in known_ids:
            raise ValueError(f"category {category_id} references missing parent {parent_id}")
    state: dict[str, int] = {}
    for category_id in parent_by_id:
        if state.get(category_id) == 2:
            continue
        path: list[str] = []
        current_id: str | None = category_id
        while current_id in parent_by_id and state.get(current_id) != 2:
            if state.get(current_id) == 1:
                raise ValueError(f"category tree contains a cycle at {current_id}")
            state[current_id] = 1
            path.append(current_id)
            current_id = parent_by_id[current_id]
        for item_id in path:
            state[item_id] = 2


def archive_categories_parent_first(
    categories: list[dict[str, Any]], local_category_ids: Iterable[str] = ()
) -> list[dict[str, Any]]:
    pending = {category["id"]: category for category in categories}
    available = set(local_category_ids)
    ordered: list[dict[str, Any]] = []
    while pending:
        ready = [
            category
            for category in pending.values()
            if category.get("parentId") is None or category.get("parentId") in available
        ]
        if not ready:
            blocked = sorted(pending)[0]
            raise ValueError(f"category {blocked} cannot be imported before its parent")
        ready.sort(key=lambda category: (category.get("position", 0), category["name"].casefold(), category["id"]))
        for category in ready:
            pending.pop(category["id"])
            available.add(category["id"])
            ordered.append(category)
    return ordered
