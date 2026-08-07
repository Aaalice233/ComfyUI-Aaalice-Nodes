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
 * 打平消歧依次为：命中的独立信号数（标题与身份同时命中优先于单一信号）、节点标题得分，
 * 避免不同节点上原始名相同的 widget（如多个 model_name）抢走标题一致的候选。
 */
export function bestRebindMatch({ preferredLabel = "", identityLabel = "", itemLabel = "" } = {}, candidates = []) {
	let best = null; let exactCount = 0;
	for (const [index, candidate] of candidates.entries()) {
		const titleScore = Math.max(
			bindingLabelScore(preferredLabel, candidate.title),
			itemLabel && itemLabel !== preferredLabel ? bindingLabelScore(itemLabel, candidate.title) : 0,
		);
		const identityTitleScore = bindingLabelScore(identityLabel, candidate.title);
		const identityScore = bindingLabelScore(identityLabel, candidate.identityLabel);
		const score = Math.max(titleScore, identityTitleScore, identityScore);
		if (score === 1000) exactCount += 1;
		const signals = [titleScore, identityTitleScore, identityScore].filter((value) => value === 1000).length;
		const nodeScore = Math.max(
			bindingLabelScore(preferredLabel, candidate.description),
			bindingLabelScore(identityLabel, candidate.description),
		);
		if (!best || score > best.score
			|| (score === best.score && score > 0 && signals > best.signals)
			|| (score === best.score && score > 0 && signals === best.signals && nodeScore > best.nodeScore)) {
			best = { index, score, signals, nodeScore };
		}
	}
	if (!best || best.score <= 0) return null;
	return { index: best.index, score: best.score, exact: best.score === 1000 && exactCount === 1 };
}
