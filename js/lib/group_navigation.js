/** Shared visual-group discovery and canvas navigation helpers. */

function finitePair(value) {
	return value != null && Number(value.length) >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

export function visualGroups(graph) {
	const groups = [...(graph?._groups || [])];
	for (const group of groups) group.recomputeInsideNodes?.();
	return groups.sort((a, b) => {
		const aPos = finitePair(a?.pos) ? a.pos : [0, 0];
		const bPos = finitePair(b?.pos) ? b.pos : [0, 0];
		return (aPos[1] - bPos[1]) || (aPos[0] - bPos[0]) || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
	});
}

export function groupNavigationBounds(group) {
	const bounds = group?.boundingRect || group?.getBounding?.() || group?._bounding;
	if (bounds && Number(bounds.length) >= 4 && [bounds[0], bounds[1], bounds[2], bounds[3]].every(Number.isFinite)) return bounds;
	if (!finitePair(group?.pos) || !finitePair(group?.size)) return null;
	return [group.pos[0], group.pos[1], group.size[0], group.size[1]];
}

export function navigateToVisualGroup(canvas, group, { zoom = 0.82, offset = null } = {}) {
	if (!canvas || !group) return false;
	const bounds = groupNavigationBounds(group);
	const offsetX = Number.isFinite(offset?.x) ? offset.x : 0;
	const offsetY = Number.isFinite(offset?.y) ? offset.y : 0;
	if (bounds && typeof canvas.ds?.fitToBounds === "function") canvas.ds.fitToBounds([bounds[0] + offsetX, bounds[1] + offsetY, bounds[2], bounds[3]], { zoom });
	else if (typeof canvas.centerOnNode === "function" && finitePair(group.pos) && finitePair(group.size)) canvas.centerOnNode(offsetX || offsetY ? { pos: [group.pos[0] + offsetX, group.pos[1] + offsetY], size: group.size } : group);
	else return false;
	canvas.setDirty?.(true, true);
	return true;
}
