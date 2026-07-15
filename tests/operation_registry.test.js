import test from "node:test";
import assert from "node:assert/strict";

import { getNodeAdapter, registerNodeAdapter, unregisterNodeAdapter } from "../js/lib/operation_registry.js";

test("adapter registration is versioned and rejects duplicates", () => {
	const adapter = { apiVersion: 1, render() {} };
	const dispose = registerNodeAdapter("TestNode", adapter);
	assert.equal(getNodeAdapter("TestNode")?.render, adapter.render);
	assert.throws(() => registerNodeAdapter("TestNode", adapter), /already registered/);
	dispose();
	assert.equal(getNodeAdapter("TestNode"), null);
});

test("adapter validation rejects unsupported versions", () => {
	assert.throws(() => registerNodeAdapter("BrokenNode", { apiVersion: 2 }), /apiVersion: 1/);
	assert.throws(() => registerNodeAdapter("BrokenTitle", { apiVersion: 1, title: 42 }), /title must be/);
	assert.throws(() => registerNodeAdapter("BrokenWidth", { apiVersion: 1, minWidth: 120 }), /minWidth must be/);
	assert.throws(() => registerNodeAdapter("BrokenResults", { apiVersion: 1, renderResults: true }), /renderResults must be/);
	assert.equal(unregisterNodeAdapter("MissingNode"), false);
});
