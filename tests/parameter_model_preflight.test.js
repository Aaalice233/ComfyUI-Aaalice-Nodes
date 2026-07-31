import assert from "node:assert/strict";
import test from "node:test";

import { allGraphNodes } from "../js/lib/graph_scope.js";
import {
	findParameterModelIssues,
	findParameterSourceIssues,
} from "../js/lib/parameter_model_preflight.js";

function panel(parameters, outputs) {
	return { properties: { parameters }, outputs };
}

function parameter(id, name, value, source = "checkpoint") {
	return {
		id,
		name,
		param_type: "dropdown",
		value,
		config: { source, options: [value] },
	};
}

function sourceAdapters(overrides = {}) {
	const adapters = {
		checkpoint: { id: "checkpoint", kind: "model", resolved: true },
		...overrides,
	};
	return {
		getSourceAdapter: (id) => adapters[id] || null,
		getSourceOptions: (id) => overrides[id]?.options || (id === "checkpoint" ? ["valid.safetensors"] : []),
	};
}

test("finds a missing model by stable Parameter Id across nested subgraphs", () => {
	const rootPanel = panel(
		[parameter("other", "Other", "valid.safetensors"), parameter("model", "Model", "old.safetensors")],
		[
			{ _aaaliceParamId: "other", links: [1] },
			{ _aaaliceParamId: "model", links: [] },
		],
	);
	const nestedPanel = panel(
		[parameter("nested", "Nested model", "old.safetensors")],
		[{ _aaaliceParamId: "nested", links: [2] }],
	);
	const child = { _nodes: [nestedPanel] };
	const root = { _nodes: [rootPanel, { subgraph: child }] };

	const issues = findParameterModelIssues(allGraphNodes(root), sourceAdapters());

	assert.deepEqual(issues.map(({ parameterId, status }) => ({ parameterId, status })), [
		{ parameterId: "model", status: "missing" },
		{ parameterId: "nested", status: "missing" },
	]);
});

test("does not report a valid model or an unconnected panel", () => {
	const valid = panel(
		[parameter("model", "Model", "valid.safetensors")],
		[{ _aaaliceParamId: "model", links: [1] }],
	);
	const disconnected = panel(
		[parameter("model", "Model", "old.safetensors")],
		[{ _aaaliceParamId: "model", links: [] }],
	);
	const options = sourceAdapters();

	assert.deepEqual(findParameterModelIssues([valid], options), []);
	assert.deepEqual(findParameterModelIssues([disconnected], options), []);
});

test("checks every emitted parameter by stable id when one panel has multiple links", () => {
	const node = panel(
		[
			parameter("second", "Second model", "valid.safetensors"),
			parameter("first", "First model", "missing.safetensors"),
		],
		[
			{ _aaaliceParamId: "second", links: [2] },
			{ _aaaliceParamId: "first", links: [1] },
		],
	);

	assert.deepEqual(findParameterModelIssues([node], sourceAdapters()).map(({ parameterId, status }) => ({ parameterId, status })), [
		{ parameterId: "first", status: "missing" },
	]);
});

test("distinguishes an empty source from an unresolved source", () => {
	const empty = panel(
		[parameter("empty", "Empty model source", "old.safetensors", "empty")],
		[{ _aaaliceParamId: "empty", links: [1] }],
	);
	const unresolved = panel(
		[parameter("unresolved", "Unresolved model source", "old.safetensors", "unresolved")],
		[{ _aaaliceParamId: "unresolved", links: [1] }],
	);
	const options = sourceAdapters({
		empty: { id: "empty", kind: "model", resolved: true, options: [] },
		unresolved: { id: "unresolved", kind: "model", resolved: false },
	});

	assert.equal(findParameterModelIssues([empty], options)[0].status, "source_unavailable");
	assert.equal(findParameterModelIssues([unresolved], options)[0].status, "source_unverified");
});

test("ignores non-model sources even when their values are absent", () => {
	const node = panel(
		[parameter("rule", "Rule", "removed-rule", "prompt_expand_rule")],
		[{ _aaaliceParamId: "rule", links: [1] }],
	);
	const options = sourceAdapters({
		prompt_expand_rule: { id: "prompt_expand_rule", kind: "rule", resolved: true, options: [] },
	});

	assert.deepEqual(findParameterModelIssues([node], options), []);
});

test("generic source preflight can be extended to service and rule kinds", () => {
	const node = panel(
		[parameter("service", "LLM service", "removed-service", "prompt_llm_service")],
		[{ _aaaliceParamId: "service", links: [1] }],
	);
	const options = sourceAdapters({
		prompt_llm_service: { id: "prompt_llm_service", kind: "service", resolved: true, options: ["configured-service"] },
	});

	assert.equal(findParameterSourceIssues([node], { ...options, kinds: ["service"] })[0].status, "missing");
	assert.deepEqual(findParameterModelIssues([node], options), []);
});
