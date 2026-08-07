import test from "node:test";
import assert from "node:assert/strict";

import { inspectControlLinkCompatibility, resolveControlBindingSet, synchronizeLinkedBindingSets } from "../js/lib/control_binding_set.js";

const binding = (controlId, valueType = "number") => ({ provider: "generic-widget", hostId: `host-${controlId}`, controlId, valueType });
const item = (primary, ...linkedBindings) => ({ binding: primary, ...(linkedBindings.length ? { linkedBindings } : {}) });

function graph() {
	return {
		before: 0,
		after: 0,
		dirty: 0,
		beforeChange() { this.before++; },
		afterChange() { this.after++; },
		setDirtyCanvas() { this.dirty++; },
	};
}

function numericResolved(id, owner, targetGraph, options = {}) {
	return {
		status: "ok",
		kind: options.kind || "numeric",
		numericDomain: options.numericDomain || (["numeric", "seed"].includes(options.kind || "numeric") ? "integer" : null),
		family: "comfy",
		linkable: true,
		presettable: true,
		controlId: id,
		control: { id },
		supportsSeedBehavior: options.kind === "seed",
		seedBehaviors: options.kind === "seed" ? ["fixed", "increment", "decrement", "randomize"] : [],
		value: owner.value,
		options: options.domain || { min: 0, max: 100, step: 1 },
		node: { graph: targetGraph, setDirtyCanvas() {} },
		readPresetValue: () => options.kind === "seed" ? { value: owner.value, control_after_generate: owner.behavior } : owner.value,
		validatePresetValue(entry) {
			const value = options.kind === "seed" && typeof entry.payload === "object" ? entry.payload.value : entry.payload;
			if (options.kind === "boolean") return typeof value === "boolean" ? true : "invalid-boolean";
			return typeof value === "number" && value >= 0 && value <= 100 ? true : "invalid-number";
		},
		applyPresetValue(entry) {
			if (options.kind === "seed") { owner.value = entry.payload.value; owner.behavior = entry.payload.control_after_generate; }
			else owner.value = entry.payload;
			if (options.failApply?.(entry)) throw new Error(`${id} apply failed`);
			return options.applyResult;
		},
		setValue(next) {
			owner.value = next;
			if (options.failSet?.(next)) throw new Error(`${id} write failed`);
			return options.setResult;
		},
		flushValue() { owner.flushed = (owner.flushed || 0) + 1; },
		setSeedBehavior(behavior) { owner.behavior = behavior; },
	};
}

function resolver(entries) { return (candidate) => entries.get(candidate.controlId) || { status: "missing" }; }

function entry(candidate, resolved) { return { binding: candidate, resolved }; }

test("link compatibility requires explicit capability and identical control domains", () => {
	const targetGraph = graph();
	const first = binding("first"); const second = binding("second");
	const compatible = inspectControlLinkCompatibility(entry(first, numericResolved("first", { value: 1 }, targetGraph)), entry(second, numericResolved("second", { value: 2 }, targetGraph)));
	assert.equal(compatible.ok, true);
	const differentRange = inspectControlLinkCompatibility(entry(first, numericResolved("first", { value: 1 }, targetGraph)), entry(second, numericResolved("second", { value: 2 }, targetGraph, { domain: { min: 0, max: 10, step: 1 } })));
	assert.deepEqual(differentRange.ok, false);
	assert.equal(differentRange.reason, "incompatible-contract");
	const unsupported = numericResolved("second", { value: 2 }, targetGraph); unsupported.linkable = false;
	assert.equal(inspectControlLinkCompatibility(entry(first, numericResolved("first", { value: 1 }, targetGraph)), entry(second, unsupported)).reason, "unsupported-control");
});

test("link compatibility rejects non-presettable, duplicate physical, and mismatched Seed behavior targets", () => {
	const targetGraph = graph(); const first = binding("first"); const second = binding("second");
	const primary = numericResolved("first", { value: 1 }, targetGraph);
	const nonPresettable = { ...numericResolved("second", { value: 2 }, targetGraph), presettable: false };
	assert.equal(inspectControlLinkCompatibility(entry(first, primary), entry(second, nonPresettable)).reason, "unsupported-codec");
	const duplicatePhysical = { ...numericResolved("second", { value: 2 }, targetGraph), node: primary.node, control: primary.control, controlId: primary.controlId };
	assert.equal(inspectControlLinkCompatibility(entry(first, primary), entry(second, duplicatePhysical)).reason, "duplicate-binding");
	const duplicateAdapter = { ...first, adapterId: "alternate-adapter" };
	assert.equal(inspectControlLinkCompatibility(entry(first, primary), entry(duplicateAdapter, numericResolved("second", { value: 2 }, targetGraph))).reason, "duplicate-binding");
	const seedFirst = numericResolved("first", { value: 1, behavior: "fixed" }, targetGraph, { kind: "seed" });
	const seedSecond = numericResolved("second", { value: 2, behavior: "fixed" }, targetGraph, { kind: "seed" });
	seedSecond.seedBehaviors = ["fixed", "increment"];
	assert.equal(inspectControlLinkCompatibility(entry(first, seedFirst), entry(second, seedSecond)).reason, "incompatible-contract");
});

