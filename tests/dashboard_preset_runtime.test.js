import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, applyDashboardSnapshotPlan, captureDashboardValues, dashboardPresetIssueLocations, mergeCapturedPresetValues, mergeDashboardPresetValues, planDashboardPresetApplication, planDashboardPresetValueOverwrite } from "../js/lib/dashboard_preset_runtime.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, validateSeedPresetEntry } from "../js/lib/seed_preset.js";

const binding = (controlId, valueType = "number") => ({ provider: "generic-widget", hostId: "host-a", controlId, valueType });
const dashboard = (...bindings) => ({ version: 4, pages: [
	{ id: "page-a", name: "A", gridColumns: 12, tone: null, groups: [], items: bindings.map((item, index) => ({ id: `item-${index}`, kind: "control", binding: item, label: "", groupId: null, layout: { row: index * 13, column: 0, columnSpan: 6, rowSpan: 13 } })) },
	{ id: "page-b", name: "B", gridColumns: 12, tone: null, groups: [], items: bindings.length ? [{ id: "mirror", kind: "control", binding: bindings[0], label: "", groupId: null, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } }] : [] },
] });
const snapshot = (layout, values = {}) => ({ dashboard: layout, values });

test("value capture deduplicates mirrored cards and skips unresolved or unset controls", () => {
	const steps = binding("steps"); const cfg = binding("cfg"); const empty = binding("empty", "string"); const calls = [];
	const result = captureDashboardValues(dashboard(steps, cfg, empty), (candidate) => {
		calls.push(candidate.controlId);
		if (candidate.controlId === "cfg") return { status: "missing" };
		if (candidate.controlId === "empty") return { status: "ok", readPresetValue: () => undefined };
		return { status: "ok", readPresetValue: () => 28 };
	});
	assert.deepEqual(calls, ["steps", "cfg", "empty"]);
	assert.deepEqual(result.values, { [bindingKey(steps)]: { valueType: "number", payload: 28 } });
	assert.deepEqual(result.bindings.map(({ status }) => status), ["ok", "missing", "unset"]);
});

test("one V4 card captures its primary and every linked target", () => {
	const primary = binding("primary"); const linkedA = binding("linked-a"); const linkedB = binding("linked-b");
	const layout = dashboard(primary); const calls = [];
	layout.pages[0].items[0].linkedBindings = [linkedA, linkedB];
	const payloads = { primary: 1, "linked-a": 2, "linked-b": 3 };
	const result = captureDashboardValues(layout, (candidate) => {
		calls.push(candidate.controlId);
		return { status: "ok", readPresetValue: () => payloads[candidate.controlId] };
	});
	assert.deepEqual(calls, ["primary", "linked-a", "linked-b"]);
	assert.deepEqual(result.values, {
		[bindingKey(primary)]: { valueType: "number", payload: 1 },
		[bindingKey(linkedA)]: { valueType: "number", payload: 2 },
		[bindingKey(linkedB)]: { valueType: "number", payload: 3 },
	});
	assert.deepEqual(result.bindings.map(({ status }) => status), ["ok", "ok", "ok"]);
});

test("capture globally deduplicates linked targets in stable layout order", () => {
	const first = binding("first"); const shared = binding("shared"); const second = binding("second");
	const layout = dashboard(first, second); const resolves = []; const reads = [];
	layout.pages[0].items[0].linkedBindings = [shared];
	layout.pages[0].items[1].linkedBindings = [shared];
	layout.pages[1].items[0].linkedBindings = [shared];
	const payloads = { first: 1, shared: 2, second: 3 };
	const result = captureDashboardValues(layout, (candidate) => {
		resolves.push(candidate.controlId);
		return { status: "ok", readPresetValue: () => { reads.push(candidate.controlId); return payloads[candidate.controlId]; } };
	});
	assert.deepEqual(resolves, ["first", "shared", "second"]);
	assert.deepEqual(reads, ["first", "shared", "second"]);
	assert.deepEqual(Object.keys(result.values), [bindingKey(first), bindingKey(shared), bindingKey(second)]);
});

