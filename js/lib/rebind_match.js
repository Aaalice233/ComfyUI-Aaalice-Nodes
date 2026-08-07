/** Pure label-scoring helpers for rebind candidate matching. No ComfyUI runtime dependencies. */

function normalizeLabel(label) {
	return String(label || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function bindingLabelScore(sourceLabel, targetLabel) {
	const source = normalizeLabel(sourceLabel);
	const target = normalizeLabel(targetLabel);
	if (!source || !target) return 0;
	if (source === target) return 1000;
	const shorter = Math.min(source.length, target.length); const longer = Math.max(source.length, target.length);
	if (shorter < 2 || !(source.includes(target) || target.includes(source))) return 0;
	return 700 + Math.round((shorter / longer) * 200);
}

/**
 * 从候选参数中选出失效卡片的最佳重绑目标。
 * candidates: [{ title, description?, identityLabel? }]（description 为节点标题，identityLabel 为候选自身的控件身份）。
 * 返回 { index, score, exact }；exact 表示唯一满分（归一化后完全一致）。无任何正向匹配时返回 null。
 * 主分相同时用节点标题得分消歧：多个同名参数（如多个 seed）应优先落在原节点上。
 */
export function bestRebindMatch({ preferredLabel = "", identityLabel = "" } = {}, candidates = []) {
	let best = null; let exactCount = 0;
	for (const [index, candidate] of candidates.entries()) {
		const score = Math.max(
			bindingLabelScore(preferredLabel, candidate.title),
			bindingLabelScore(identityLabel, candidate.title),
			bindingLabelScore(identityLabel, candidate.identityLabel),
		);
		if (score === 1000) exactCount += 1;
		const nodeScore = Math.max(
			bindingLabelScore(preferredLabel, candidate.description),
			bindingLabelScore(identityLabel, candidate.description),
		);
		if (!best || score > best.score || (score === best.score && score > 0 && nodeScore > best.nodeScore)) {
			best = { index, score, nodeScore };
		}
	}
	if (!best || best.score <= 0) return null;
	return { index: best.index, score: best.score, exact: best.score === 1000 && exactCount === 1 };
}
