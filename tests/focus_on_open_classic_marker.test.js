import assert from "node:assert/strict";
import test from "node:test";

import {
	classicFocusMarkerCanvasRect,
	hasClassicFocusMarker,
	mountClassicFocusMarker,
	unmountClassicFocusMarker,
} from "../js/lib/focus_on_open_classic_marker.js";

function nodeFixture({ ownHandler = false } = {}) {
	const delegated = [];
	const prototype = {
		onTitleButtonClick(button, canvas) {
			delegated.push({ receiver: this, button, canvas });
		},
	};
	const node = Object.assign(Object.create(prototype), {
		title_buttons: [{ name: "existing", text: "E" }],
		addTitleButton(options) {
			const button = { ...options };
			this.title_buttons.push(button);
			return button;
		},
	});
	if (ownHandler) {
		node.onTitleButtonClick = function (button, canvas) {
			delegated.push({ receiver: this, button, canvas, own: true });
		};
	}
	return { node, delegated };
}

test("Classic focus markers use the native title-button lifecycle without touching widget layout", () => {
	const { node, delegated } = nodeFixture();
	let activated = 0;
	const marker = mountClassicFocusMarker(node, () => activated++);

	assert.equal(marker.name, "aaalice-focus-on-open");
	assert.equal(marker.text, "🎯");
	assert.equal(marker.fontSize, 18);
	assert.equal(marker.height, 20);
	assert.equal(node.title_buttons.at(-1), marker);
	assert.equal(hasClassicFocusMarker(node), true);
	assert.equal(node.widgets, undefined);

	node.onTitleButtonClick(marker, { id: "canvas" });
	assert.equal(activated, 1);
	assert.deepEqual(delegated, []);

	const other = node.title_buttons[0];
	const canvas = { id: "canvas" };
	node.onTitleButtonClick(other, canvas);
	assert.deepEqual(delegated, [{ receiver: node, button: other, canvas }]);

	let updatedActivation = 0;
	assert.equal(mountClassicFocusMarker(node, () => updatedActivation++), marker);
	assert.equal(node.title_buttons.length, 2);
	node.onTitleButtonClick(marker, canvas);
	assert.equal(updatedActivation, 1);

	assert.equal(unmountClassicFocusMarker(node), true);
	assert.equal(hasClassicFocusMarker(node), false);
	assert.deepEqual(node.title_buttons, [other]);
	assert.equal(Object.hasOwn(node, "onTitleButtonClick"), false);
});

test("Classic focus marker settings use rendered title geometry with a fresh-node fallback", () => {
	const { node } = nodeFixture();
	node.pos = [10, 40];
	node.size = [200, 120];
	const marker = mountClassicFocusMarker(node, () => {});
	const canvas = { convertOffsetToCanvas: ([x, y]) => [x * 2, y * 2] };

	assert.deepEqual(classicFocusMarkerCanvasRect(node, canvas), { left: 380, top: 20, width: 40, height: 40 });
	marker._last_area = [170, -28, 18, 20];
	assert.deepEqual(classicFocusMarkerCanvasRect(node, canvas), { left: 360, top: 24, width: 36, height: 40 });
});

test("Classic focus marker cleanup restores own handlers but preserves later replacements", () => {
	const owned = nodeFixture({ ownHandler: true });
	const original = owned.node.onTitleButtonClick;
	mountClassicFocusMarker(owned.node, () => {});
	unmountClassicFocusMarker(owned.node);
	assert.equal(owned.node.onTitleButtonClick, original);

	const replaced = nodeFixture();
	mountClassicFocusMarker(replaced.node, () => {});
	const replacement = () => {};
	replaced.node.onTitleButtonClick = replacement;
	unmountClassicFocusMarker(replaced.node);
	assert.equal(replaced.node.onTitleButtonClick, replacement);
});