test("conflicting value types for one physical binding fail explicitly instead of first-win deduplication", () => {
	const numeric = binding("shared", "number"); const text = binding("shared", "string");
	const layout = dashboard(numeric); layout.pages[0].items.push({ id: "conflict", kind: "control", binding: text, label: "", groupId: null, layout: { row: 26, column: 0, columnSpan: 6, rowSpan: 13 } });
	const captured = captureDashboardValues(layout, () => { throw new Error("conflicting bindings must not resolve"); });
	assert.equal(captured.values.shared, undefined);
	assert.equal(captured.bindings.find((entry) => entry.key === bindingKey(numeric)).reason, "conflicting-value-type");
	const reversed = structuredClone(layout); reversed.pages[0].items.reverse();
	for (const candidate of [layout, reversed]) {
		const plan = planDashboardPresetApplication(snapshot(candidate, { [bindingKey(numeric)]: { valueType: "number", payload: 1 } }), () => { throw new Error("conflicting bindings must not resolve"); });
		assert.equal(plan.issues.find((entry) => entry.key === bindingKey(numeric)).reason, "conflicting-value-type");
	}
});

test("layout-only views keep bindings without persisting transient values", () => {
	const compare = binding("compare_view", "image-compare-view");
	const key = bindingKey(compare);
	const captured = captureDashboardValues(dashboard(compare), () => ({ status: "ok", presettable: false, value: { beforeImages: ["temp-a"] } }));
	assert.deepEqual(captured.values, {});
	assert.deepEqual(captured.bindings.map(({ status }) => status), ["layout-only"]);
	assert.deepEqual(mergeCapturedPresetValues(captured, { [key]: { valueType: "image-compare-view", payload: { beforeImages: ["stale"] } } }), {});
	const plan = planDashboardPresetApplication(snapshot(dashboard(compare), {}), () => ({ status: "ok", presettable: false }));
	assert.equal(plan.ready.length, 0); assert.equal(plan.issues.length, 0); assert.equal(plan.entries[0].status, "layout-only");
});

test("capture respects runtime availability and preserves unavailable saved values", () => {
	const steps = binding("steps"); const cfg = binding("cfg");
	const snapshot = captureDashboardValues(dashboard(steps, cfg), (candidate) => candidate.controlId === "cfg"
		? { status: "ok", value: 7, availability: { state: "unavailable" } }
		: { status: "ok", value: 24 });
	assert.deepEqual(snapshot.values, { [bindingKey(steps)]: { valueType: "number", payload: 24 } });
	assert.deepEqual(snapshot.bindings.map(({ status }) => status), ["ok", "unavailable"]);
	const previous = { [bindingKey(cfg)]: { valueType: "number", payload: 11 }, "generic-widget:gone:value": { valueType: "number", payload: 3 } };
	assert.deepEqual(mergeCapturedPresetValues(snapshot, previous), {
		[bindingKey(steps)]: { valueType: "number", payload: 24 },
		[bindingKey(cfg)]: { valueType: "number", payload: 11 },
	});
});

test("capture rejects non-finite live values without breaking the remaining preset", () => {
	const invalid = binding("invalid"); const valid = binding("valid");
	const captured = captureDashboardValues(dashboard(invalid, valid), (candidate) => ({ status: "ok", value: candidate.controlId === "invalid" ? Number.NaN : 12 }));
	assert.deepEqual(captured.values, { [bindingKey(valid)]: { valueType: "number", payload: 12 } });
	assert.deepEqual(captured.bindings.map(({ status }) => status), ["invalid", "ok"]);
	assert.match(captured.bindings[0].reason, /finite numbers/);
	const previous = { [bindingKey(invalid)]: { valueType: "number", payload: 7 } };
	assert.deepEqual(mergeCapturedPresetValues(captured, previous), {
		[bindingKey(invalid)]: { valueType: "number", payload: 7 },
		[bindingKey(valid)]: { valueType: "number", payload: 12 },
	});
});

test("application planning separates ready, absent, incompatible and invalid values", () => {
	const steps = binding("steps"); const cfg = binding("cfg"); const mode = binding("mode", "string");
	const preset = snapshot(dashboard(steps, cfg, mode), {
		[bindingKey(steps)]: { valueType: "number", payload: 30 },
		[bindingKey(cfg)]: { valueType: "number", payload: 11 },
		[bindingKey(mode)]: { valueType: "number", payload: 1 },
		"generic-widget:gone:value": { valueType: "number", payload: 2 },
	});
	const plan = planDashboardPresetApplication(preset, (candidate) => {
		if (candidate.controlId === "cfg") return { status: "ok", value: 7, validatePresetValue: () => "above-maximum" };
		return { status: "ok", value: candidate.controlId === "mode" ? "fast" : 20, validatePresetValue: () => true };
	});
	assert.deepEqual(plan.ready.map(({ key }) => key), [bindingKey(steps)]);
	assert.deepEqual(plan.issues.map(({ status }) => status), ["invalid", "incompatible", "unused"]);
});

