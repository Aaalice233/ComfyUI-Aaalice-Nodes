import assert from "node:assert/strict";
import test from "node:test";

import { closeWorkspaceDialogs, createWorkspaceDialog } from "../js/workspace/dialogs.js";

function dialogFactory(state) {
	return (options) => {
		let closed = false;
		const dialog = {
			options,
			close(value = null) {
				if (closed) return;
				closed = true;
				state.closed.push(value);
				options.onClose?.(value);
			},
		};
		state.dialogs.push(dialog);
		return dialog;
	};
}

test("workspace dialogs close only for the owning sidebar root", () => {
	closeWorkspaceDialogs();
	const stateA = { dialogs: [], closed: [] };
	const stateB = { dialogs: [], closed: [] };
	const globalState = { dialogs: [], closed: [] };
	const ownerA = {};
	const ownerB = {};
	const rootA = { contains: (candidate) => candidate === ownerA };
	const rootB = { contains: (candidate) => candidate === ownerB };
	createWorkspaceDialog({ title: "A" }, ownerA, dialogFactory(stateA));
	createWorkspaceDialog({ title: "B" }, ownerB, dialogFactory(stateB));
	createWorkspaceDialog({ title: "Global" }, null, dialogFactory(globalState));
	assert.equal(stateA.dialogs[0].options.returnFocus, ownerA);

	closeWorkspaceDialogs(rootA);
	assert.equal(stateA.closed.length, 1);
	assert.equal(stateB.closed.length, 0);

	closeWorkspaceDialogs(rootB);
	assert.equal(stateB.closed.length, 1);
	assert.equal(globalState.closed.length, 0);
	closeWorkspaceDialogs();
	assert.equal(globalState.closed.length, 1);
});

test("normal dialog close unregisters it before workflow cleanup", () => {
	closeWorkspaceDialogs();
	const state = { dialogs: [], closed: [] };
	let onCloseCalls = 0;
	const dialog = createWorkspaceDialog({ title: "Note", onClose: () => { onCloseCalls += 1; } }, {}, dialogFactory(state));
	dialog.close("save");
	closeWorkspaceDialogs();
	assert.deepEqual(state.closed, ["save"]);
	assert.equal(onCloseCalls, 1);
});

test("workflow cleanup closes every registered workspace dialog", () => {
	closeWorkspaceDialogs();
	const first = { dialogs: [], closed: [] };
	const second = { dialogs: [], closed: [] };
	createWorkspaceDialog({ title: "First" }, {}, dialogFactory(first));
	createWorkspaceDialog({ title: "Second" }, {}, dialogFactory(second));

	closeWorkspaceDialogs();
	assert.equal(first.closed.length, 1);
	assert.equal(second.closed.length, 1);
	closeWorkspaceDialogs();
	assert.equal(first.closed.length, 1);
	assert.equal(second.closed.length, 1);
});
