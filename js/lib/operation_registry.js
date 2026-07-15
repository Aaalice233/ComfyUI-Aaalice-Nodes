/** Public, versioned node-card adapter registry. */
import { renderSafeMarkdown } from "./safe_markdown.js";

const adapters = new Map();
const components = Object.freeze({
	field({ label, control }) {
		const row = document.createElement("label");
		row.className = "aaalice-operation-row";
		const copy = document.createElement("span");
		copy.className = "aaalice-operation-label";
		copy.textContent = String(label || "");
		row.append(copy, control);
		return row;
	},
	text(value, className = "") {
		const element = document.createElement("p");
		element.className = className;
		element.textContent = String(value || "");
		return element;
	},
	image(source, alt = "") {
		const element = document.createElement("img");
		element.src = String(source || "");
		element.alt = String(alt || "");
		return element;
	},
	markdown(value) {
		return renderSafeMarkdown(String(value || ""));
	},
});

function validateAdapter(nodeType, adapter) {
	if (!nodeType || typeof nodeType !== "string") throw new Error("Operation adapter nodeType must be a non-empty string");
	if (!adapter || adapter.apiVersion !== 1) throw new Error(`Operation adapter ${nodeType} must declare apiVersion: 1`);
	if (adapter.title != null && typeof adapter.title !== "string" && typeof adapter.title !== "function") throw new Error(`Operation adapter ${nodeType} title must be a string or function`);
	if (adapter.minWidth != null && (!Number.isFinite(Number(adapter.minWidth)) || Number(adapter.minWidth) < 240)) throw new Error(`Operation adapter ${nodeType} minWidth must be at least 240`);
	if (adapter.render && typeof adapter.render !== "function") throw new Error(`Operation adapter ${nodeType} render must be a function`);
	if (adapter.renderControls && typeof adapter.renderControls !== "function") throw new Error(`Operation adapter ${nodeType} renderControls must be a function`);
	if (adapter.renderResults && typeof adapter.renderResults !== "function") throw new Error(`Operation adapter ${nodeType} renderResults must be a function`);
	if (adapter.getPresetControls && typeof adapter.getPresetControls !== "function") throw new Error(`Operation adapter ${nodeType} getPresetControls must be a function`);
}

export function registerNodeAdapter(nodeType, adapter) {
	validateAdapter(nodeType, adapter);
	if (adapters.has(nodeType)) throw new Error(`Operation adapter already registered for ${nodeType}`);
	adapters.set(nodeType, Object.freeze({ ...adapter }));
	return () => unregisterNodeAdapter(nodeType, adapter);
}

export function unregisterNodeAdapter(nodeType, adapter = null) {
	const current = adapters.get(nodeType);
	if (!current) return false;
	if (adapter && current !== adapter && current.render !== adapter.render) return false;
	adapters.delete(nodeType);
	return true;
}

export function getNodeAdapter(nodeType) {
	return adapters.get(nodeType) || null;
}

export function installOperationPanelApi(onChanged = null) {
	const api = Object.freeze({
		apiVersion: 1,
		components,
		registerNodeAdapter(nodeType, adapter) {
			const dispose = registerNodeAdapter(nodeType, adapter);
			onChanged?.();
			return () => { dispose(); onChanged?.(); };
		},
		unregisterNodeAdapter(nodeType) {
			const removed = unregisterNodeAdapter(nodeType);
			if (removed) onChanged?.();
			return removed;
		},
	});
	globalThis.aaaliceOperationPanel = Object.freeze({ v1: api });
	return api;
}