test("value overwrite uses the target dashboard and preserves its layout and unmatched values", () => {
	const steps = binding("steps"); const linked = binding("linked"); const added = binding("added"); const old = binding("old");
	const targetDashboard = dashboard(steps, added);
	targetDashboard.pages[0].items[0].linkedBindings = [linked];
	targetDashboard.pages[0].items[1].linkedBindings = [linked];
	const target = snapshot(targetDashboard, {
		[bindingKey(steps)]: { valueType: "number", payload: 11 },
		[bindingKey(linked)]: { valueType: "number", payload: 12 },
		[bindingKey(added)]: { valueType: "number", payload: 99 },
		[bindingKey(old)]: { valueType: "number", payload: 7 },
	});
	const source = snapshot(dashboard(steps), {
		[bindingKey(steps)]: { valueType: "number", payload: 41 },
		[bindingKey(linked)]: { valueType: "number", payload: 42 },
		[bindingKey(old)]: { valueType: "number", payload: 8 },
	});
	const resolves = [];
	const plan = planDashboardPresetValueOverwrite(source, target, (candidate) => {
		resolves.push(candidate.controlId);
		return { status: "ok", validatePresetValue: () => true };
	});
	assert.deepEqual(resolves, ["steps", "linked"]);
	assert.deepEqual(plan.merged.dashboard, targetDashboard);
	assert.deepEqual(plan.merged.values, {
		[bindingKey(steps)]: { valueType: "number", payload: 41 },
		[bindingKey(linked)]: { valueType: "number", payload: 42 },
		[bindingKey(added)]: { valueType: "number", payload: 99 },
		[bindingKey(old)]: { valueType: "number", payload: 7 },
	});
	assert.deepEqual(plan.summary, { overwritten: 2, exact: 2, recovered: 0, preserved: 1, unmatched: 1, needsReview: 0 });
	assert.deepEqual(mergeDashboardPresetValues(source, target, [bindingKey(steps)]).dashboard, targetDashboard);
});

test("value overwrite safely recovers a uniquely identified card after workflow binding IDs change", () => {
	const sourceBinding = { provider: "generic-widget", adapterId: "legacy", hostId: "old-host", controlId: "steps", valueType: "number" };
	const targetBinding = { provider: "generic-widget", adapterId: "current", hostId: "new-host", controlId: "steps", valueType: "number" };
	const sourceLayout = dashboard(sourceBinding); const targetLayout = dashboard(targetBinding);
	sourceLayout.pages[0].items[0].id = "old-item"; sourceLayout.pages[0].items[0].label = "Sampling Steps";
	targetLayout.pages[0].items[0].id = "new-item"; targetLayout.pages[0].items[0].label = "Sampling Steps v2";
	const source = snapshot(sourceLayout, { [bindingKey(sourceBinding)]: { valueType: "number", payload: 36 } });
	const target = snapshot(targetLayout, { [bindingKey(targetBinding)]: { valueType: "number", payload: 18 } });
	const resolved = [];
	const plan = planDashboardPresetValueOverwrite(source, target, (candidate) => {
		resolved.push(candidate);
		return { status: "ok", validatePresetValue: () => true };
	});
	assert.deepEqual(resolved, [targetBinding]);
	assert.deepEqual(plan.merged.dashboard, targetLayout);
	assert.equal(plan.merged.values[bindingKey(targetBinding)].payload, 36);
	assert.equal(plan.entries[0].match, "recovered");
	assert.equal(plan.entries[0].sourceKey, bindingKey(sourceBinding));
	assert.deepEqual(plan.summary, { overwritten: 1, exact: 0, recovered: 1, preserved: 0, unmatched: 0, needsReview: 0 });
});

