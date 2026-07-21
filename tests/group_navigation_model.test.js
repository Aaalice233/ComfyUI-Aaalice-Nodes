import test from "node:test";
import assert from "node:assert/strict";

import {
	addGroupNavigationEntry, normalizeGroupNavigation, normalizeShortcut, removeGroupNavigationEntry,
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

test("shortcuts support modifier combinations and reject bare keys", () => {
	assert.equal(normalizeShortcut("Shift+Alt+Ctrl+Digit1"), "Ctrl+Alt+Shift+Digit1");
	assert.equal(shortcutFromKeyboardEvent({ code: "KeyG", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }), "Ctrl+Alt+KeyG");
	assert.equal(shortcutLabel("Ctrl+Alt+Shift+Digit1"), "Ctrl+Alt+Shift+1");
	assert.equal(shortcutFromKeyboardEvent({ code: "KeyG", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false }), null);
	assert.throws(() => normalizeShortcut("KeyG"), /needs Ctrl, Alt, or Meta/);
});

test("a shortcut cannot be assigned to more than one navigation group", () => {
	let model = addGroupNavigationEntry(null, { id: 1, title: "One" });
	model = addGroupNavigationEntry(model, { id: 2, title: "Two" });
	model = setGroupNavigationShortcut(model, 1, "Alt+Digit1");
	assert.throws(() => setGroupNavigationShortcut(model, 2, "Alt+Digit1"), /already assigned/);
});