test("numeric domains and image folders remain part of the link contract", () => {
	const targetGraph = graph(); const first = binding("first"); const second = binding("second");
	const integer = numericResolved("first", { value: 1 }, targetGraph, { numericDomain: "integer" });
	const floating = numericResolved("second", { value: 2 }, targetGraph, { numericDomain: "float" });
	assert.equal(inspectControlLinkCompatibility(entry(first, integer), entry(second, floating)).reason, "incompatible-contract");
	const unspecified = { ...numericResolved("second", { value: 2 }, targetGraph), numericDomain: null };
	assert.equal(inspectControlLinkCompatibility(entry(first, integer), entry(second, unspecified)).reason, "unsupported-numeric-domain");
	const imageBinding = (id) => binding(id, "string");
	const image = (id, folder, values = ["a.png"]) => ({ ...numericResolved(id, { value: "a.png" }, targetGraph, { kind: "image-choice", domain: { values, image_folder: folder, upload_subfolder: "input" } }) });
	assert.equal(inspectControlLinkCompatibility(entry(imageBinding("first"), image("first", "input")), entry(imageBinding("second"), image("second", "output"))).reason, "incompatible-contract");
	assert.equal(inspectControlLinkCompatibility(entry(imageBinding("first"), image("first", "input", ["a.png"])), entry(imageBinding("second"), image("second", "input", ["new.png"]))).ok, true);
});

test("transient availability disables the aggregate without invalidating its links", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const first = numericResolved("primary", { value: 1 }, targetGraph, { kind: "choice", domain: { values: ["x", "y"] } });
	const second = numericResolved("linked", { value: 1 }, targetGraph, { kind: "choice", domain: { values: [] } });
	second.availability = { state: "empty", reason: "no-options" };
	second.readPresetValue = () => { throw new Error("dynamic source is not ready"); };
	assert.equal(inspectControlLinkCompatibility(entry(primary, first), entry(linked, second)).ok, true);
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([["primary", first], ["linked", second]])));
	assert.equal(resolved.status, "ok");
	assert.equal(resolved.availability.state, "empty");
	assert.equal(resolved.bindingSet.issues.length, 0);
	assert.throws(() => resolved.setValue(2), (error) => error.code === "unavailable-binding");
});

test("resolved binding sets report mixed values without mutating targets", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph)],
	])));
	assert.equal(resolved.status, "ok");
	assert.equal(resolved.bindingSet.linkedCount, 1);
	assert.equal(resolved.bindingSet.mixed, true);
	assert.deepEqual(states, { primary: { value: 1 }, linked: { value: 2 } });
});

test("false boolean values remain valid linked-control payloads", () => {
	const targetGraph = graph(); const primary = binding("primary", "boolean"); const linked = binding("linked", "boolean");
	const states = { primary: { value: true }, linked: { value: false } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph, { kind: "boolean" })],
		["linked", numericResolved("linked", states.linked, targetGraph, { kind: "boolean" })],
	])));
	assert.equal(resolved.status, "ok");
	assert.equal(resolved.bindingSet.mixed, true);
	resolved.synchronizeFromPrimary();
	assert.deepEqual(states, { primary: { value: true }, linked: { value: true } });
});

test("one linked commit writes every target inside one graph transaction", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph)],
	])));
	resolved.setValue(9);
	assert.equal(states.primary.value, 9); assert.equal(states.linked.value, 9);
	assert.deepEqual({ before: targetGraph.before, after: targetGraph.after, dirty: targetGraph.dirty }, { before: 1, after: 1, dirty: 1 });
});

test("linked writes reject missing graph ownership before mutating any target", () => {
	const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, null)],
		["linked", numericResolved("linked", states.linked, null)],
	])));
	assert.equal(resolved.status, "linked-error");
	assert.equal(resolved.bindingSet.issues[0].reason, "different-graph");
	assert.deepEqual(states, { primary: { value: 1 }, linked: { value: 2 } });
});