test("recovery tiers remain stable across card, host, context, and label drift", () => {
	for (const recovery of ["card", "host", "context", "label"]) {
		const sourceBinding = { provider: "generic-widget", adapterId: "source-adapter", hostId: "source-host", controlId: "cfg", valueType: "number" };
		const targetBinding = { ...sourceBinding, adapterId: "target-adapter", hostId: recovery === "host" ? sourceBinding.hostId : "target-host" };
		const sourceLayout = dashboard(sourceBinding); const targetLayout = dashboard(targetBinding);
		sourceLayout.pages[1].items = []; targetLayout.pages[1].items = [];
		const sourceItem = sourceLayout.pages[0].items[0]; const targetItem = targetLayout.pages[0].items[0];
		sourceItem.id = "source-card"; sourceItem.label = "Source label";
		targetItem.id = recovery === "card" ? sourceItem.id : "target-card";
		targetItem.label = recovery === "label" ? "ＳＯＵＲＣＥ　ＬＡＢＥＬ" : "Target label";
		if (recovery !== "context") targetLayout.pages[0].name = "Changed page";
		const source = snapshot(sourceLayout, { [bindingKey(sourceBinding)]: { valueType: "number", payload: 27 } });
		const target = snapshot(targetLayout, { [bindingKey(targetBinding)]: { valueType: "number", payload: 9 } });
		const plan = planDashboardPresetValueOverwrite(source, target, () => ({ status: "ok", validatePresetValue: () => true }));
		assert.equal(plan.ready.length, 1, recovery);
		assert.equal(plan.ready[0].match, "recovered", recovery);
		assert.equal(plan.merged.values[bindingKey(targetBinding)].payload, 27, recovery);
	}
});

test("recovered card values fan out to the updated card binding set", () => {
	const sourceBinding = { provider: "generic-widget", hostId: "old-host", controlId: "guidance", valueType: "number" };
	const targetPrimary = { provider: "generic-widget", hostId: "new-host", controlId: "guidance", valueType: "number" };
	const targetLinked = { provider: "generic-widget", hostId: "linked-host", controlId: "guidance", valueType: "number" };
	const sourceLayout = dashboard(sourceBinding); const targetLayout = dashboard(targetPrimary);
	sourceLayout.pages[0].items[0].id = "old-guidance"; sourceLayout.pages[0].items[0].label = "Guidance";
	targetLayout.pages[0].items[0].id = "new-guidance"; targetLayout.pages[0].items[0].label = "Guidance";
	targetLayout.pages[0].items[0].linkedBindings = [targetLinked];
	const source = snapshot(sourceLayout, { [bindingKey(sourceBinding)]: { valueType: "number", payload: 4.5 } });
	const target = snapshot(targetLayout, {
		[bindingKey(targetPrimary)]: { valueType: "number", payload: 3 },
		[bindingKey(targetLinked)]: { valueType: "number", payload: 3 },
	});
	const plan = planDashboardPresetValueOverwrite(source, target, () => ({ status: "ok", validatePresetValue: () => true }));
	assert.deepEqual(plan.ready.map(({ binding: entry, match }) => [entry.hostId, match]), [["new-host", "recovered"], ["linked-host", "recovered"]]);
	assert.equal(plan.merged.values[bindingKey(targetPrimary)].payload, 4.5);
	assert.equal(plan.merged.values[bindingKey(targetLinked)].payload, 4.5);
	assert.deepEqual(plan.summary, { overwritten: 2, exact: 0, recovered: 2, preserved: 0, unmatched: 0, needsReview: 0 });
});

test("binding anchors do not fan out values from an incompatible source card", () => {
	const sourcePrimary = { provider: "generic-widget", hostId: "old-cfg", controlId: "cfg", valueType: "number" };
	const anchor = { provider: "generic-widget", hostId: "shared-steps", controlId: "steps", valueType: "number" };
	const targetLinked = { provider: "generic-widget", hostId: "new-steps", controlId: "steps", valueType: "number" };
	const sourceLayout = dashboard(sourcePrimary); sourceLayout.pages[0].items[0].linkedBindings = [anchor];
	const targetLayout = dashboard(anchor); targetLayout.pages[0].items[0].linkedBindings = [targetLinked];
	const source = snapshot(sourceLayout, {
		[bindingKey(sourcePrimary)]: { valueType: "number", payload: 6 },
		[bindingKey(anchor)]: { valueType: "number", payload: 28 },
	});
	const target = snapshot(targetLayout, {
		[bindingKey(anchor)]: { valueType: "number", payload: 20 },
		[bindingKey(targetLinked)]: { valueType: "number", payload: 20 },
	});
	const plan = planDashboardPresetValueOverwrite(source, target, () => ({ status: "ok", validatePresetValue: () => true }));
	assert.equal(plan.merged.values[bindingKey(anchor)].payload, 28);
	assert.equal(plan.merged.values[bindingKey(targetLinked)].payload, 20);
	assert.equal(plan.entries.find((entry) => entry.key === bindingKey(targetLinked)).status, "preserved");
});

