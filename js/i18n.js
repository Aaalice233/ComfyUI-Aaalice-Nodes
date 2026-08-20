/**
 * 本包前端 i18n 辅助：供自绘 DOM / 侧栏 / toast 等读取 en|zh|zh-TW 文案。
 *
 * 节点标题、输入输出、官方 widget 文案由 ComfyUI 自动合并各语言的 `nodeDefs.json`，
 * 一般无需本模块。本模块只覆盖**不走 nodeDefs** 的自定义 UI。
 *
 * 数据来源：后端 `/api/i18n`（扫描各 custom_nodes 的 `locales/`）。
 * 语言：跟随 ComfyUI `Comfy.Locale`；支持 `en` / `zh` / `zh-TW`，其余回退 `en`。
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { localeFallbackChain, resolveLocale } from "./lib/i18n_locale.js";

/** @type {Record<string, Record<string, unknown>> | null} */
let catalog = null;

/** @type {Promise<void> | null} */
let loadPromise = null;

/**
 * 读取当前 ComfyUI 界面语言并归一到 en|zh|zh-TW。
 * @returns {"en" | "zh" | "zh-TW"}
 */
function getLocale() {
	return resolveLocale(app.extensionManager?.setting?.get?.("Comfy.Locale"));
}

/** 当前界面语言（en|zh|zh-TW），供自绘 UI 做语言相关的能力开关。 */
export function currentLocale() {
	return getLocale();
}

/**
 * 按点分路径取值；仅返回字符串，否则 undefined。
 * @param {unknown} root
 * @param {string} path
 * @returns {string | undefined}
 */
function digString(root, path) {
	if (root == null || typeof path !== "string" || !path) {
		return undefined;
	}
	const parts = path.split(".");
	let cur = root;
	for (const part of parts) {
		if (cur == null || typeof cur !== "object") {
			return undefined;
		}
		cur = /** @type {Record<string, unknown>} */ (cur)[part];
	}
	return typeof cur === "string" ? cur : undefined;
}

/**
 * 拉取并缓存全部 custom node 的 i18n 目录（含本包 locales）。
 * 可安全重复调用。
 * @returns {Promise<void>}
 */
export function ensureI18nReady() {
	if (catalog) {
		return Promise.resolve();
	}
	if (!loadPromise) {
		loadPromise = (async () => {
			try {
				if (typeof api.getCustomNodesI18n === "function") {
					catalog = await api.getCustomNodesI18n();
				} else {
					const res = await api.fetchApi("/i18n");
					if (!res.ok) {
						throw new Error(`/i18n HTTP ${res.status}`);
					}
					catalog = await res.json();
				}
			} catch (err) {
				console.warn("[Aaalice] i18n catalog load failed; using empty bag", err);
				catalog = {};
			}
		})();
	}
	return loadPromise;
}

/**
 * 同步翻译。须先 `await ensureI18nReady()`，否则在缓存未就绪时只会走 fallback。
 *
 * key 对应 `locales/{lang}/main.json` 合并后的路径，例如：
 * - `aaalice.common.confirm`
 *
 * 查找顺序：当前语言 → 简体中文（仅繁中）→ `en` → `fallback` 参数 → key 本身。
 *
 * @param {string} key
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function t(key, fallback = "") {
	const bags = localeFallbackChain(getLocale()).map((language) => catalog?.[language]);
	for (const bag of bags) {
		const value = digString(bag, key);
		if (value !== undefined) {
			return value;
		}
	}
	return fallback || key;
}

