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
 * candidates: [{ title, description?, identityLabel?, groupName?, sourceGroupTitle?, sourceNodeTitle? }]
 * 打分与消歧依次为：
 * 1. 标题与参数身份匹配分（titleScore, identityTitleScore, identityScore）
 * 2. 所属分组与层级匹配分（groupScore, sourceNodeScore）
 * 3. 命中的独立信号数（避免单一重名强占目标）
 * 返回 { index, score, exact, ambiguous }；若存在同等最高分候选且无法明确区分，ambiguous 为 true，exact 为 false。
 */
export function bestRebindMatch({ preferredLabel = "", identityLabel = "", itemLabel = "", preferredGroup = "", preferredNodeTitle = "" } = {}, candidates = []) {
	let best = null;
	let tied = false;

	for (const [index, candidate] of candidates.entries()) {
		const titleScore = Math.max(
			bindingLabelScore(preferredLabel, candidate.title),
			itemLabel && itemLabel !== preferredLabel ? bindingLabelScore(itemLabel, candidate.title) : 0,
		);
		const identityTitleScore = bindingLabelScore(identityLabel, candidate.title);
		const identityScore = bindingLabelScore(identityLabel, candidate.identityLabel);
		const baseScore = Math.max(titleScore, identityTitleScore, identityScore);

		const signals = [titleScore, identityTitleScore, identityScore].filter((value) => value === 1000).length;
		const nodeScore = Math.max(
			bindingLabelScore(preferredLabel, candidate.description),
			bindingLabelScore(identityLabel, candidate.description),
			preferredNodeTitle ? bindingLabelScore(preferredNodeTitle, candidate.sourceNodeTitle || candidate.description) : 0,
		);

		const candidateGroup = candidate.groupName || candidate.sourceGroupTitle || "";
		const groupScore = preferredGroup && candidateGroup ? bindingLabelScore(preferredGroup, candidateGroup) : 0;

		// 综合总分：基础匹配分为主，群组与节点类型作为重要的消歧增益
		const totalScore = baseScore + (groupScore > 0 ? Math.round(groupScore * 0.2) : 0);

		if (!best
			|| totalScore > best.totalScore
			|| (totalScore === best.totalScore && baseScore > best.baseScore)
			|| (totalScore === best.totalScore && baseScore === best.baseScore && signals > best.signals)
			|| (totalScore === best.totalScore && baseScore === best.baseScore && signals === best.signals && nodeScore > best.nodeScore)) {
			best = { index, totalScore, baseScore, signals, nodeScore, groupScore };
			tied = false;
		} else if (totalScore === best.totalScore && baseScore === best.baseScore && signals === best.signals && nodeScore === best.nodeScore) {
			tied = true;
		}
	}

	if (!best || best.baseScore <= 0) return null;

	const isAmbiguous = tied;
	const isExact = best.baseScore === 1000 && !tied;

	return {
		index: best.index,
		score: best.baseScore,
		exact: isExact,
		...(isAmbiguous ? { ambiguous: true } : {}),
	};
}
