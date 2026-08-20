/** Warn when installed frontend packages are known to break Aaalice Nodes behavior. */

import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";

const INCOMPATIBLE_PLUGINS = [
	{
		id: "legacyGallery",
		extensionName: /^danbooru\./i,
		packagePath: "ComfyUI-Danbooru-Gallery",
		severity: "error",
		fallbackTitle: "Conflicting legacy package detected",
		fallbackDetail: "ComfyUI-Danbooru-Gallery is installed alongside ComfyUI-Aaalice-Nodes. Both register the same node IDs, which produces duplicate widgets and unpredictable behavior. Keep only one of them, then restart ComfyUI.",
	},
	{
		id: "translation",
		extensionName: /AIGODLIKE[._-].*COMFYUI[._-].*TRANSLATION/i,
		packagePath: "AIGODLIKE-COMFYUI-TRANSLATION",
		severity: "warn",
		fallbackTitle: "Incompatible translation plugin detected",
		fallbackDetail: "AIGODLIKE-COMFYUI-TRANSLATION overwrites custom Subgraph parameter names and can scramble sidebar component labels. Remove it, restart ComfyUI, then reopen a clean copy of the workflow; names saved while it was active may not recover automatically.",
	},
];

function extensionRegistered(plugin) {
	return (app.extensions || []).some((extension) => plugin.extensionName.test(String(extension?.name || "")));
}

async function servedExtensionUrls() {
	try {
		const list = await app.api.getExtensions();
		return Array.isArray(list) ? list.map(String) : [];
	} catch (error) {
		console.warn("[Aaalice] Could not inspect installed frontend extensions for incompatible plugins.", error);
		return [];
	}
}

function packageServed(plugin, extensionUrls) {
	const path = plugin.packagePath.toLowerCase();
	return extensionUrls.some((url) => url.toLowerCase().includes(path));
}

export async function warnIfIncompatiblePlugins() {
	const extensionUrls = await servedExtensionUrls();
	for (const plugin of INCOMPATIBLE_PLUGINS) {
		if (!extensionRegistered(plugin) && !packageServed(plugin, extensionUrls)) continue;
		console.error(`[Aaalice] Incompatible plugin detected: ${plugin.packagePath}`);
		app.extensionManager?.toast?.add?.({
			severity: plugin.severity,
			summary: t(`aaalice.incompatiblePlugins.${plugin.id}.title`, plugin.fallbackTitle),
			detail: t(`aaalice.incompatiblePlugins.${plugin.id}.detail`, plugin.fallbackDetail),
			life: 16000,
		});
	}
}
