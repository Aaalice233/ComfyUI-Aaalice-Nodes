/** Shared geometry for the ParameterPanel node and its native output slots. */
import { displayName, ensureParameters, isTunable, tunableMeta } from "./param_model.js";
import { app } from "../../../scripts/app.js";

export const PARAMETER_NODE_LAYOUT = Object.freeze({
	minWidth: 370,
	outputColumn: 53,
	outputColumnMax: 116,
	outputSlotHeight: 24,
	outputSlotStep: 24,
	bodyPadding: 4,
	// Quick Latent keeps a predictable label/control rhythm. The DOM overlay
	// still receives a 32px hit target, while the canvas surface stays compact.
	rowHeight: 50,
	sectionHeight: 22,
	controlHeight: 32,
	rowGap: 2,
	minHitSize: 32,
});

function rowHeight(parameter) {
	return parameter.param_type === "string" && parameter.config?.multiline
		? Math.max(70, PARAMETER_NODE_LAYOUT.rowHeight + 22)
		: PARAMETER_NODE_LAYOUT.rowHeight;
}

function estimatedOutputLabelWidth(name) {
	let width = 0;
	for (const character of Array.from(String(name || ""))) {
		width += /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60]/u.test(character) ? 12 : 7;
	}
	return width;
}

function outputColumnWidth(parameters) {
	const labelWidth = parameters
		.filter(isTunable)
		.reduce((maximum, parameter) => Math.max(maximum, estimatedOutputLabelWidth(displayName(parameter))), 0);
	return Math.min(
		PARAMETER_NODE_LAYOUT.outputColumnMax,
		Math.max(PARAMETER_NODE_LAYOUT.outputColumn, Math.ceil(labelWidth + 22)),
	);
}

function controlRect(width, rowTop, parameter, outputWidth) {
	const left = PARAMETER_NODE_LAYOUT.bodyPadding;
	const right = Math.max(left + 120, width - outputWidth - PARAMETER_NODE_LAYOUT.bodyPadding - 6);
	const height = parameter.param_type === "string" && parameter.config?.multiline
		? 56
		: PARAMETER_NODE_LAYOUT.controlHeight;
	return {
		left,
		// Keep a small visual gap below the compact label while preserving the
		// 32px accessible hit target.
		top: rowTop + 17,
		width: Math.max(80, right - left),
		height,
	};
}

export function computeParameterLayout(node) {
	const width = Math.max(PARAMETER_NODE_LAYOUT.minWidth, Number(node.size?.[0]) || PARAMETER_NODE_LAYOUT.minWidth);
	const contentTop = Number(node.constructor?.slot_start_y) || 0;
	const parameters = ensureParameters(node);
	const outputWidth = outputColumnWidth(parameters);
	const rows = [];
	let cursor = PARAMETER_NODE_LAYOUT.bodyPadding;
	let outputIndex = 0;
	for (const parameter of parameters) {
		if (parameter.param_type === "separator") {
			rows.push({
				kind: "separator",
				id: parameter.id,
				name: displayName(parameter),
				top: cursor,
				height: PARAMETER_NODE_LAYOUT.sectionHeight,
			});
			cursor += PARAMETER_NODE_LAYOUT.sectionHeight;
			continue;
		}
		const height = rowHeight(parameter);
		const control = controlRect(width, cursor, parameter, outputWidth);
		const label = {
			left: control.left,
			top: cursor + 1,
			width: control.width,
			height: 14,
		};
		const output = {
			index: outputIndex,
			left: width - 1,
			top: PARAMETER_NODE_LAYOUT.bodyPadding
				+ PARAMETER_NODE_LAYOUT.outputSlotHeight / 2
				+ outputIndex * PARAMETER_NODE_LAYOUT.outputSlotStep,
		};
		rows.push({
			kind: "parameter",
			id: parameter.id,
			name: displayName(parameter),
			parameter,
			index: outputIndex,
			top: cursor,
			height,
			label,
			control,
			value: { ...control },
			output,
			hit: { left: 0, top: cursor, width, height },
		});
		cursor += height + PARAMETER_NODE_LAYOUT.rowGap;
		outputIndex += 1;
	}
	const meta = tunableMeta(parameters).slice(0, 32);
	const outputStackHeight = meta.length
		? PARAMETER_NODE_LAYOUT.bodyPadding * 2
			+ PARAMETER_NODE_LAYOUT.outputSlotHeight
			+ (meta.length - 1) * PARAMETER_NODE_LAYOUT.outputSlotStep
		: PARAMETER_NODE_LAYOUT.rowHeight;
	const contentHeight = Math.max(
		PARAMETER_NODE_LAYOUT.rowHeight,
		cursor + PARAMETER_NODE_LAYOUT.bodyPadding,
		outputStackHeight,
	);
	return {
		width,
		height: contentHeight,
		contentTop,
		rows,
		parameters,
		meta,
		outputColumn: { left: width - outputWidth, width: outputWidth },
	};
}

