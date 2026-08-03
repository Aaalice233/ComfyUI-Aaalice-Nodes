import test from "node:test";
import assert from "node:assert/strict";

import {
	addGroupNavigationEntry, moveGroupNavigationEntry, normalizeGroupNavigation, normalizeShortcut, removeGroupNavigationEntry,
	setGroupNavigationOffset, setGroupNavigationShortcut, setGroupNavigationZoom, shortcutFromKeyboardEvent, shortcutLabel,
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

test("shortcuts accept only unmodified number keys on the main row or numpad", () => {
	assert.equal(normalizeShortcut("Digit1"), "Digit1");
	assert.equal(normalizeShortcut("Numpad6"), "Numpad6");
	assert.equal(shortcutFromKeyboardEvent({ code: "Digit2", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "Digit2");
	assert.equal(shortcutFromKeyboardEvent({ code: "Numpad3", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "Numpad3");
	assert.equal(shortcutFromKeyboardEvent({ code: "Digit2", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), null);
	assert.equal(shortcutFromKeyboardEvent({ code: "Digit2", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false }), null);
	assert.equal(shortcutLabel("Digit4"), "4");
	assert.equal(shortcutLabel("Numpad5"), "Num 5");
	assert.throws(() => normalizeShortcut("Digit7"), /only number keys 1-6/);
	assert.throws(() => normalizeShortcut("Ctrl+Digit1"), /only number keys 1-6/);
});

test("legacy modifier shortcuts are cleared when the navigation model is migrated", () => {
	const model = normalizeGroupNavigation({ version: 1, entries: [{ groupId: "legacy", label: "Legacy", shortcut: "Ctrl+Alt+Digit1" }] });
	assert.equal(model.version, 2);
	assert.equal(model.entries[0].shortcut, null);
});

test("navigation entries can be reordered without changing their settings", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "One" });
	model = addGroupNavigationEntry(model, { id: 2, title: "Two" });
	model = addGroupNavigationEntry(model, { id: 3, title: "Three" });
	model = setGroupNavigationShortcut(model, 2, "Digit2");
	model = moveGroupNavigationEntry(model, 1, 2);
	assert.deepEqual(model.entries.map((entry) => entry.groupId), ["2", "3", "1"]);
	assert.equal(model.entries[0].shortcut, "Digit2");
});

test("a shortcut cannot be assigned to more than one navigation group", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "One" });
	model = addGroupNavigationEntry(model, { id: 2, title: "Two" });
	model = setGroupNavigationShortcut(model, 1, "Digit1");
	assert.throws(() => setGroupNavigationShortcut(model, 2, "Digit1"), /already assigned/);
});
