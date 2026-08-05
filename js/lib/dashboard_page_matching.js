/** Select a sidebar page from the node and visual-group labels used by an add-controls action. */

const PAGE_SUFFIX = /(?:参数|控件|页面|controls?|page)$/iu;
const SOURCE_PREFIX = /^(?:set|get|node)/iu;

function compact(value) {
	return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function variants(value, page = false) {
	const text = compact(value); if (!text) return [];
	const result = [text];
	const source = text.replace(SOURCE_PREFIX, ""); if (source && source !== text) result.push(source);
	if (page) {
		const core = text.replace(PAGE_SUFFIX, ""); if (core && core !== text) result.push(core);
	}
	return [...new Set(result)];
}

function longestCommonSubstring(left, right) {
	let best = 0; const previous = new Array(right.length + 1).fill(0);
	for (let index = 0; index < left.length; index++) {
		const current = new Array(right.length + 1).fill(0);
		for (let other = 0; other < right.length; other++) {
			if (left[index] !== right[other]) continue;
			current[other + 1] = previous[other] + 1; best = Math.max(best, current[other + 1]);
		}
		for (let other = 0; other <= right.length; other++) previous[other] = current[other];
	}
	return best;
}

function labelScore(sourceLabel, pageName) {
	let best = 0;
	for (const source of variants(sourceLabel)) for (const target of variants(pageName, true)) {
		if (source === target) { best = Math.max(best, 1000); continue; }
		const shorter = Math.min(source.length, target.length); const longer = Math.max(source.length, target.length);
		if (shorter < 3 && !source.startsWith(target)) continue;
		if (source.includes(target) || target.includes(source)) {
			best = Math.max(best, 760 + Math.round((shorter / longer) * 190)); continue;
		}
		const common = longestCommonSubstring(source, target);
		if (common < 3 || common / shorter < 0.75) continue;
		best = Math.max(best, 560 + Math.round((common / longer) * 130));
	}
	return best;
}

function iterableItems(value) {
	if (Array.isArray(value)) return value;
	if (value && typeof value[Symbol.iterator] === "function") return [...value];
	return [];
}

function isGroup(value) {
	return typeof value?.recomputeInsideNodes === "function";
}

function groupContainsNode(group, node, visited = new Set(), refreshed = new Set()) {
	if (!group || visited.has(group)) return false;
	visited.add(group);
	if (!refreshed.has(group)) {
		refreshed.add(group);
		try {
			group.recomputeInsideNodes?.();
		} catch (error) {
			console.error("[Aaalice] Could not refresh group members for page matching", group, error);
		}
	}
	const members = [...new Set([
		...iterableItems(group.nodes), ...iterableItems(group._nodes),
		...iterableItems(group.children), ...iterableItems(group._children),
	])];
	return members.includes(node) || members.some((member) => isGroup(member) && groupContainsNode(member, node, visited, refreshed));
}

export function dashboardPageMatchLabels(node) {
	const title = typeof node?.getTitle === "function" ? node.getTitle() : node?.title;
	const labels = [title, node?.title];
	const groups = node?.graph?._groups || node?.graph?.groups || [];
	const refreshed = new Set();
	for (const group of groups) if (groupContainsNode(group, node, new Set(), refreshed)) labels.push(group.title);
	return [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))];
}

export function preferredDashboardPage(pages, sourceLabels, fallbackId = null) {
	const candidates = Array.isArray(pages) ? pages : [];
	let best = null; let bestScore = 0;
	for (const page of candidates) {
		const score = Math.max(0, ...(sourceLabels || []).map((label) => labelScore(label, page?.name)));
		if (score > bestScore) {
			best = { page, score }; bestScore = score;
		}
	}
	if (best && best.score >= 700) return best.page;
	return candidates.find((page) => String(page?.id) === String(fallbackId)) || candidates[0] || null;
}

export function dashboardPageMatchScore(sourceLabel, pageName) {
	return labelScore(sourceLabel, pageName);
}
