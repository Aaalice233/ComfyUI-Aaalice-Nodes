/**
 * 画廊标签汉化桥：复用 Autocomplete-Plus 扩展的三层翻译管线
 * （ffdkj 词典 → AI 缓存 → DeepSeek 在线翻译），通过其 NDJSON 流式接口
 * 增量返回结果。扩展未安装或接口不可用时静默停用当前会话的汉化，
 * 不打断画廊本身的功能。
 */
import { api } from "../../../scripts/api.js";

const RESOLVE_STREAM_URL = "/autocomplete-plus/translation/resolve-stream";

// 翻译管线使用 Danbooru 数字分类；artist(1) 为人名，服务端本就跳过翻译。
const CATEGORY_CODES = { general: 0, artist: 1, copyright: 3, character: 4, meta: 5 };

let available = true;
const sessionCache = new Map();

function cacheKey(locale, name) { return `${locale}${name}`; }

/**
 * 流式翻译一组标签。
 * @param {object} options
 * @param {string} options.locale 目标语言（翻译管线支持 zh / zh-TW / ja / en）。
 * @param {Array<{name: string, category: string}>} options.tags 画廊分类字符串标签。
 * @param {AbortSignal} [options.signal] 中止后不再回调，也不污染会话缓存。
 * @param {(chunk: {translations: Record<string, string>, completed: string[]}) => void} options.onChunk
 */
export async function streamTagTranslations({ locale, tags, signal, onChunk } = {}) {
	if (!available || !locale || !Array.isArray(tags) || !tags.length) return;
	const pending = [];
	const seen = new Set();
	const cachedTranslations = {};
	const cachedCompleted = [];
	for (const tag of tags) {
		const name = String(tag?.name || "").trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const key = cacheKey(locale, name);
		if (sessionCache.has(key)) {
			cachedCompleted.push(name);
			const text = sessionCache.get(key);
			if (text) cachedTranslations[name] = text;
		} else {
			pending.push({ name, category: CATEGORY_CODES[tag.category] ?? 0 });
		}
	}
	const emit = (chunk) => { if (!signal?.aborted) onChunk?.(chunk); };
	if (cachedCompleted.length) emit({ translations: cachedTranslations, completed: cachedCompleted });
	if (!pending.length) return;

	let response;
	try {
		response = await api.fetchApi(RESOLVE_STREAM_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ locale, tags: pending }),
			signal,
		});
	} catch (error) {
		// AbortError 之外的失败说明扩展未安装或网络层不可达，本会话不再重试。
		if (error?.name !== "AbortError") available = false;
		return;
	}
	if (response.status === 404) { available = false; return; }
	if (!response.ok || !response.body) return;

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newline;
			while ((newline = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				if (!line) continue;
				let chunk;
				try { chunk = JSON.parse(line); } catch { continue; }
				if (signal?.aborted) return;
				if (chunk.done) return;
				const translations = chunk.translations && typeof chunk.translations === "object" ? chunk.translations : {};
				const completed = Array.isArray(chunk.completed) ? chunk.completed : Object.keys(translations);
				for (const name of completed) sessionCache.set(cacheKey(locale, name), translations[name] || null);
				emit({ translations, completed });
			}
		}
	} catch (error) {
		if (error?.name !== "AbortError") console.warn("[Aaalice] Gallery tag translation stream failed", error);
	}
}
