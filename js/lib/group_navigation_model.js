const VERSION = 1;
const OFFSET_LIMIT = 100000;
const DEFAULT_ZOOM = 0.82;
const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);

export function emptyGroupNavigation() {
	return { version: VERSION, entries: [] };
}

export function normalizeGroupNavigation(value) {
	if (value == null) return emptyGroupNavigation();
	if (value?.version !== VERSION || !Array.isArray(value.entries)) throw new Error("Unsupported group navigation data");
	const seen = new Set();
	const entries = [];
	for (const candidate of value.entries) {
		const groupId = String(candidate?.groupId ?? "").trim();
		if (!groupId || seen.has(groupId)) continue;
		seen.add(groupId);
		entries.push({
			groupId,
			label: String(candidate?.label || "").trim(),
			shortcut: normalizeShortcut(candidate?.shortcut),
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
	const parts = String(value).split("+").filter(Boolean);
	const code = parts.at(-1);
	if (!code || MODIFIER_CODES.has(code)) throw new Error("A shortcut needs a non-modifier key");
	const modifiers = new Set(parts.slice(0, -1));
	if (![...modifiers].every((part) => ["Ctrl", "Alt", "Shift", "Meta"].includes(part))) throw new Error("Unsupported shortcut modifier");
	if (!modifiers.has("Ctrl") && !modifiers.has("Alt") && !modifiers.has("Meta")) throw new Error("A shortcut needs Ctrl, Alt, or Meta");
	return ["Ctrl", "Alt", "Shift", "Meta"].filter((part) => modifiers.has(part)).concat(code).join("+");
}

export function shortcutFromKeyboardEvent(event) {
	if (!event?.code || MODIFIER_CODES.has(event.code)) return null;
	const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta"].filter(Boolean);
	if (!modifiers.includes("Ctrl") && !modifiers.includes("Alt") && !modifiers.includes("Meta")) return null;
	return normalizeShortcut([...modifiers, event.code].join("+"));
}

export function shortcutLabel(shortcut) {
	if (!shortcut) return "";
	const parts = normalizeShortcut(shortcut).split("+");
	const code = parts.pop();
	const key = code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ").replace(/^Arrow/, "");
	return [...parts.map((part) => part === "Meta" ? "⌘" : part), key].join("+");
}

export function isEditableShortcutTarget(target) {
	const ElementType = globalThis.Element;
	return Boolean(ElementType && target instanceof ElementType && target.closest("input, textarea, select, [contenteditable], [role='dialog']"));
}
