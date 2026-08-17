from __future__ import annotations

import uuid
from typing import Any, Iterable


def _legacy_path(name: Any) -> tuple[str, ...] | None:
    if not isinstance(name, str) or "/" not in name:
        return None
    parts = tuple(part.strip() for part in name.split("/"))
    return parts if len(parts) > 1 and all(parts) else None


def _legacy_category_id(path: tuple[str, ...], used_ids: set[str]) -> str:
    key = "\x1f".join(path)
    attempt = 0
    while True:
        suffix = "" if attempt == 0 else f":{attempt}"
        category_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"aaalice:legacy-category-path:{key}{suffix}"))
        if category_id not in used_ids:
            used_ids.add(category_id)
            return category_id
        attempt += 1


def migrate_legacy_category_paths(categories: Any) -> Any:
    """Turn one-time flat ``Parent/Child`` names into stable category nodes."""
    if not isinstance(categories, list):
        return categories
    migrated = [dict(category) if isinstance(category, dict) else category for category in categories]
    records = [category for category in migrated if isinstance(category, dict)]
    if any(isinstance(category.get("position"), bool) or not isinstance(category.get("position"), int) or category["position"] < 0 for category in records):
        return migrated
    used_ids = {category.get("id") for category in records if isinstance(category.get("id"), str)}
    source_order = sorted(
        enumerate(records),
        key=lambda pair: (
            pair[1].get("position") if isinstance(pair[1].get("position"), int) else len(records),
            pair[0],
        ),
    )
    rank = {category.get("id"): order for order, (_index, category) in enumerate(source_order)}
    paths: dict[str, tuple[str, ...]] = {}
    existing_by_path: dict[tuple[str, ...], str] = {}
    for _index, category in source_order:
        category_id = category.get("id")
        name = category.get("name")
        if not isinstance(category_id, str) or not category_id or category.get("parentId") is not None or not isinstance(name, str):
            continue
        path = _legacy_path(name)
        normalized = path or ((name.strip(),) if name.strip() else None)
        if normalized:
            existing_by_path.setdefault(normalized, category_id)
        if path:
            paths[category_id] = path
    if not paths:
        return migrated

    nodes_by_path = dict(existing_by_path)
    generated: list[dict[str, Any]] = []
    prefixes = sorted(
        {path[:depth] for path in paths.values() for depth in range(1, len(path))},
        key=lambda path: (len(path), path),
    )
    for prefix in prefixes:
        if prefix in nodes_by_path:
            continue
        descendants = [category_id for category_id, path in paths.items() if path[:len(prefix)] == prefix]
        source_id = min(descendants, key=lambda category_id: rank[category_id])
        source = next(category for category in records if category.get("id") == source_id)
        category_id = _legacy_category_id(prefix, used_ids)
        nodes_by_path[prefix] = category_id
        generated_category = {
            "id": category_id,
            "name": prefix[-1],
            "parentId": nodes_by_path.get(prefix[:-1]),
            "position": rank[source_id],
        }
        if "color" in source:
            generated_category["color"] = source["color"]
        generated.append(generated_category)
        rank[category_id] = rank[source_id]

    for category in records:
        category_id = category.get("id")
        path = paths.get(category_id)
        if path:
            category["name"] = path[-1]
            category["parentId"] = nodes_by_path[path[:-1]]
    records.extend(generated)
    sibling_groups: dict[str | None, list[dict[str, Any]]] = {}
    for category in records:
        sibling_groups.setdefault(category.get("parentId"), []).append(category)
    for siblings in sibling_groups.values():
        siblings.sort(key=lambda category: (rank.get(category.get("id"), len(rank)), str(category.get("id", ""))))
        for position, category in enumerate(siblings):
            category["position"] = position
    return migrated + generated


def migrate_v1_archive_categories(categories: Any) -> Any:
    if not isinstance(categories, list):
        return categories
    flat = [({**category, "parentId": None}) if isinstance(category, dict) else category for category in categories]
    return migrate_legacy_category_paths(flat)


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
