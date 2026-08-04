import test from "node:test";
import assert from "node:assert/strict";

import {
	addGroupNavigationEntry, DEFAULT_WHEEL_SHORTCUT, moveGroupNavigationEntry, normalizeGroupNavigation, normalizeWheelShortcut, removeGroupNavigationEntry,
	setGroupNavigationOffset, setGroupNavigationWheelShortcut, setGroupNavigationZoom, wheelShortcutFromKeyboardEvent, wheelShortcutLabel,
} from "../js/lib/group_navigation_model.js";

test("group navigation contains only groups added explicitly and preserves their order", () => {
	let model = normalizeGroupNavigation(null);
	model = addGroupNavigationEntry(model, { id: 8, title: "Detail" });
	model = addGroupNavigationEntry(model, { id: 3, title: "Input" });
	model = addGroupNavigationEntry(model, { id: 8, title: "Duplicate" });
	assert.deepEqual(model.entries.map(({ groupId, label }) => [groupId, label]), [["8", "Detail"], ["3", "Input"]]);
	assert.deepEqual(removeGroupNavigationEntry(model, 8).entries.map((entry) => entry.groupId), ["3"]);
});

test("each navigation group stores an independent bounded canvas offset", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "Large" });
	model = setGroupNavigationOffset(model, 1, { x: 425.4, y: -230.6 });
	assert.deepEqual(model.entries[0].offset, { x: 425, y: -231 });
	assert.deepEqual(normalizeGroupNavigation({ version: 1, entries: [{ groupId: "old" }] }).entries[0].offset, { x: 0, y: 0 });
	assert.equal(normalizeGroupNavigation({ version: 1, entries: [{ groupId: "old" }] }).entries[0].zoom, 0.82);
});

test("each navigation group stores a bounded two-decimal zoom ratio", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "Large" });
	model = setGroupNavigationZoom(model, 1, 1.374);
	assert.equal(model.entries[0].zoom, 1.37);
	assert.equal(setGroupNavigationZoom(model, 1, 99).entries[0].zoom, 3);
});

test("legacy modifier shortcuts are cleared when the navigation model is migrated", () => {
	const model = normalizeGroupNavigation({ version: 1, entries: [{ groupId: "legacy", label: "Legacy", shortcut: "Ctrl+Alt+Digit1" }] });
	assert.equal(model.version, 3);
	assert.equal(model.wheelShortcut, DEFAULT_WHEEL_SHORTCUT);
	assert.equal(Object.hasOwn(model.entries[0], "shortcut"), false);
});

test("the wheel shortcut migrates, can be disabled, and preserves navigation entries", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "One" });
	const beforeEntries = structuredClone(model.entries);
	model = setGroupNavigationWheelShortcut(model, "KeyH");
	assert.equal(model.wheelShortcut, "KeyH");
	assert.deepEqual(model.entries, beforeEntries);
	assert.equal(setGroupNavigationWheelShortcut(model, null).wheelShortcut, null);
	assert.equal(normalizeGroupNavigation({ version: 2, entries: [] }).wheelShortcut, DEFAULT_WHEEL_SHORTCUT);
	assert.equal(normalizeGroupNavigation({ version: 3, wheelShortcut: null, entries: [] }).wheelShortcut, null);
	assert.throws(() => normalizeGroupNavigation({ version: 3, entries: [] }), /Missing wheel shortcut/);
});

test("wheel shortcuts accept any single key except reserved control keys", () => {
	assert.equal(normalizeWheelShortcut("Backquote"), "Backquote");
	assert.equal(normalizeWheelShortcut("KeyG"), "KeyG");
	assert.equal(normalizeWheelShortcut("Digit9"), "Digit9");
	assert.equal(normalizeWheelShortcut("Numpad7"), "Numpad7");
	assert.equal(normalizeWheelShortcut("Minus"), "Minus");
	assert.equal(normalizeWheelShortcut("Space"), "Space");
	assert.equal(normalizeWheelShortcut("ArrowLeft"), "ArrowLeft");
	assert.equal(normalizeWheelShortcut("F12"), "F12");
	assert.equal(wheelShortcutFromKeyboardEvent({ code: "KeyH", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "KeyH");
	assert.equal(wheelShortcutFromKeyboardEvent({ code: "ArrowLeft", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "ArrowLeft");
	assert.equal(wheelShortcutFromKeyboardEvent({ code: "KeyH", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), null);
	assert.equal(wheelShortcutFromKeyboardEvent({ code: "ControlLeft", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), null);
	assert.equal(wheelShortcutLabel("KeyG"), "G");
	assert.equal(wheelShortcutLabel("Backquote"), "`");
	assert.equal(wheelShortcutLabel("Numpad7"), "Num 7");
	assert.equal(wheelShortcutLabel("Space"), "Space");
	assert.equal(wheelShortcutLabel("ArrowLeft"), "ArrowLeft");
	assert.equal(wheelShortcutLabel(null), "");
	assert.throws(() => normalizeWheelShortcut("ControlLeft"), /one key/);
	assert.throws(() => normalizeWheelShortcut("Backspace"), /one key/);
});

test("navigation entries can be reordered without changing their settings", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "One" });
	model = addGroupNavigationEntry(model, { id: 2, title: "Two" });
	model = addGroupNavigationEntry(model, { id: 3, title: "Three" });
	model = moveGroupNavigationEntry(model, 1, 2);
	assert.deepEqual(model.entries.map((entry) => entry.groupId), ["2", "3", "1"]);
});
