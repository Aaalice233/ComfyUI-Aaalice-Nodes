/** Helpers for discovering node graph groups and subgraph promotion hierarchies. */

import { isPromotedWidget, promotedWidgetIdentity, resolvePromotedDefinitionOwner } from "./promoted_widget_source.js";

function nodeTitle(node, fallback = "") {
	const title = typeof node?.getTitle === "function" ? node.getTitle() : node?.title;
	return String(title || node?.type || fallback).trim();
}

/**
 * 查找节点在当前图内所属的 LGraphGroup 名称。
 * 若节点同时位于多个重叠组中，优先返回面积更小、更具体的内层组。
 */
export function findNodeGraphGroup(node) {
	if (!node || !node.graph) return "";
	const groups = node.graph._groups || [];
	if (!Array.isArray(groups) || !groups.length) return "";

	const matches = [];
	const nodeX = Array.isArray(node.pos) ? node.pos[0] : 0;
	const nodeY = Array.isArray(node.pos) ? node.pos[1] : 0;

	for (const group of groups) {
		let isMember = false;
		if (Array.isArray(group._nodes) && group._nodes.includes(node)) {
			isMember = true;
		} else if (typeof group.isPointInside === "function") {
			isMember = group.isPointInside(nodeX, nodeY);
		} else if (Array.isArray(group.pos) && Array.isArray(group.size)) {
			const [gx, gy] = group.pos;
			const [gw, gh] = group.size;
			isMember = nodeX >= gx && nodeX <= gx + gw && nodeY >= gy && nodeY <= gy + gh;
		}

		if (isMember) {
			const size = Array.isArray(group.size) ? (group.size[0] * group.size[1]) : Infinity;
			matches.push({ title: String(group.title || "").trim(), size });
		}
	}

	if (!matches.length) return "";
	matches.sort((left, right) => left.size - right.size);
	return matches[0].title;
}

/**
 * 解析控件的宿主与子图层级上下文，供 UI 展示与重绑匹配使用。
 */
export function resolveControlHierarchy(node, widget) {
	const hostTitle = nodeTitle(node, "Node");
	const groupName = findNodeGraphGroup(node);
	const isPromoted = isPromotedWidget(node, widget);

	if (!isPromoted) {
		const contextDescription = groupName ? `[${groupName}] ${hostTitle}` : hostTitle;
		return {
			isPromoted: false,
			hostTitle,
			groupName,
			sourceNodeTitle: hostTitle,
			sourceGroupTitle: groupName,
			contextDescription,
		};
	}

	const owner = resolvePromotedDefinitionOwner(node, widget);
	let interiorNode = owner.node !== node ? owner.node : null;
	if (!interiorNode) {
		const identity = typeof node.subgraph?.getNodeById === "function" ? promotedWidgetIdentity(node, widget) : null;
		if (identity?.sourceNodeId != null) {
			interiorNode = node.subgraph.getNodeById(identity.sourceNodeId) || null;
		}
	}
	const sourceNodeTitle = interiorNode ? nodeTitle(interiorNode, "Source") : "";
	const sourceGroupTitle = interiorNode ? findNodeGraphGroup(interiorNode) : "";

	let contextDescription = "";
	if (groupName) {
		contextDescription = sourceNodeTitle && sourceNodeTitle !== hostTitle
			? `[${groupName}] ${hostTitle} · ${sourceNodeTitle}`
			: `[${groupName}] ${hostTitle}`;
	} else if (sourceGroupTitle) {
		contextDescription = sourceNodeTitle
			? `${hostTitle} · [${sourceGroupTitle}] ${sourceNodeTitle}`
			: `${hostTitle} · [${sourceGroupTitle}]`;
	} else if (sourceNodeTitle && sourceNodeTitle !== hostTitle) {
		contextDescription = `${hostTitle} · ${sourceNodeTitle}`;
	} else {
		contextDescription = hostTitle;
	}

	return {
		isPromoted: true,
		hostTitle,
		groupName,
		sourceNodeTitle,
		sourceGroupTitle,
		contextDescription,
	};
}
