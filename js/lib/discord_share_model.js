/** Pure state and execution-output projections for Discord sharing. */

export const SHARE_PLACEMENTS = Object.freeze(["sidebar", "topbar", "hidden"]);
export const DISCORD_SHARE_WORKFLOW_VERSION = 1;

export function normalizeSharePlacement(value) {
	return SHARE_PLACEMENTS.includes(value) ? value : "sidebar";
}

export function normalizePromptBinding(value) {
	if (!value || value.nodeId == null) return null;
	return {
		graphId: value.graphId == null ? "root" : String(value.graphId),
		nodeId: String(value.nodeId),
		label: String(value.label || ""),
	};
}

export function normalizeDiscordShareWorkflowState(value) {
	return {
		version: DISCORD_SHARE_WORKFLOW_VERSION,
		promptSource: normalizePromptBinding(value?.promptSource),
	};
}

export function normalizeImageReference(value) {
	if (!value || typeof value !== "object") return null;
	const filename = String(value.filename || "").trim();
	if (!filename) return null;
	return {
		filename,
		subfolder: String(value.subfolder || ""),
		type: String(value.type || "output"),
	};
}

export function imageReferenceKey(reference) {
	const normalized = normalizeImageReference(reference);
	return normalized ? `${normalized.type}\u0000${normalized.subfolder}\u0000${normalized.filename}` : "";
}

export function collectExecutionImages(outputs) {
	const result = [];
	const seen = new Set();
	for (const [executionId, output] of Object.entries(outputs || {})) {
		for (const candidate of Array.isArray(output?.images) ? output.images : []) {
			const reference = normalizeImageReference(candidate);
			const key = imageReferenceKey(reference);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			result.push({ ...reference, executionId: String(executionId) });
		}
	}
	return result;
}

export function textFromExecutionOutput(output) {
	const value = output?.text;
	if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n\n").trim();
	if (value == null) return "";
	return String(value).trim();
}

export function findPromptForBinding(outputs, binding, resolveNode) {
	if (!binding || typeof resolveNode !== "function") return "";
	let prompt = "";
	for (const [executionId, output] of Object.entries(outputs || {})) {
		const node = resolveNode(executionId);
		if (!node || String(node.id) !== String(binding.nodeId)) continue;
		const nodeGraphId = node.graph?.id == null ? "root" : String(node.graph.id);
		if (nodeGraphId !== String(binding.graphId || "root")) continue;
		const value = textFromExecutionOutput(output);
		if (value) prompt = value;
	}
	return prompt;
}

export function createShareSnapshot({
	promptId,
	outputs,
	promptBinding = null,
	resolveNode = null,
	completedAt = Date.now(),
} = {}) {
	const images = collectExecutionImages(outputs);
	const prompt = findPromptForBinding(outputs, promptBinding, resolveNode);
	return {
		promptId: String(promptId || ""),
		completedAt: Number(completedAt) || Date.now(),
		images,
		prompt,
		promptBinding: promptBinding ? {
			graphId: String(promptBinding.graphId || "root"),
			nodeId: String(promptBinding.nodeId),
			label: String(promptBinding.label || ""),
		} : null,
	};
}

export function escapeDiscordFence(value) {
	return String(value ?? "").replaceAll("```", "``\u200b`");
}

export function discordPromptBlock(value) {
	return `\`\`\`\n${escapeDiscordFence(value).trim()}\n\`\`\``;
}