test("semantic recovery refuses ambiguous cards instead of pairing by order", () => {
	const sourceA = { provider: "generic-widget", hostId: "old-a", controlId: "strength", valueType: "number" };
	const sourceB = { provider: "generic-widget", hostId: "old-b", controlId: "strength", valueType: "number" };
	const targetBinding = { provider: "generic-widget", hostId: "new-host", controlId: "strength", valueType: "number" };
	const sourceLayout = dashboard(sourceA, sourceB); const targetLayout = dashboard(targetBinding);
	for (const [index, item] of sourceLayout.pages[0].items.entries()) { item.id = `old-${index}`; item.label = "Strength"; }
	targetLayout.pages[0].items[0].id = "new-target"; targetLayout.pages[0].items[0].label = "Strength";
	const source = snapshot(sourceLayout, {
		[bindingKey(sourceA)]: { valueType: "number", payload: 0.2 },
		[bindingKey(sourceB)]: { valueType: "number", payload: 0.8 },
	});
	const target = snapshot(targetLayout, { [bindingKey(targetBinding)]: { valueType: "number", payload: 0.5 } });
	const plan = planDashboardPresetValueOverwrite(source, target, () => { throw new Error("ambiguous values must not resolve"); });
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.entries.find((entry) => entry.key === bindingKey(targetBinding)).status, "ambiguous");
	assert.equal(plan.merged.values[bindingKey(targetBinding)].payload, 0.5);
	assert.deepEqual(plan.summary, { overwritten: 0, exact: 0, recovered: 0, preserved: 0, unmatched: 2, needsReview: 1 });
});

test("semantic recovery also refuses one source that could fit multiple targets", () => {
	const sourceBinding = { provider: "generic-widget", hostId: "old-host", controlId: "strength", valueType: "number" };
	const targetA = { provider: "generic-widget", hostId: "new-a", controlId: "strength", valueType: "number" };
	const targetB = { provider: "generic-widget", hostId: "new-b", controlId: "strength", valueType: "number" };
	const sourceLayout = dashboard(sourceBinding); const targetLayout = dashboard(targetA, targetB);
	sourceLayout.pages[0].items[0].id = "old"; sourceLayout.pages[0].items[0].label = "Strength";
	for (const [index, item] of targetLayout.pages[0].items.entries()) { item.id = `new-${index}`; item.label = "Strength"; }
	const plan = planDashboardPresetValueOverwrite(
		snapshot(sourceLayout, { [bindingKey(sourceBinding)]: { valueType: "number", payload: 0.8 } }),
		snapshot(targetLayout, { [bindingKey(targetA)]: { valueType: "number", payload: 0.2 }, [bindingKey(targetB)]: { valueType: "number", payload: 0.4 } }),
		() => { throw new Error("one-to-many recovery must not resolve"); },
	);
	assert.equal(plan.ready.length, 0);
	assert.deepEqual(plan.entries.filter((entry) => entry.status === "ambiguous").map((entry) => entry.key).sort(), [bindingKey(targetA), bindingKey(targetB)].sort());
	assert.equal(plan.merged.values[bindingKey(targetA)].payload, 0.2);
	assert.equal(plan.merged.values[bindingKey(targetB)].payload, 0.4);
});

test("value overwrite reports incompatible, unavailable and invalid source values without changing target values", () => {
	const incompatible = binding("incompatible"); const missing = binding("missing"); const invalid = binding("invalid");
	const target = snapshot(dashboard(incompatible, missing, invalid), {
		[bindingKey(incompatible)]: { valueType: "number", payload: 1 },
		[bindingKey(missing)]: { valueType: "number", payload: 2 },
		[bindingKey(invalid)]: { valueType: "number", payload: 3 },
	});
	const source = snapshot(dashboard(incompatible, missing, invalid), {
		[bindingKey(incompatible)]: { valueType: "string", payload: "wrong" },
		[bindingKey(missing)]: { valueType: "number", payload: 20 },
		[bindingKey(invalid)]: { valueType: "number", payload: 30 },
	});
	const plan = planDashboardPresetValueOverwrite(source, target, (candidate) => {
		if (candidate.controlId === "missing") return { status: "missing" };
		return { status: "ok", availability: candidate.controlId === "invalid" ? { state: "unavailable" } : null, validatePresetValue: () => "codec-rejected" };
	});
	assert.equal(plan.ready.length, 0);
	assert.deepEqual(plan.issues.map(({ key, status }) => [key, status]), [
		[bindingKey(incompatible), "incompatible"],
		[bindingKey(missing), "missing"],
		[bindingKey(invalid), "unavailable"],
	]);
	assert.deepEqual(plan.merged.values, target.values);
	assert.equal(plan.summary.needsReview, 3);
});

