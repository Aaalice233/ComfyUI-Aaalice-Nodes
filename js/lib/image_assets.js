/** Public ComfyUI data sources used by the shared image asset picker. */

import { api } from "../../../scripts/api.js";
import { collectImageAssetCandidates } from "./image_asset_model.js";

async function fetchInputFiles() {
	const response = await fetch(api.internalURL("/files/input"), { headers: { "Comfy-User": api.user } });
	if (!response.ok) throw new Error(`GET /files/input: HTTP ${response.status}`);
	const payload = await response.json();
	return Array.isArray(payload) ? payload : [];
}

export async function loadImageAssets(options = {}) {
	const [inputs, history] = await Promise.allSettled([
		fetchInputFiles(),
		api.getHistory(200),
	]);
	const errors = [inputs, history].filter((result) => result.status === "rejected").map((result) => result.reason);
	return {
		assets: collectImageAssetCandidates({
			...options,
			inputFiles: inputs.status === "fulfilled" ? inputs.value : [],
			history: history.status === "fulfilled" ? history.value : {},
		}),
		errors,
	};
}
