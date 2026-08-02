import test from "node:test";
import assert from "node:assert/strict";

import {
	DashboardModelError,
	bindingKey,
	controlItemBindings,
	createPage,
	emptyDashboard,
	linkedBindingCount,
	normalizeBinding,
	normalizeDashboard,
} from "../js/lib/dashboard_model.js";
import {
	addItems,
	addLinkedBinding,
	addSeparator,
	compactDashboard,
	createGroup,
	detachBinding,
	duplicateItems,
	duplicatePage,
	moveGroup,
	moveItems,
	removeLinkedBinding,
	replacePrimaryBinding,
	resizeGroup,
	resizeItem,
	ungroupItems,
} from "../js/lib/dashboard_commands.js";

const primary = { provider: "generic-widget", hostId: "host-a", controlId: "steps", valueType: "number" };
const linkedCfg = { provider: "generic-widget", hostId: "host-b", controlId: "cfg", valueType: "number" };
const linkedSeed = { provider: "generic-widget", hostId: "host-d", controlId: "seed", valueType: "number", adapterId: "seed" };
const booleanTarget = { provider: "generic-widget", hostId: "host-c", controlId: "enabled", valueType: "boolean" };

function rawDashboard({ version = 4, linkedBindings } = {}) {
	return {
		version,
		pages: [{
			id: "page-a",
			name: "Generation",
			gridColumns: 12,
			tone: null,
			groups: [],
			items: [{
				id: "item-a",
				kind: "control",
				binding: primary,
				...(linkedBindings !== undefined ? { linkedBindings } : {}),
				label: "Steps",
				groupId: null,
				layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 },
			}],
		}],
	};
}

function modelWithControl() {
	const initial = emptyDashboard();
	const page = createPage("Generation");
	initial.pages.push(page);
	const model = addItems(initial, page.id, [{ label: "Steps", binding: primary }]);
	return { model, pageId: page.id, itemId: model.pages[0].items[0].id };
}

function itemBindingKeys(item) {
	return controlItemBindings(item).map(bindingKey);
}

function assertModelError(code) {
	return (error) => error instanceof DashboardModelError && error.code === code;
}

test("Dashboard V3 migrates to V4 and V4 JSON normalization is idempotent", () => {
	const migrated = normalizeDashboard(rawDashboard({ version: 3 }));
	assert.equal(migrated.version, 4);
	assert.equal("linkedBindings" in migrated.pages[0].items[0], false);

	const normalized = normalizeDashboard(rawDashboard({ linkedBindings: [
		{ ...linkedCfg, ignored: true },
		linkedSeed,
	] }));
	const item = normalized.pages[0].items[0];
	assert.deepEqual(normalizeBinding({ ...primary, ignored: true }), primary);
	assert.deepEqual(controlItemBindings(item), [primary, linkedCfg, linkedSeed]);
	assert.equal(linkedBindingCount(item), 2);
	assert.deepEqual(normalizeDashboard(JSON.parse(JSON.stringify(normalized))), normalized);

	const empty = normalizeDashboard(rawDashboard({ linkedBindings: [] }));
	assert.equal("linkedBindings" in empty.pages[0].items[0], false);
});

test("linked binding normalization rejects malformed, duplicate, and incompatible targets", () => {
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: null })), assertModelError("invalid-binding"));
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: {} })), assertModelError("invalid-binding"));
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: [primary] })), assertModelError("duplicate-binding"));
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: [linkedCfg, { ...linkedCfg }] })), assertModelError("duplicate-binding"));
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: [booleanTarget] })), assertModelError("incompatible-binding"));

	const distinctAdapter = { ...primary, adapterId: "alternate-adapter" };
	assert.throws(() => normalizeDashboard(rawDashboard({ linkedBindings: [distinctAdapter] })), assertModelError("duplicate-binding"));
});

test("addLinkedBinding validates through Dashboard normalization and is immutable", () => {
	const { model, pageId, itemId } = modelWithControl();
	const added = addLinkedBinding(model, itemId, linkedCfg);
	assert.equal("linkedBindings" in model.pages[0].items[0], false);
	assert.deepEqual(added.pages[0].items[0].linkedBindings, [linkedCfg]);
	assert.throws(() => addLinkedBinding(added, itemId, linkedCfg), assertModelError("duplicate-binding"));
	assert.throws(() => addLinkedBinding(added, itemId, { ...linkedCfg, adapterId: "alternate-adapter" }), assertModelError("duplicate-binding"));
	assert.throws(() => addLinkedBinding(added, itemId, booleanTarget), assertModelError("incompatible-binding"));

	const withSeparator = addSeparator(model, pageId, "Section");
	const separatorId = withSeparator.pages[0].items.find((item) => item.kind === "separator").id;
	assert.throws(() => addLinkedBinding(withSeparator, separatorId, linkedCfg), /control item/);
});