test("linked targets surface missing and invalid values in application issues", () => {
	const primary = binding("primary"); const missing = binding("missing"); const invalid = binding("invalid");
	const layout = dashboard(primary);
	layout.pages[0].items[0].linkedBindings = [missing, invalid];
	const preset = snapshot(layout, {
		[bindingKey(primary)]: { valueType: "number", payload: 10 },
		[bindingKey(missing)]: { valueType: "number", payload: 20 },
		[bindingKey(invalid)]: { valueType: "number", payload: 30 },
	});
	const plan = planDashboardPresetApplication(preset, (candidate) => {
		if (candidate.controlId === "missing") return { status: "missing" };
		if (candidate.controlId === "invalid") return { status: "ok", value: 3, validatePresetValue: () => "invalid-linked-value" };
		return { status: "ok", value: 1, validatePresetValue: () => true };
	});
	assert.deepEqual(plan.ready.map(({ key }) => key), [bindingKey(primary)]);
	assert.deepEqual(plan.issues.map(({ key, status }) => [key, status]), [
		[bindingKey(missing), "missing"],
		[bindingKey(invalid), "invalid"],
	]);
	assert.equal(plan.issues[1].reason, "invalid-linked-value");
});

test("preset issues resolve to human-readable sidebar component locations", () => {
	const primary = binding("model"); const linked = binding("linked-model"); const layout = dashboard(primary);
	const item = layout.pages[0].items[0];
	layout.pages[0].name = "Upscaling";
	layout.pages[0].groups = [{ id: "upscaler", name: "SeedVR2", nameOverride: "Sharpener", layout: { row: 0, column: 0, columnSpan: 12, rowSpan: 13 } }];
	item.groupId = "upscaler"; item.label = "Model"; item.labelOverride = "SeedVR2 model"; item.linkedBindings = [linked];
	assert.deepEqual(dashboardPresetIssueLocations(layout, { binding: linked, resolved: { label: "UNET name" } }), [{
		pageName: "Upscaling", groupName: "Sharpener", componentLabel: "SeedVR2 model", parameterLabel: "UNET name", linked: true,
	}]);
	const mirrored = dashboardPresetIssueLocations(layout, { binding: primary, resolved: { label: "Current model label" } });
	assert.equal(mirrored.length, 2);
	assert.deepEqual(mirrored[0], { pageName: "Upscaling", groupName: "Sharpener", componentLabel: "SeedVR2 model", parameterLabel: "Current model label", linked: false });
	assert.deepEqual(dashboardPresetIssueLocations(layout, { key: "removed-binding" }), []);
});

test("preset application resolves each unique linked binding once and rolls all targets back", () => {
	const first = binding("first"); const linked = binding("linked"); const last = binding("last");
	const state = { first: 1, linked: 2, last: 3 }; const resolves = []; const reads = []; const writes = [];
	const resolved = (candidate) => {
		resolves.push(candidate.controlId);
		return {
			status: "ok", node: { setDirtyCanvas() {} },
			readPresetValue: () => { reads.push(candidate.controlId); return state[candidate.controlId]; }, validatePresetValue: () => true,
			applyPresetValue(entry) {
				writes.push([candidate.controlId, entry.payload]);
				state[candidate.controlId] = entry.payload;
				if (candidate.controlId === "last" && entry.payload === 30) throw new Error("vendor write failed");
			},
		};
	};
	const layout = dashboard(first, last);
	layout.pages[0].items[0].linkedBindings = [linked];
	layout.pages[0].items[1].linkedBindings = [linked];
	layout.pages[1].items[0].linkedBindings = [linked];
	const preset = snapshot(layout, {
		[bindingKey(first)]: { valueType: "number", payload: 10 },
		[bindingKey(linked)]: { valueType: "number", payload: 20 },
		[bindingKey(last)]: { valueType: "number", payload: 30 },
	});
	const plan = planDashboardPresetApplication(preset, resolved);
	assert.deepEqual(resolves, ["first", "linked", "last"]);
	assert.deepEqual(reads, ["first", "linked", "last"]);
	assert.throws(() => applyDashboardPresetPlan(plan), /vendor write failed/);
	assert.deepEqual(state, { first: 1, linked: 2, last: 3 });
	assert.deepEqual(writes, [["first", 10], ["linked", 20], ["last", 30], ["last", 3], ["linked", 2], ["first", 1]]);
});

