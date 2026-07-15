import assert from "node:assert/strict";
import test from "node:test";

import {
	disambiguatePanelLabels,
	normalizeReceiverBinding,
	receiverStructureDiff,
	reconcileReceiverSlots,
} from "../js/lib/receiver_model.js";

const meta = (ids) => ids.map((id, order) => ({ id, name: id.toUpperCase(), param_type: "slider", order }));

test("normalizes missing and malformed binding state", () => {
	assert.deepEqual(normalizeReceiverBinding(null).slots, []);
	assert.deepEqual(normalizeReceiverBinding({ slots: [{ parameterId: "a" }, {}] }).slots.map((slot) => slot.parameterId), ["a"]);
});

test("structure diff distinguishes rename from reorder/add/remove", () => {
	const binding = { slots: meta(["a", "b"]).map((item) => ({ parameterId: item.id, name: "old" })) };
	assert.equal(receiverStructureDiff(binding, meta(["a", "b"])).changed, false);
	assert.equal(receiverStructureDiff(binding, meta(["b", "a"])).reordered, true);
	assert.deepEqual(receiverStructureDiff(binding, meta(["a", "c"])).added, ["c"]);
	assert.deepEqual(receiverStructureDiff(binding, meta(["a"])).removed, ["b"]);
});

test("reconcile keeps stable Get ownership by parameter id", () => {
	const current = [
		{ parameterId: "a", name: "Old A", getNodeId: 10, setName: "old_a" },
		{ parameterId: "b", name: "Old B", getNodeId: 11, setName: "old_b" },
	];
	const result = reconcileReceiverSlots(current, meta(["b", "c", "a"]), (item) => `panel_${item.name}`);
	assert.deepEqual(result.ordered.map((slot) => slot.parameterId), ["b", "c", "a"]);
	assert.deepEqual(result.ordered.map((slot) => slot.getNodeId), [11, null, 10]);
	assert.deepEqual(result.added.map((slot) => slot.parameterId), ["c"]);
	assert.deepEqual(result.removed, []);
});

test("duplicate panel titles include node ids", () => {
	assert.deepEqual(disambiguatePanelLabels([{ id: 1, title: "Panel" }, { id: 2, title: "Panel" }]), ["Panel (#1)", "Panel (#2)"]);
});
