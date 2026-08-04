export const GROUP_NAVIGATION_VERSION = 3;
export const DEFAULT_WHEEL_SHORTCUT = "Backquote";

const LEGACY_VERSION = 1;
const PREVIOUS_VERSION = 2;
const OFFSET_LIMIT = 100000;
const DEFAULT_ZOOM = 0.82;
const WHEEL_RESERVED_CODES = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "Backspace", "Delete"]);

function isWheelKeyCode(code) {
	return typeof code === "string" && code.length > 0 && !WHEEL_RESERVED_CODES.has(code);
}

export function emptyGroupNavigation() {
	return { version: GROUP_NAVIGATION_VERSION, wheelShortcut: DEFAULT_WHEEL_SHORTCUT, entries: [] };
}

export function normalizeGroupNavigation(value) {
	if (value == null) return emptyGroupNavigation();
	const sourceVersion = Number(value?.version);
	if (![LEGACY_VERSION, PREVIOUS_VERSION, GROUP_NAVIGATION_VERSION].includes(sourceVersion) || !Array.isArray(value.entries)) throw new Error("Unsupported group navigation data");
	if (sourceVersion === GROUP_NAVIGATION_VERSION && !Object.hasOwn(value, "wheelShortcut")) throw new Error("Missing wheel shortcut in current group navigation data");
	const wheelShortcut = sourceVersion === GROUP_NAVIGATION_VERSION ? normalizeWheelShortcut(value.wheelShortcut) : DEFAULT_WHEEL_SHORTCUT;
	const seen = new Set();
	const entries = [];
	for (const candidate of value.entries) {
		const groupId = String(candidate?.groupId ?? "").trim();
		if (!groupId || seen.has(groupId)) continue;
		seen.add(groupId);
		entries.push({
			groupId,
			label: String(candidate?.label || "").trim(),
			offset: normalizeNavigationOffset(candidate?.offset),
			zoom: normalizeNavigationZoom(candidate?.zoom),
		});
	}
	return { version: GROUP_NAVIGATION_VERSION, wheelShortcut, entries };
}

export function addGroupNavigationEntry(model, group) {
	const next = normalizeGroupNavigation(model);
	const groupId = String(group?.id ?? "").trim();
	if (!groupId || next.entries.some((entry) => entry.groupId === groupId)) return next;
	next.entries.push({ groupId, label: String(group?.title || "").trim(), offset: { x: 0, y: 0 }, zoom: DEFAULT_ZOOM });
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

export function setGroupNavigationWheelShortcut(model, shortcut) {
	const next = normalizeGroupNavigation(model);
	const normalized = normalizeWheelShortcut(shortcut);
	next.wheelShortcut = normalized;
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

export function normalizeWheelShortcut(value) {
	if (value == null || value === "") return null;
	const code = String(value).trim();
	if (!isWheelKeyCode(code)) throw new Error("Wheel shortcut accepts one key");
	return code;
}

export function wheelShortcutFromKeyboardEvent(event) {
	if (!event?.code || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return null;
	return isWheelKeyCode(event.code) ? event.code : null;
}

export function wheelShortcutLabel(shortcut) {
	if (!shortcut) return "";
	const code = normalizeWheelShortcut(shortcut);
	const labels = { Backquote: "`", Space: "Space", Backslash: "\\", IntlBackslash: "\\", NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadDecimal: "Num ." };
	if (labels[code]) return labels[code];
	if (code.startsWith("Key")) return code.slice("Key".length);
	if (code.startsWith("Numpad")) return `Num ${code.slice("Numpad".length)}`;
	if (code.startsWith("Digit")) return code.slice("Digit".length);
	return code;
}

export function isEditableShortcutTarget(target) {
	const ElementType = globalThis.Element;
	return Boolean(ElementType && target instanceof ElementType && target.closest("input, textarea, select, [contenteditable], [role='dialog']"));
}