test("application rolls back a codec that mutates before throwing", () => {
	const target = binding("target"); let current = 1;
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => current, validatePresetValue: () => true,
		applyPresetValue(entry) { current = entry.payload; if (entry.payload === 9) throw new Error("failed after write"); },
	}));
	assert.throws(() => applyDashboardPresetPlan(plan), /failed after write/);
	assert.equal(current, 1);
});

test("explicit preset codec rejection rolls a partially mutated value back", () => {
	const target = binding("target"); let current = 1;
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => current, validatePresetValue: () => true,
		applyPresetValue(entry) { current = entry.payload; return entry.payload === 9 ? { ok: false, message: "rejected" } : true; },
	}));
	assert.throws(() => applyDashboardPresetPlan(plan), /rejected/);
	assert.equal(current, 1);
});

test("asynchronous third-party preset codecs fail visibly before application", () => {
	const target = binding("target");
	const preset = snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } });
	const plan = planDashboardPresetApplication(preset, () => ({ status: "ok", value: 1, validatePresetValue: async () => true }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].error.code, "async-preset-codec");
});

test("successful preset application reports the atomic result", () => {
	const steps = binding("steps"); let current = 20; let dirty = 0;
	const preset = snapshot(dashboard(steps), { [bindingKey(steps)]: { valueType: "number", payload: 32 } });
	const plan = planDashboardPresetApplication(preset, () => ({
		status: "ok", node: { setDirtyCanvas: () => dirty++ }, readPresetValue: () => current,
		validatePresetValue: () => true, applyPresetValue: (entry) => { current = entry.payload; },
	}));
	assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 1, skipped: 0 });
	assert.equal(current, 32); assert.equal(dirty, 1);
});

test("switching between seed presets restores each after-generate behavior", () => {
	const seed = binding("seed"); const state = { value: 1, behavior: "randomize" };
	const resolveSeed = () => ({
		status: "ok", kind: "seed", value: state.value,
		readPresetValue: () => createSeedPresetPayload(state.value, state.behavior),
		validatePresetValue: (entry) => validateSeedPresetEntry(entry, { min: 0, max: 100 }),
		applyPresetValue: (entry) => { const decoded = decodeSeedPresetEntry(entry, state.behavior); state.value = decoded.value; state.behavior = decoded.behavior; },
	});
	const fixed = snapshot(dashboard(seed), { [bindingKey(seed)]: { valueType: "number", payload: createSeedPresetPayload(11, "fixed") } });
	const random = snapshot(dashboard(seed), { [bindingKey(seed)]: { valueType: "number", payload: createSeedPresetPayload(22, "randomize") } });
	applyDashboardPresetPlan(planDashboardPresetApplication(fixed, resolveSeed));
	assert.deepEqual(state, { value: 11, behavior: "fixed" });
	applyDashboardPresetPlan(planDashboardPresetApplication(random, resolveSeed));
	assert.deepEqual(state, { value: 22, behavior: "randomize" });
	applyDashboardPresetPlan(planDashboardPresetApplication(fixed, resolveSeed));
	assert.deepEqual(state, { value: 11, behavior: "fixed" });
});

test("third-party codec failures stay visible in preflight without breaking capture", () => {
	const vendor = binding("vendor", "string");
	const captured = captureDashboardValues(dashboard(vendor), () => ({ status: "ok", readPresetValue: () => { throw new Error("codec offline"); } }));
	assert.deepEqual(captured.values, {});
	assert.equal(captured.bindings[0].status, "error");
	assert.match(captured.bindings[0].error.message, /codec offline/);
	const preset = snapshot(dashboard(vendor), { [bindingKey(vendor)]: { valueType: "string", payload: "x" } });
	const plan = planDashboardPresetApplication(preset, () => ({ status: "ok", value: "old", validatePresetValue: () => { throw new Error("codec rejected"); } }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].status, "invalid");
	assert.equal(plan.issues[0].reason, "codec rejected");
});

