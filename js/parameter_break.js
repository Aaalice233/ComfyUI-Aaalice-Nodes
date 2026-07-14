/**
 * ParameterBreak — pin labels + rebind links by parameter id.
 */
import { app } from "../../scripts/app.js";
import {
	EVENT_PCP_CHANGED,
	ensureParameters,
	isTunable,
	listPcpNodes,
	loadParametersFromWidget,
	tunableMeta,
} from "./lib/param_model.js";

const MAX = 32;

function getLinkedPcp(node) {
	const input = node.inputs?.[0];
	if (!input || input.link == null) return null;
	const link = node.graph?.links?.[input.link];
	if (!link) return null;
	const origin = node.graph.getNodeById(link.origin_id);
	if (!origin) return null;
	if (origin.comfyClass === "ParameterControlPanel" || origin.type === "ParameterControlPanel") {
		return origin;
	}
	return null;
}

function readMetaFromPcp(pcp) {
	loadParametersFromWidget(pcp);
	return tunableMeta(ensureParameters(pcp));
}

function readMetaFromProperties(node) {
	const meta = node.properties?.slotMeta;
	return Array.isArray(meta) ? meta : [];
}

/**
 * Apply labels and rebind links when slot order of ids changes.
 * @param {LGraphNode} node
 * @param {Array<{id:string,name:string}>} newMeta
 */
function applyMeta(node, newMeta) {
	const prevMeta = readMetaFromProperties(node);
	const prevIds = prevMeta.map((m) => m.id);

	// Snapshot links by parameter id (output slot → link ids)
	/** @type {Map<string, number[]>} */
	const linksById = new Map();
	if (node.outputs) {
		for (let slot = 0; slot < Math.min(node.outputs.length, MAX); slot++) {
			const out = node.outputs[slot];
			const id = prevIds[slot];
			if (!id || !out?.links?.length) continue;
			linksById.set(id, [...out.links]);
		}
	}

	// Update stored meta + labels
	node.properties = node.properties || {};
	node.properties.slotMeta = newMeta.map((m, order) => ({
		id: m.id,
		name: m.name,
		order,
	}));

	if (node.outputs) {
		for (let i = 0; i < node.outputs.length; i++) {
			const out = node.outputs[i];
			if (!out) continue;
			if (i < newMeta.length) {
				out.label = newMeta[i].name;
				out.name = `output_${i + 1}`;
			} else {
				out.label = `Output ${i + 1}`;
			}
		}
	}

	// Rebind: disconnect old, reconnect by id to new slots
	if (!node.graph || linksById.size === 0) {
		node.setDirtyCanvas?.(true, true);
		return;
	}

	const graph = node.graph;
	const newIndexById = new Map(newMeta.map((m, i) => [m.id, i]));

	// Collect reconnections then rewire
	/** @type {Array<{linkId:number, targetId:number, targetSlot:number, newSlot:number}>} */
	const reconnect = [];

	for (const [pid, linkIds] of linksById.entries()) {
		const newSlot = newIndexById.get(pid);
		for (const linkId of linkIds) {
			const link = graph.links[linkId];
			if (!link) continue;
			const targetId = link.target_id;
			const targetSlot = link.target_slot;
			// Always disconnect old
			const target = graph.getNodeById(targetId);
			if (target) {
				target.disconnectInput?.(targetSlot);
			}
			if (newSlot != null) {
				reconnect.push({ targetId, targetSlot, newSlot });
			}
		}
	}

	for (const job of reconnect) {
		const target = graph.getNodeById(job.targetId);
		if (!target) continue;
		node.connect?.(job.newSlot, target, job.targetSlot);
	}

	graph.setDirtyCanvas?.(true, true);
}

function refreshBreak(node) {
	const pcp = getLinkedPcp(node);
	if (pcp) {
		applyMeta(node, readMetaFromPcp(pcp));
		return;
	}
	// Keep previous labels if disconnected
	const meta = readMetaFromProperties(node);
	if (meta.length && node.outputs) {
		for (let i = 0; i < node.outputs.length; i++) {
			if (i < meta.length) node.outputs[i].label = meta[i].name;
		}
	}
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterBreak",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "ParameterBreak") return;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const r = onNodeCreated?.apply(this, arguments);
			if (!this.properties) this.properties = {};
			if (!Array.isArray(this.properties.slotMeta)) {
				this.properties.slotMeta = [];
			}

			const origConn = this.onConnectionsChange;
			this.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
				const res = origConn?.apply(this, arguments);
				// input connection change
				if (type === 1 && slotIndex === 0) {
					setTimeout(() => refreshBreak(this), 0);
				}
				return res;
			};

			const onGlobal = (ev) => {
				const pcp = getLinkedPcp(this);
				if (!pcp) return;
				if (ev.detail?.nodeId != null && String(ev.detail.nodeId) !== String(pcp.id)) {
					return;
				}
				refreshBreak(this);
			};
			window.addEventListener(EVENT_PCP_CHANGED, onGlobal);

			const origRemoved = this.onRemoved;
			this.onRemoved = function () {
				window.removeEventListener(EVENT_PCP_CHANGED, onGlobal);
				return origRemoved?.apply(this, arguments);
			};

			const origConfigure = this.onConfigure;
			this.onConfigure = function () {
				const res = origConfigure?.apply(this, arguments);
				setTimeout(() => refreshBreak(this), 50);
				return res;
			};

			setTimeout(() => refreshBreak(this), 100);
			return r;
		};
	},
});