test("a partially mutating linked write rolls every attempted target back", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph, { failSet: (value) => value === 9 })],
	])));
	assert.throws(() => resolved.setValue(9), /linked write failed/);
	assert.equal(states.primary.value, 1); assert.equal(states.linked.value, 2);
	assert.deepEqual({ before: targetGraph.before, after: targetGraph.after, dirty: targetGraph.dirty }, { before: 1, after: 1, dirty: 1 });
});

test("explicit failure results are not treated as successful linked writes", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph, { setResult: { ok: false, message: "rejected" } })],
	])));
	assert.throws(() => resolved.setValue(9), /rejected/);
	assert.equal(states.primary.value, 1); assert.equal(states.linked.value, 2);
});

test("synchronizing from a seed primary copies value and after-generate behavior", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 11, behavior: "increment" }, linked: { value: 2, behavior: "randomize" } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph, { kind: "seed" })],
		["linked", numericResolved("linked", states.linked, targetGraph, { kind: "seed" })],
	])));
	resolved.synchronizeFromPrimary();
	assert.deepEqual(states, { primary: { value: 11, behavior: "increment" }, linked: { value: 11, behavior: "increment" } });
});

test("synchronization is a no-op when linked payloads already match the primary", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 1 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph)],
	])));
	assert.equal(resolved.synchronizeFromPrimary(), false);
	assert.deepEqual({ before: targetGraph.before, after: targetGraph.after, dirty: targetGraph.dirty }, { before: 0, after: 0, dirty: 0 });
});

test("queue reconciliation copies the primary seed state across linked cards once", () => {
	const targetGraph = graph(); const primary = binding("primary"); const linked = binding("linked");
	const states = { primary: { value: 47, behavior: "randomize" }, linked: { value: 91, behavior: "randomize" } };
	const entries = new Map([
		["primary", numericResolved("primary", states.primary, targetGraph, { kind: "seed" })],
		["linked", numericResolved("linked", states.linked, targetGraph, { kind: "seed" })],
	]);
	const dashboard = { pages: [{ items: [{ kind: "control", ...item(primary, linked) }, { kind: "control", ...item(primary, linked) }] }] };
	const outcome = synchronizeLinkedBindingSets(dashboard, resolver(entries), { kind: "seed", transaction: false });
	assert.equal(outcome.synchronized.length, 1);
	assert.equal(outcome.issues.length, 0);
	assert.deepEqual(states.linked, states.primary);
});

test("missing primary fails the card while missing linked targets stay visible as issues", () => {
	const primary = binding("primary"); const linked = binding("linked");
	const missingPrimary = resolveControlBindingSet(item(primary, linked), resolver(new Map()));
	assert.equal(missingPrimary.status, "missing");
	assert.equal(missingPrimary.bindingSet.issues[0].binding.controlId, "primary");
	const targetGraph = graph(); const states = { primary: { value: 1 } };
	const resolved = resolveControlBindingSet(item(primary, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
	])));
	assert.equal(resolved.status, "ok");
	assert.equal(resolved.bindingSet.issues[0].binding.controlId, "linked");
	assert.equal(resolved.bindingSet.issues[0].reason, "unresolved-binding");
	assert.equal(resolved.bindingSet.linkedCount, 1, "missing binding remains listed for management");
});

test("missing linked targets are skipped by writes and synchronization without blocking the card", () => {
	const targetGraph = graph(); const primary = binding("primary"); const missing = binding("missing"); const linked = binding("linked");
	const states = { primary: { value: 1 }, linked: { value: 2 } };
	const resolved = resolveControlBindingSet(item(primary, missing, linked), resolver(new Map([
		["primary", numericResolved("primary", states.primary, targetGraph)],
		["linked", numericResolved("linked", states.linked, targetGraph)],
	])));
	assert.equal(resolved.status, "ok");
	assert.deepEqual(resolved.bindingSet.issues.map((issue) => issue.binding.controlId), ["missing"]);
	resolved.setValue(9);
	assert.deepEqual(states, { primary: { value: 9 }, linked: { value: 9 } });
	assert.deepEqual({ before: targetGraph.before, after: targetGraph.after, dirty: targetGraph.dirty }, { before: 1, after: 1, dirty: 1 });
	states.linked.value = 3;
	assert.equal(resolved.synchronizeFromPrimary(), true);
	assert.equal(states.linked.value, 9);
});
