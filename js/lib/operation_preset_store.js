/** Operation page value presets persisted through ComfyUI's user-data API. */
import { api } from "../../../scripts/api.js";

const FILE = "aaalice-operation-presets.json";
const VERSION = 2;

function endpoint(query = "") {
	return `/userdata/${encodeURIComponent(FILE)}${query}`;
}

export async function loadOperationPresets() {
	const response = await api.fetchApi(endpoint());
	if (response.status === 404) return { version: VERSION, presets: [] };
	if (!response.ok) throw new Error(`Unable to read Operation presets: HTTP ${response.status}`);
	const data = await response.json();
	if (!data || data.version !== VERSION || !Array.isArray(data.presets)) throw new Error("Operation preset store has an unsupported format");
	return data;
}

async function writeStore(store) {
	const response = await api.fetchApi(endpoint("?overwrite=true"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(store, null, 2),
	});
	if (!response.ok) throw new Error(`Unable to save Operation presets: HTTP ${response.status}`);
}

export async function saveOperationPreset(preset) {
	const store = await loadOperationPresets();
	const key = String(preset.name).trim().toLocaleLowerCase();
	const index = store.presets.findIndex((item) => String(item.name).trim().toLocaleLowerCase() === key);
	const next = { ...preset, version: VERSION, updatedAt: new Date().toISOString() };
	if (index >= 0) store.presets[index] = next;
	else store.presets.push(next);
	await writeStore(store);
	return next;
}

export async function deleteOperationPreset(name) {
	const store = await loadOperationPresets();
	const key = String(name).trim().toLocaleLowerCase();
	store.presets = store.presets.filter((item) => String(item.name).trim().toLocaleLowerCase() !== key);
	await writeStore(store);
}
