/** Local actions shared by the sidebar LoRA stack context menu. */

import { t } from "../i18n.js";

let apiModulePromise = null;
let appModulePromise = null;

function getApi() {
	if (!apiModulePromise) apiModulePromise = import("../../../scripts/api.js").then(({ api }) => api);
	return apiModulePromise;
}

function getApp() {
	if (!appModulePromise) appModulePromise = import("../../../scripts/app.js").then(({ app }) => app);
	return appModulePromise;
}

function label(key, fallback) {
	return t(`aaalice.loraList.${key}`, fallback);
}

async function notify(severity, summaryKey, summaryFallback, detailKey, detailFallback) {
	try {
		const app = await getApp();
		app.extensionManager?.toast?.add?.({
			severity,
			summary: label(`toast.${summaryKey}`, summaryFallback),
			detail: label(`toast.${detailKey}`, detailFallback),
			life: severity === "error" ? 5200 : 3200,
		});
	} catch (error) {
		console.error("[Aaalice] LoRA action notification failed:", error);
	}
}

async function requestJson(path, options = {}, failureFallback) {
	const api = await getApi();
	const response = await api.fetchApi(path, options);
	const text = await response.text();
	let payload = null;
	try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
	if (!response.ok) throw new Error(payload?.error || text || failureFallback);
	return payload || {};
}

async function copyText(text, successDetail) {
	if (navigator.clipboard && window.isSecureContext) {
		await navigator.clipboard.writeText(text);
	} else {
		const input = document.createElement("textarea");
		input.value = text;
		input.setAttribute("readonly", "");
		input.style.position = "fixed";
		input.style.opacity = "0";
		document.body.append(input);
		input.select();
		const copied = document.execCommand("copy");
		input.remove();
		if (!copied) throw new Error(label("toast.copyFailedDetail", "The clipboard rejected the copy operation."));
	}
	await notify("success", "success", "Copied", "copySuccessDetail", successDetail);
}

async function runAction(action) {
	try {
		await action();
	} catch (error) {
		console.error("[Aaalice] LoRA action failed:", error);
		await notify("error", "error", "LoRA action failed", "actionFailedDetail", String(error?.message || error));
	}
}

export function openLoraManager() {
	window.open(`${window.location.origin}/loras`, "_blank", "noopener,noreferrer");
}

export function openLoraCivitai(name) {
	return runAction(async () => {
		const payload = await requestJson(`/lm/loras/civitai-url?name=${encodeURIComponent(name)}`, {}, label("toast.civitaiFailed", "Could not find the Civitai link."));
		if (payload.success && payload.civitai_url) {
			window.open(payload.civitai_url, "_blank", "noopener,noreferrer");
			return;
		}
		await notify("warn", "warning", "LoRA link unavailable", "civitaiUnavailable", "This LoRA has no associated Civitai page.");
	});
}

export function copyLoraNotes(name) {
	return runAction(async () => {
		const payload = await requestJson(`/lm/loras/get-notes?name=${encodeURIComponent(name)}`, {}, label("toast.notesFailed", "Could not read LoRA notes."));
		const notes = String(payload.notes || "").trim();
		if (!payload.success || !notes) {
			await notify("info", "info", "Nothing to copy", "notesUnavailable", "This LoRA has no notes.");
			return;
		}
		await copyText(notes, label("toast.notesCopiedDetail", "LoRA notes copied to the clipboard."));
	});
}

export function copyLoraTriggerWords(name) {
	return runAction(async () => {
		const payload = await requestJson(`/lm/loras/get-trigger-words?name=${encodeURIComponent(name)}`, {}, label("toast.triggerWordsFailed", "Could not read LoRA trigger words."));
		const words = Array.isArray(payload.trigger_words) ? payload.trigger_words.filter(Boolean).join(", ") : String(payload.trigger_words || "").trim();
		if (!payload.success || !words) {
			await notify("info", "info", "Nothing to copy", "triggerWordsUnavailable", "This LoRA has no trigger words.");
			return;
		}
		await copyText(words, label("toast.triggerWordsCopiedDetail", "LoRA trigger words copied to the clipboard."));
	});
}

export function saveLoraRecipe() {
	return runAction(async () => {
		const app = await getApp();
		await app.graphToPrompt?.();
		const payload = await requestJson("/api/lm/recipes/save-from-widget", { method: "POST" }, label("toast.recipeFailed", "Could not save the recipe."));
		if (!payload.success) throw new Error(payload.error || label("toast.recipeFailed", "Could not save the recipe."));
		await notify("success", "success", "Recipe saved", "recipeSaved", "The current workflow recipe was saved.");
	});
}