export function syncNativeOutputLayout(node, layout = computeParameterLayout(node)) {
	node._aaaliceParameterLayout = layout;
	const concrete = node?._concreteOutputs;
	if (Array.isArray(concrete)) {
		node._concreteOutputs = concrete.slice(0, node.outputs?.length || 0);
	}
	for (const row of layout.rows) {
		if (row.kind !== "parameter") continue;
		const output = node.outputs?.[row.index];
		if (!output) continue;
		// Keep the same native right-edge geometry as LiteGraph/Quick Latent.
		// The previous x=width put the circle center on the node boundary, which
		// made the painted socket look detached and narrowed the real hit target.
		const slotOffset = (Number(globalThis.LiteGraph?.NODE_SLOT_HEIGHT) || 20) * 0.5;
		output.pos = [layout.width + 1 - slotOffset, layout.contentTop + row.output.top];
	}
	// Nodes 2.0 draws and measures concrete slot instances rather than the
	// public `node.outputs` objects. Keep the copied presentation fields in sync
	// after every parameter rename, theme refresh, or output reorder; otherwise
	// labels/colors can remain stale until the node is recreated.
	const allConcrete = node._concreteOutputs;
	if (Array.isArray(allConcrete)) {
		for (let rawIndex = 0; rawIndex < allConcrete.length; rawIndex += 1) {
			const concrete = allConcrete[rawIndex];
			const output = node.outputs?.[rawIndex];
			if (!concrete || !output) continue;
			for (const key of [
				"name", "label", "localized_name", "type", "shape", "color",
				"color_off", "color_on", "_aaaliceProtocolName", "_aaaliceParamId",
			]) {
				if (output[key] === undefined) delete concrete[key];
				else concrete[key] = output[key];
			}
			if (output.pos) concrete.pos = [...output.pos];
			else delete concrete.pos;
		}
	}
	return layout;
}

export function drawParameterStaticLayer(ctx, node, layout = node._aaaliceParameterLayout || computeParameterLayout(node)) {
	if (!ctx || node?.flags?.collapsed || app.canvas?.vueNodesMode === true) return;
	const styles = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
	const border = styles?.getPropertyValue("--border-color").trim() || "#4d496a";
	ctx.save();
	ctx.translate(0, layout.contentTop);
	// Reserve a quiet output rail like Quick Latent without painting fake
	// sockets; native LiteGraph/Nodes 2.0 slots remain the hit targets.
	ctx.globalAlpha = 0.34;
	ctx.strokeStyle = border;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(layout.outputColumn.left - 7, 4);
	ctx.lineTo(layout.outputColumn.left - 7, Math.max(4, layout.height - 7));
	ctx.stroke();
	ctx.restore();
}

/** Paint the themed body before native slots and DOM widgets are drawn. */
function traceBottomRoundedRect(ctx, x, y, width, height, radius) {
	const safeWidth = Math.max(0, width);
	const safeHeight = Math.max(0, height);
	const safeRadius = Math.max(0, Math.min(radius, safeWidth / 2, safeHeight / 2));
	ctx.moveTo(x, y);
	ctx.lineTo(x + safeWidth, y);
	ctx.lineTo(x + safeWidth, y + safeHeight - safeRadius);
	ctx.quadraticCurveTo(x + safeWidth, y + safeHeight, x + safeWidth - safeRadius, y + safeHeight);
	ctx.lineTo(x + safeRadius, y + safeHeight);
	ctx.quadraticCurveTo(x, y + safeHeight, x, y + safeHeight - safeRadius);
	ctx.closePath();
}

export function drawParameterNodeSurface(ctx, node, layout = node._aaaliceParameterLayout || computeParameterLayout(node)) {
	if (!ctx || node?.flags?.collapsed || app.canvas?.vueNodesMode === true) return;
	const styles = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
	const surface = styles?.getPropertyValue("--comfy-menu-secondary-bg").trim() || styles?.getPropertyValue("--comfy-menu-bg").trim() || "#252525";
	const raised = styles?.getPropertyValue("--comfy-input-bg").trim() || "#1d1d1d";
	const border = styles?.getPropertyValue("--border-color").trim() || "#4b4b4b";
	const titleHeight = Number(node.constructor?.title_height) || 24;
	const width = Number(node.size?.[0]) || PARAMETER_NODE_LAYOUT.minWidth;
	const height = Number(node.size?.[1]) || layout.height + titleHeight;
	ctx.save();
	// One continuous panel keeps the native title, controls and output rail in
	// the same visual hierarchy instead of looking like stacked HTML fields.
	ctx.globalAlpha = 0.98;
	ctx.fillStyle = surface;
	ctx.beginPath();
	traceBottomRoundedRect(ctx, 0, 0, width, height, 8);
	ctx.fill();
	ctx.globalAlpha = 0.26;
	ctx.fillStyle = raised;
	ctx.fillRect(0, 0, width, titleHeight);
	ctx.globalAlpha = 0.22;
	ctx.fillRect(layout.outputColumn.left - 7, titleHeight, Math.max(0, width - layout.outputColumn.left + 7), Math.max(0, height - titleHeight));
	ctx.globalAlpha = 0.55;
	ctx.strokeStyle = border;
	ctx.lineWidth = 1;
	ctx.beginPath();
	traceBottomRoundedRect(ctx, 0.5, 0.5, width - 1, height - 1, 8);
	ctx.stroke();
	ctx.globalAlpha = 0.34;
	ctx.fillStyle = raised;
	ctx.fillRect(0, titleHeight, width, 1);
	ctx.restore();
}
