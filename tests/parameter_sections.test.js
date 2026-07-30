import test from "node:test";
import assert from "node:assert/strict";

import { partitionParameterSections } from "../js/lib/parameter_sections.js";

const parameter = (id, paramType = "slider") => ({ id, name: id, param_type: paramType });

test("parameter sections preserve tunable order around stable separators", () => {
	const first = parameter("section-sampling", "separator");
	const second = parameter("section-output", "separator");
	const sections = partitionParameterSections([
		parameter("steps"),
		parameter("cfg"),
		first,
		parameter("sampler", "dropdown"),
		second,
		parameter("width"),
		parameter("height"),
	]);
	assert.deepEqual(sections.map((section) => ({
		separatorId: section.separator?.id || null,
		parameterIds: section.parameters.map((item) => item.id),
	})), [
		{ separatorId: null, parameterIds: ["steps", "cfg"] },
		{ separatorId: "section-sampling", parameterIds: ["sampler"] },
		{ separatorId: "section-output", parameterIds: ["width", "height"] },
	]);
	assert.equal(sections[1].separator, first);
	assert.equal(sections[2].separator, second);
});

test("empty sections from leading consecutive or trailing separators are omitted", () => {
	const sections = partitionParameterSections([
		parameter("leading", "separator"),
		parameter("replacement", "separator"),
		parameter("only"),
		parameter("trailing", "separator"),
	]);
	assert.deepEqual(sections.map((section) => ({
		separatorId: section.separator?.id || null,
		parameterIds: section.parameters.map((item) => item.id),
	})), [
		{ separatorId: "replacement", parameterIds: ["only"] },
	]);
});

test("a panel without separators remains one root section", () => {
	const sections = partitionParameterSections([parameter("steps"), parameter("cfg")]);
	assert.equal(sections.length, 1);
	assert.equal(sections[0].separator, null);
	assert.deepEqual(sections[0].parameters.map((item) => item.id), ["steps", "cfg"]);
});
