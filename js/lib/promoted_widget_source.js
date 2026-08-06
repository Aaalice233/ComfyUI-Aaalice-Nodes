/**
 * Promoted（子图宿主）widget 身份解析，兼容两代前端协议：
 * - 旧协议（frontend <= 1.26）：PromotedWidgetView 自带 sourceNodeId /
 *   sourceWidgetName（嵌套时另有 disambiguatingSourceNodeId）。
 * - 新协议（frontend >= 1.47，上游 ADR 0009）：宿主 widget 是由非枚举
 *   widgetId 寻址的 widgetValueStore 投影，不再携带来源字段；来源必须沿
 *   宿主 input 的 _subgraphSlot 链路解析到子图内部节点。
 * 绑定持久化的 controlId 在两代协议下保持同一元组，旧工作流绑定才能继续命中。
 */

export function isPromotedWidgetHost(node) {
	return Boolean(node?.isSubgraphNode?.() || node?.subgraph);
}

export function isPromotedWidget(node, widget) {
	if (!widget) return false;
	if (typeof widget.sourceNodeId !== "undefined" && typeof widget.sourceWidgetName === "string") return true;
	return isPromotedWidgetHost(node) && typeof widget.widgetId !== "undefined";
}

function resolveStoreBackedIdentity(host, widget) {
	const input = (host?.inputs || []).find((candidate) => candidate?.widgetId === widget.widgetId || candidate?._widget === widget);
	const slot = input?._subgraphSlot;
	if (!slot) return null;
	for (const linkId of slot.linkIds || []) {
		const link = host.subgraph?.getLink?.(linkId) ?? host.subgraph?.links?.[linkId] ?? null;
		if (!link) continue;
		const inputNode = typeof link.resolve === "function" ? link.resolve(host.subgraph)?.inputNode : null;
		if (!inputNode || !Array.isArray(inputNode.inputs)) continue;
		const targetInput = inputNode.inputs.find((entry) => entry.link === linkId);
		if (!targetInput) continue;
		// 嵌套提升：直接来源本身是子图节点的提升输入，沿目标输入继续取它的宿主投影。
		if (inputNode.isSubgraphNode?.()) {
			const nestedWidget = inputNode.getWidgetFromSlot?.(targetInput) || targetInput._widget || null;
			const nested = nestedWidget ? promotedWidgetIdentity(inputNode, nestedWidget) : null;
			return {
				sourceNodeId: inputNode.id,
				sourceWidgetName: String(targetInput.name ?? ""),
				disambiguatingSourceNodeId: nested?.sourceNodeId ?? null,
				interiorWidget: nestedWidget,
			};
		}
		const interiorWidget = inputNode.getWidgetFromSlot?.(targetInput) || null;
		if (!interiorWidget || typeof interiorWidget.name !== "string" || !interiorWidget.name) continue;
		return { sourceNodeId: inputNode.id, sourceWidgetName: interiorWidget.name, disambiguatingSourceNodeId: null, interiorWidget };
	}
	return null;
}

/**
 * 返回 { sourceNodeId, sourceWidgetName, disambiguatingSourceNodeId, interiorWidget? }；
 * 非 promoted widget 或来源无法解析时返回 null。
 */
export function promotedWidgetIdentity(node, widget) {
	if (!isPromotedWidget(node, widget)) return null;
	if (typeof widget.sourceNodeId !== "undefined" && typeof widget.sourceWidgetName === "string") {
		return {
			sourceNodeId: widget.sourceNodeId,
			sourceWidgetName: widget.sourceWidgetName,
			disambiguatingSourceNodeId: widget.disambiguatingSourceNodeId ?? null,
			interiorWidget: null,
		};
	}
	return resolveStoreBackedIdentity(node, widget);
}

/**
 * 沿提升链走到最深层的真实定义 owner（普通内部节点 + 真实 widget）。
 * 任一层无法解析时停在当前层，保证调用方拿到仍可用的宿主投影而不是抛错。
 */
export function resolvePromotedDefinitionOwner(node, widget) {
	if (!isPromotedWidget(node, widget)) return { node, widget };
	let host = node;
	let current = widget;
	const visited = new Set();
	for (let depth = 0; depth < 100; depth++) {
		const identity = promotedWidgetIdentity(host, current);
		if (!identity) return { node: host, widget: current };
		const key = `${String(identity.sourceNodeId)}:${identity.sourceWidgetName}`;
		if (visited.has(key)) return { node: host, widget: current };
		visited.add(key);
		const interiorNode = host.subgraph?.getNodeById?.(identity.sourceNodeId);
		if (!interiorNode) return { node: host, widget: current };
		const interiorWidget = identity.interiorWidget || legacyInteriorWidget(interiorNode, identity);
		if (!interiorWidget) return { node: host, widget: current };
		if (!isPromotedWidget(interiorNode, interiorWidget)) return { node: interiorNode, widget: interiorWidget };
		host = interiorNode;
		current = interiorWidget;
	}
	return { node: host, widget: current };
}

function legacyInteriorWidget(interiorNode, identity) {
	const widgets = interiorNode?.widgets || [];
	if (identity.disambiguatingSourceNodeId != null) {
		return widgets.find((candidate) => isPromotedWidget(interiorNode, candidate)
			&& (candidate.disambiguatingSourceNodeId ?? candidate.sourceNodeId) === identity.disambiguatingSourceNodeId
			&& (candidate.sourceWidgetName === identity.sourceWidgetName || candidate.name === identity.sourceWidgetName)) || null;
	}
	return widgets.find((candidate) => candidate?.name === identity.sourceWidgetName) || null;
}