test("value-only preset copy applies its dashboard and values without mutating the base snapshot", () => {
	const steps = binding("steps"); const targetLayout = dashboard(steps); const baseBefore = structuredClone(targetLayout); let currentLayout = dashboard(binding("current"));
	const writes = []; const plan = planDashboardPresetApplication(snapshot(targetLayout, { [bindingKey(steps)]: { valueType: "number", payload: 31 } }), () => ({
		status: "ok", value: 12, validatePresetValue: () => true, applyPresetValue: (saved) => writes.push(saved.payload),
	}));
	let committed = false;
	applyDashboardSnapshotPlan(plan, { readDashboard: () => currentLayout, writeDashboard: (next) => { currentLayout = next; }, commit: () => { committed = true; } });
	assert.deepEqual(writes, [31]);
	assert.equal(committed, true);
	assert.deepEqual(currentLayout, targetLayout);
	assert.deepEqual(targetLayout, baseBefore);
});

test("value-only preset copy rolls back values and current dashboard when persistence fails", () => {
	const steps = binding("steps"); let value = 12; let rolledBack = false; const originalLayout = dashboard(binding("current")); let currentLayout = originalLayout;
	const plan = planDashboardPresetApplication(snapshot(dashboard(steps), { [bindingKey(steps)]: { valueType: "number", payload: 31 } }), () => ({
		status: "ok", value, validatePresetValue: () => true, applyPresetValue: (saved) => { value = saved.payload; },
	}));
	assert.throws(() => applyDashboardSnapshotPlan(plan, {
		readDashboard: () => currentLayout,
		writeDashboard: (next) => { currentLayout = next; },
		commit: () => { throw new Error("preset state failed"); },
		rollbackCommit: () => { rolledBack = true; },
	}), /preset state failed/);
	assert.equal(value, 12);
	assert.deepEqual(currentLayout, originalLayout);
	assert.equal(rolledBack, true);
});

test("layout and values roll back together when a preset write fails", () => {
	const target = binding("target"); let currentValue = 1; let currentDashboard = dashboard(binding("old"));
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => currentValue, validatePresetValue: () => true,
		applyPresetValue(entry) { currentValue = entry.payload; if (entry.payload === 9) throw new Error("write failed"); },
	}));
	assert.throws(() => applyDashboardSnapshotPlan(plan, { readDashboard: () => currentDashboard, writeDashboard: (next) => { currentDashboard = next; } }), /write failed/);
	assert.equal(currentValue, 1);
	assert.equal(currentDashboard.pages[0].items[0].binding.controlId, "old");
});

test("explicit codec rejection rolls back earlier targets and the Dashboard layout", () => {
	const first = binding("first"); const second = binding("second"); let state = { first: 1, second: 2 }; let currentDashboard = dashboard(binding("old"));
	const plan = planDashboardPresetApplication(snapshot(dashboard(first, second), {
		[bindingKey(first)]: { valueType: "number", payload: 10 }, [bindingKey(second)]: { valueType: "number", payload: 20 },
	}), (candidate) => ({
		status: "ok", readPresetValue: () => state[candidate.controlId], validatePresetValue: () => true,
		applyPresetValue(entry) { state[candidate.controlId] = entry.payload; return candidate.controlId === "second" && entry.payload === 20 ? { ok: false, message: "manager conflict" } : true; },
	}));
	assert.throws(() => applyDashboardSnapshotPlan(plan, { readDashboard: () => currentDashboard, writeDashboard: (next) => { currentDashboard = next; } }), /manager conflict/);
	assert.deepEqual(state, { first: 1, second: 2 });
	assert.equal(currentDashboard.pages[0].items[0].binding.controlId, "old");
});

test("persistence commit failures roll back values, layout, and external preset state", () => {
	const target = binding("target"); let currentValue = 1; let currentDashboard = dashboard(binding("old")); let presetState = "before";
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => currentValue, validatePresetValue: () => true,
		applyPresetValue(entry) { currentValue = entry.payload; },
	}));
	assert.throws(() => applyDashboardSnapshotPlan(plan, {
		readDashboard: () => currentDashboard,
		writeDashboard: (next) => { currentDashboard = next; },
		commit: () => { presetState = "partial"; throw new Error("commit failed"); },
		rollbackCommit: () => { presetState = "before"; },
	}), /commit failed/);
	assert.equal(currentValue, 1);
	assert.equal(currentDashboard.pages[0].items[0].binding.controlId, "old");
	assert.equal(presetState, "before");
});
