const VERSION = 2;
const LEGACY_VERSION = 1;
const OFFSET_LIMIT = 100000;
const DEFAULT_ZOOM = 0.82;
const NAVIGATION_KEY_CODES = new Set(["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6"]);

export function emptyGroupNavigation() {
	return { version: VERSION, entries: [] };
}

export function normalizeGroupNavigation(value) {
	if (value == null) return emptyGroupNavigation();
	const sourceVersion = Number(value?.version);
	if (![LEGACY_VERSION, VERSION].includes(sourceVersion) || !Array.isArray(value.entries)) throw new Error("Unsupported group navigation data");
	const seen = new Set();
	const entries = [];
	for (const candidate of value.entries) {
		const groupId = String(candidate?.groupId ?? "").trim();
		if (!groupId || seen.has(groupId)) continue;
		seen.add(groupId);
		let shortcut = null;
		try {
			shortcut = normalizeShortcut(candidate?.shortcut);
		} catch (error) {
			if (sourceVersion !== LEGACY_VERSION) throw error;
		}
		entries.push({
			groupId,
			label: String(candidate?.label || "").trim(),
			shortcut,
			offset: normalizeNavigationOffset(candidate?.offset),
			zoom: normalizeNavigationZoom(candidate?.zoom),
		});
	}
	return { version: VERSION, entries };
}

export function addGroupNavigationEntry(model, group) {
	const next = normalizeGroupNavigation(model);
	const groupId = String(group?.id ?? "").trim();
	if (!groupId || next.entries.some((entry) => entry.groupId === groupId)) return next;
	next.entries.push({ groupId, label: String(group?.title || "").trim(), shortcut: null, offset: { x: 0, y: 0 }, zoom: DEFAULT_ZOOM });
	return next;
}

export function removeGroupNavigationEntry(model, groupId) {
	const next = normalizeGroupNavigation(model);
	next.entries = next.entries.filter((entry) => entry.groupId !== String(groupId));
	return next;
}

export function moveGroupNavigationEntry(model, groupId, targetIndex) {
	const next = normalizeGroupNavigation(model);
	const sourceIndex = next.entries.findIndex((entry) => entry.groupId === String(groupId));
	if (sourceIndex < 0) throw new Error(`Missing group navigation entry: ${groupId}`);
	const [entry] = next.entries.splice(sourceIndex, 1);
	const numericIndex = Number(targetIndex);
	const destination = Number.isFinite(numericIndex) ? Math.max(0, Math.min(next.entries.length, Math.round(numericIndex))) : sourceIndex;
	next.entries.splice(destination, 0, entry);
	return next;
}

export function setGroupNavigationShortcut(model, groupId, shortcut) {
	const next = normalizeGroupNavigation(model);
	const entry = next.entries.find((candidate) => candidate.groupId === String(groupId));
	if (!entry) throw new Error(`Missing group navigation entry: ${groupId}`);
	const normalized = normalizeShortcut(shortcut);
	if (normalized && next.entries.some((candidate) => candidate !== entry && candidate.shortcut === normalized)) throw new Error(`Shortcut already assigned: ${normalized}`);
	entry.shortcut = normalized;
	return next;
}

export function setGroupNavigationOffset(model, groupId, offset) {
	const next = normalizeGroupNavigation(model);
	const entry = next.entries.find((candidate) => candidate.groupId === String(groupId));
	if (!entry) throw new Error(`Missing group navigation entry: ${groupId}`);
	entry.offset = normalizeNavigationOffset(offset);
	return next;
}

export function normalizeNavigationOffset(value) {
	const normalizeAxis = (axis) => {
		const number = Number(axis ?? 0);
		if (!Number.isFinite(number)) throw new Error("Navigation offset must be finite");
		return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(number)));
	};
	return { x: normalizeAxis(value?.x), y: normalizeAxis(value?.y) };
}

export function setGroupNavigationZoom(model, groupId, zoom) {
	const next = normalizeGroupNavigation(model);
	const entry = next.entries.find((candidate) => candidate.groupId === String(groupId));
	if (!entry) throw new Error(`Missing group navigation entry: ${groupId}`);
	entry.zoom = normalizeNavigationZoom(zoom);
	return next;
}

export function normalizeNavigationZoom(value) {
	if (value == null || value === "") return DEFAULT_ZOOM;
	const number = Number(value);
	if (!Number.isFinite(number)) throw new Error("Navigation zoom must be finite");
	return Math.max(0.1, Math.min(3, Math.round(number * 100) / 100));
}

export function normalizeShortcut(value) {
	if (value == null || value === "") return null;
	const code = String(value).trim();
	if (!NAVIGATION_KEY_CODES.has(code)) throw new Error("Group navigation accepts only number keys 1-6 or Numpad 1-6");
	return code;
}

export function shortcutFromKeyboardEvent(event) {
	if (!event?.code || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return null;
	return NAVIGATION_KEY_CODES.has(event.code) ? event.code : null;
}

export function shortcutLabel(shortcut) {
	if (!shortcut) return "";
	const code = normalizeShortcut(shortcut);
	return code.startsWith("Numpad") ? `Num ${code.slice("Numpad".length)}` : code.slice("Digit".length);
}

export function isEditableShortcutTarget(target) {
	const ElementType = globalThis.Element;
	return Boolean(ElementType && target instanceof ElementType && target.closest("input, textarea, select, [contenteditable], [role='dialog']"));
}
