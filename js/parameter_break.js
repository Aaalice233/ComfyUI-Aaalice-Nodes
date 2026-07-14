/** ParameterBreak pin labels and link rebinding by parameter id. */
import { app } from "../../scripts/app.js";
import { EVENT_PARAMETER_CHANGED, ensureParameters, isParameterPanel, tunableMeta } from "./lib/param_model.js";

const MAX = 32;

function linkedPanel(node) {
	const input = node.inputs?.[0];
	if (!input || input.link == null) return null;
	const link = node.graph?.links?.[input.link];
	const origin = link ? node.graph?.getNodeById?.(link.origin_id) : null;
	return origin && isParameterPanel(origin) && link.origin_slot === 0 ? origin : null;
}

function storedMeta(node) {
	return Array.isArray(node.properties?.slotMeta) ? node.properties.slotMeta : [];
}

function applyMeta(node, nextMeta) {
	const previous = storedMeta(node);
	const linksById = new Map();
	for (let slot = 0; slot < Math.min(node.outputs?.length || 0, MAX); slot += 1) {
		const id = previous[slot]?.id;
		const links = node.outputs?.[slot]?.links;
		if (id && links?.length) linksById.set(id, [...links]);
	}
	node.properties ||= {};
	node.properties.slotMeta = nextMeta.map((item, order) => ({ id: item.id, name: item.name, order }));
	for (let index = 0; index < (node.outputs?.length || 0); index += 1) {
		const output = node.outputs[index];
		const meta = nextMeta[index];
		output.name = `output_${index + 1}`;
		output.label = meta?.name || `Output ${index + 1}`;
		if (meta) output._aaaliceParamId = meta.id;
		else delete output._aaaliceParamId;
	}
	if (!node.graph || !linksById.size) {
		node.setDirtyCanvas?.(true, true);
		return;
	}
	const slotById = new Map(nextMeta.map((item, index) => [item.id, index]));
	const reconnect = [];
	for (const [id, linkIds] of linksById) {
		for (const linkId of linkIds) {
			const link = node.graph.links?.[linkId];
			if (!link) continue;
			const target = node.graph.getNodeById?.(link.target_id);
			target?.disconnectInput?.(link.target_slot);
			if (slotById.has(id)) reconnect.push({ target, targetSlot: link.target_slot, outputSlot: slotById.get(id) });
		}
	}
	for (const job of reconnect) if (job.target) node.connect?.(job.outputSlot, job.target, job.targetSlot);
	node.graph.setDirtyCanvas?.(true, true);
}

function refreshBreak(node) {
	const source = linkedPanel(node);
	if (source) applyMeta(node, tunableMeta(ensureParameters(source)));
	else for (let index = 0; index < (node.outputs?.length || 0); index += 1) {
		if (storedMeta(node)[index]) node.outputs[index].label = storedMeta(node)[index].name;
	}
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterBreak",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "ParameterBreak") return;
		const previousCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = previousCreated?.apply(this, arguments);
			this.properties ||= {};
			this.properties.slotMeta ||= [];
			const previousConnections = this.onConnectionsChange;
			this.onConnectionsChange = function (type, slotIndex) {
				const value = previousConnections?.apply(this, arguments);
				if (type === 1 && slotIndex === 0) setTimeout(() => refreshBreak(this), 0);
				return value;
			};
			const onParameterChange = (event) => {
				const source = linkedPanel(this);
				if (source && (event.detail?.nodeId == null || String(event.detail.nodeId) === String(source.id))) refreshBreak(this);
			};
			window.addEventListener(EVENT_PARAMETER_CHANGED, onParameterChange);
			const previousRemoved = this.onRemoved;
			this.onRemoved = function () {
				window.removeEventListener(EVENT_PARAMETER_CHANGED, onParameterChange);
				return previousRemoved?.apply(this, arguments);
			};
			const previousConfigure = this.onConfigure;
			this.onConfigure = function () {
				const value = previousConfigure?.apply(this, arguments);
				setTimeout(() => refreshBreak(this), 50);
				return value;
			};
			setTimeout(() => refreshBreak(this), 100);
			return result;
		};
	},
});
