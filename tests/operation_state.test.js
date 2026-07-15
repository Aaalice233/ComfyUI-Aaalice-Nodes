import test from "node:test";
import assert from "node:assert/strict";

import {
	OPERATION_VERSION,
	consumeOperationResetVersion,
	createContainerModule,
	createNodeModule,
	createOperationState,
	moduleDescendants,
	operationState,
	removeModule,
	validateContainerDepth,
} from "../js/lib/operation_state.js";

test("v3 is the only accepted workflow layout format", () => {
	const graph = { extra: { aaalice_operation_panel: { version: 2, pages: [{ id: "old" }] } } };
	const state = operationState(graph, true);
	assert.equal(state.version, OPERATION_VERSION);
	assert.equal(consumeOperationResetVersion(graph), 2);
	assert.equal("reset_from_version" in state, false);
	assert.notEqual(state.pages[0].id, "old");
});

test("page design modes normalize without snapshotting the current window", () => {
	const graph = { extra: { aaalice_operation_panel: {
		version: OPERATION_VERSION,
		default_page_id: "fixed",
		pages: [
			{ id: "fixed", design: { preset: "1920x1080", width: 123, height: 456 }, modules: {}, root_ids: [] },
			{ id: "current", design: { preset: "current", width: 2560, height: 1440 }, modules: {}, root_ids: [] },
		],
	} } };
	const state = operationState(graph, true);
	assert.deepEqual(state.pages[0].design, { preset: "1920x1080", width: 1920, height: 1080 });
	assert.deepEqual(state.pages[1].design, { preset: "current" });
});

test("removing a container removes its descendants but never graph nodes", () => {
	const state = createOperationState();
	const page = state.pages[0];
	const one = createNodeModule("11");
	const two = createNodeModule("12");
	page.modules[one.id] = one;
	page.modules[two.id] = two;
	page.root_ids.push(one.id, two.id);
	const group = createContainerModule("group", [one.id, two.id]);
	one.parent_id = group.id;
	two.parent_id = group.id;
	page.modules[group.id] = group;
	page.root_ids = [group.id];
	assert.deepEqual(moduleDescendants(page, group.id), [group.id, one.id, two.id]);
	assert.equal(validateContainerDepth(page, "group", [one.id, two.id]), false, "children already have a parent");
	assert.deepEqual(removeModule(page, group.id), [group.id, one.id, two.id]);
	assert.deepEqual(page.root_ids, []);
});

test("carousel accepts root cards and groups but rejects nested carousel", () => {
	const page = createOperationState().pages[0];
	const one = createNodeModule("1");
	const two = createNodeModule("2");
	page.modules[one.id] = one;
	page.modules[two.id] = two;
	page.root_ids.push(one.id, two.id);
	assert.equal(validateContainerDepth(page, "carousel", [one.id, two.id]), true);
	const carousel = createContainerModule("carousel", [one.id, two.id]);
	page.modules[carousel.id] = carousel;
	page.root_ids.push(carousel.id);
	assert.equal(validateContainerDepth(page, "carousel", [carousel.id, one.id]), false);
});
