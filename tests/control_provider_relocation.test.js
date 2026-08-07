import test from "node:test";
import assert from "node:assert/strict";
import { relocateOrphanedBinding } from "../js/lib/binding_relocation.js";

function fakeNode(hostId, acceptedControlId) {
	return { hostId, accepts: acceptedControlId };
}

const provider = {
	supportsNode: (node) => Boolean(node?.accepts),
	resolve: (node, binding) => binding.controlId === node.accepts
		? { status: "ok", node, controlId: binding.controlId }
		: { status: "missing", node },
};

const hostIdOf = (node) => node?.hostId || null;
const orphan = { provider: "test", hostId: "host_gone", controlId: "ctl-a", valueType: "string" };

test("relocateOrphanedBinding re-attaches to a unique replacement host", () => {
	const replacement = fakeNode("host_new", "ctl-a");
	const resolved = relocateOrphanedBinding({ provider, binding: orphan, nodes: [replacement, fakeNode("host_other", "ctl-b")], hostIdOf });
	assert.equal(resolved.status, "ok");
	assert.equal(resolved.node, replacement);
	assert.equal(resolved.relocatedHostId, "host_new");
});

test("relocateOrphanedBinding stays missing when several hosts can satisfy the binding", () => {
	const resolved = relocateOrphanedBinding({ provider, binding: orphan, nodes: [fakeNode("host_1", "ctl-a"), fakeNode("host_2", "ctl-a")], hostIdOf });
	assert.equal(resolved.status, "missing");
});

test("relocateOrphanedBinding stays missing when no host can satisfy the binding", () => {
	const resolved = relocateOrphanedBinding({ provider, binding: { ...orphan, controlId: "ctl-z" }, nodes: [fakeNode("host_1", "ctl-a")], hostIdOf });
	assert.equal(resolved.status, "missing");
});

test("relocateOrphanedBinding ignores candidates without a host identity or a throwing provider", () => {
	const throwing = { supportsNode: () => true, resolve: () => { throw new Error("boom"); } };
	assert.equal(relocateOrphanedBinding({ provider: throwing, binding: orphan, nodes: [fakeNode("host_1", "ctl-a")], hostIdOf }).status, "missing");
	const replacement = fakeNode("host_new", "ctl-a");
	const resolved = relocateOrphanedBinding({ provider, binding: orphan, nodes: [{ accepts: "ctl-a" }, replacement], hostIdOf });
	assert.equal(resolved.relocatedHostId, "host_new");
});
