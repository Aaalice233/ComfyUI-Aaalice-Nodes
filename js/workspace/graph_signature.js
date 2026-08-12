export function ownDataPropertyValue(object, name) {
	if (!object) return undefined;
	const descriptor = Object.getOwnPropertyDescriptor(object, name);
	return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined;
}

export function widgetOptionSignature(widget) {
	const options = ownDataPropertyValue(widget, "options");
	if (!options) return null;
	const primaryValues = ownDataPropertyValue(options, "values");
	const values = Array.isArray(primaryValues) ? primaryValues : ownDataPropertyValue(options, "options");
	// Accessor-backed choices are runtime state and refresh through CONTROL_HOST_INVALIDATED_EVENT instead.
	if (!Array.isArray(values)) return null;
	return values.map((item) => typeof item === "object" && item !== null ? String(item.value ?? item.label ?? "") : String(item));
}

export function widgetStructureSignature(widget) {
	return [
		ownDataPropertyValue(widget, "name") ?? ownDataPropertyValue(widget, "sourceWidgetName") ?? null,
		ownDataPropertyValue(widget, "type") ?? null,
		ownDataPropertyValue(widget, "sourceNodeId") ?? null,
		ownDataPropertyValue(widget, "sourceWidgetName") ?? null,
		ownDataPropertyValue(widget, "disambiguatingSourceNodeId") ?? null,
		// 新协议宿主投影的身份字段是 widgetId（自有值属性）；name/type 是
		// store 访问器，刻意不读以避免把响应式 store 变成签名计算依赖。
		ownDataPropertyValue(widget, "widgetId") ?? null,
		widgetOptionSignature(widget),
	];
}

export function graphStructureSignature(nodes, hostIdProperty) {
	return nodes.map((node) => JSON.stringify([
		node.id, node.type, node.comfyClass, node.properties?.[hostIdProperty],
		typeof node.getTitle === "function" ? node.getTitle() : node.title,
		(node.widgets || []).map(widgetStructureSignature),
	])).join("|");
}

export function graphSyncSignature(nodes, extra, { hostIdProperty, dashboardKey }) {
	return `${graphStructureSignature(nodes, hostIdProperty)}|${JSON.stringify(extra?.[dashboardKey] ?? null)}`;
}
