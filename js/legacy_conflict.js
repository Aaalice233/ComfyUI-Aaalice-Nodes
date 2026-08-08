/** Warn once when the legacy ComfyUI-Danbooru-Gallery package is installed alongside this one. */

import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";

// 旧版包的前端扩展统一使用 "danbooru.*" 名称（如 danbooru.GroupIsEnabled）；
// 两者注册相同节点 ID，共存会产生重复控件和不可预期行为。
const LEGACY_EXTENSION_NAME = /^danbooru\./i;
const LEGACY_PACKAGE_PATH = "ComfyUI-Danbooru-Gallery";

function legacyExtensionRegistered() {
	return (app.extensions || []).some((extension) => LEGACY_EXTENSION_NAME.test(String(extension?.name || "")));
}

async function legacyPackageServed() {
	try {
		const list = await app.api.getExtensions();
		return Array.isArray(list) && list.some((url) => String(url).includes(LEGACY_PACKAGE_PATH));
	} catch {
		return false;
	}
}

export async function warnIfLegacyPackageConflict() {
	if (!legacyExtensionRegistered() && !await legacyPackageServed()) return;
	console.error("[Aaalice] ComfyUI-Danbooru-Gallery is installed alongside ComfyUI-Aaalice-Nodes; both register the same node IDs. Keep only one of them.");
	app.extensionManager?.toast?.add?.({
		severity: "error",
		summary: t("aaalice.legacyConflict.title", "Conflicting legacy package detected"),
		detail: t("aaalice.legacyConflict.detail", "ComfyUI-Danbooru-Gallery is installed alongside ComfyUI-Aaalice-Nodes. Both register the same node IDs, which produces duplicate widgets and unpredictable behavior. Keep only one of them, then restart ComfyUI."),
		life: 12000,
	});
}
