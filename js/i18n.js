/**
 * 本包前端 i18n 辅助：供自绘 DOM / 侧栏 / toast 等读取 en|zh 文案。
 *
 * 节点标题、输入输出、官方 widget 文案由 ComfyUI 自动合并各语言的 `nodeDefs.json`，
 * 一般无需本模块。本模块只覆盖**不走 nodeDefs** 的自定义 UI。
 *
 * 数据来源：后端 `/api/i18n`（扫描各 custom_nodes 的 `locales/`）。
 * 语言：跟随 ComfyUI `Comfy.Locale`；仅解析 `en` / `zh`，其余回退 `en`。
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const FALLBACK_LOCALE = "en";

/** @type {Record<string, Record<string, unknown>> | null} */
let catalog = null;

/** @type {Promise<void> | null} */
let loadPromise = null;

/**
 * 将 ComfyUI 原始 locale 归一到本包支持的 `en` | `zh`。
 * @param {unknown} raw
 * @returns {"en" | "zh"}
 */
export function resolveLocale(raw) {
	if (typeof raw !== "string" || !raw) {
		return FALLBACK_LOCALE;
	}
	const lower = raw.toLowerCase().replace(/_/g, "-");
	// 简体：zh / zh-CN / zh-Hans …
	if (lower === "zh" || lower.startsWith("zh-cn") || lower.startsWith("zh-hans")) {
		return "zh";
	}
	// 明确英文
	if (lower === "en" || lower.startsWith("en-")) {
		return "en";
	}
	// zh-TW 等其它语言：按项目约定回退英文
	return FALLBACK_LOCALE;
}

/**
 * 读取当前 ComfyUI 界面语言并归一到 en|zh。
 * @returns {"en" | "zh"}
 */
export function getLocale() {
	try {
		const em = app.extensionManager;
		if (em?.setting?.get) {
			return resolveLocale(em.setting.get("Comfy.Locale"));
		}
	} catch {
		// ignore and try legacy path
	}
	try {
		// 部分旧前端仍走 app.ui.settings
		const legacy = app.ui?.settings?.getSettingValue?.("Comfy.Locale");
		if (legacy != null) {
			return resolveLocale(legacy);
		}
	} catch {
		// ignore
	}
	return FALLBACK_LOCALE;
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
 * - `aaalice.packageName`
 *
 * 查找顺序：当前语言 → `en` → `fallback` 参数 → key 本身。
 *
 * @param {string} key
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function t(key, fallback = "") {
	const locale = getLocale();
	const bags = [catalog?.[locale], catalog?.[FALLBACK_LOCALE]];
	for (const bag of bags) {
		const value = digString(bag, key);
		if (value !== undefined) {
			return value;
		}
	}
	return fallback || key;
}