test("removeLinkedBinding removes only additional targets", () => {
	const { model, itemId } = modelWithControl();
	const added = addLinkedBinding(model, itemId, linkedCfg);
	const primaryRemoval = removeLinkedBinding(added, itemId, primary);
	assert.deepEqual(controlItemBindings(primaryRemoval.pages[0].items[0]), [primary, linkedCfg]);

	const removed = removeLinkedBinding(added, itemId, linkedCfg);
	assert.deepEqual(controlItemBindings(removed.pages[0].items[0]), [primary]);
	assert.equal("linkedBindings" in removed.pages[0].items[0], false);
	assert.deepEqual(added.pages[0].items[0].linkedBindings, [linkedCfg]);
});

test("detachBinding removes a linked target and promotes the next target when primary is detached", () => {
	const { model, pageId, itemId } = modelWithControl();
	let linked = addLinkedBinding(model, itemId, linkedCfg);
	linked = addLinkedBinding(linked, itemId, linkedSeed);
	linked.pages[0].items[0].groupSource = { provider: "generic-widget", hostId: "host-a" };

	const detachedLinked = detachBinding(linked, itemId, linkedCfg);
	assert.deepEqual(controlItemBindings(detachedLinked.pages[0].items[0]), [primary, linkedSeed]);
	assert.deepEqual(controlItemBindings(linked.pages[0].items[0]), [primary, linkedCfg, linkedSeed]);

	const detachedPrimary = detachBinding(linked, itemId, primary);
	assert.deepEqual(controlItemBindings(detachedPrimary.pages[0].items[0]), [linkedCfg, linkedSeed]);
	assert.equal(detachedPrimary.pages[0].items[0].groupSource, undefined);

	const detachedOnly = detachBinding(model, itemId, primary);
	assert.equal(detachedOnly.pages[0].items.length, 0);
	assert.deepEqual(detachedOnly.pages[0].groups, []);
	assert.equal(pageId, detachedOnly.pages[0].id);
});

test("replacePrimaryBinding drops a matching linked target, clears source ownership, and validates remaining types", () => {
	const { model, itemId } = modelWithControl();
	let linked = addLinkedBinding(model, itemId, linkedCfg);
	linked = addLinkedBinding(linked, itemId, linkedSeed);
	linked.pages[0].items[0].groupSource = { provider: "generic-widget", hostId: "host-a" };

	const replaced = replacePrimaryBinding(linked, itemId, linkedCfg);
	assert.deepEqual(replaced.pages[0].items[0].binding, linkedCfg);
	assert.deepEqual(replaced.pages[0].items[0].linkedBindings, [linkedSeed]);
	assert.equal(replaced.pages[0].items[0].groupSource, undefined);
	assert.deepEqual(linked.pages[0].items[0].binding, primary);
	assert.ok(linked.pages[0].items[0].groupSource);
	assert.throws(() => replacePrimaryBinding(linked, itemId, booleanTarget), assertModelError("incompatible-binding"));
});

test("copy and layout commands preserve the complete binding set", () => {
	const { model, pageId, itemId } = modelWithControl();
	let next = addLinkedBinding(model, itemId, linkedCfg);
	next = addLinkedBinding(next, itemId, linkedSeed);
	const expected = [primary, linkedCfg, linkedSeed].map(bindingKey);

	next = resizeItem(next, itemId, { columnSpan: 9, rowSpan: 18 });
	next = moveItems(next, [itemId], pageId, { row: 8, column: 2 });
	next = createGroup(next, pageId, [itemId], { allowSingle: true });
	const groupId = next.pages[0].groups[0].id;
	next = resizeGroup(next, groupId, { columnSpan: 12 });
	next = moveGroup(next, pageId, groupId, 4, 0);
	next = ungroupItems(next, pageId, [itemId]);
	next = compactDashboard(next, pageId);
	assert.deepEqual(itemBindingKeys(next.pages[0].items.find((item) => item.id === itemId)), expected);

	const withItemCopy = duplicateItems(next, pageId, [itemId]);
	assert.equal(withItemCopy.pages[0].items.length, 2);
	assert.ok(withItemCopy.pages[0].items.every((item) => JSON.stringify(itemBindingKeys(item)) === JSON.stringify(expected)));

	const withPageCopy = duplicatePage(next, pageId);
	assert.equal(withPageCopy.pages.length, 2);
	assert.ok(withPageCopy.pages.every((page) => JSON.stringify(itemBindingKeys(page.items[0])) === JSON.stringify(expected)));
});
