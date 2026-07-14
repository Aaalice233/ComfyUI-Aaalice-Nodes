/** Shared geometry for the ParameterPanel node and its native output slots. */
import { displayName, ensureParameters, isTunable, tunableMeta } from "./param_model.js";
import { app } from "../../../scripts/app.js";

export const PARAMETER_NODE_LAYOUT = Object.freeze({
	minWidth: 370,
	outputColumn: 53,
	bodyPadding: 8,
	rowHeight: 48,
	sectionHeight: 28,
	controlHeight: 34,
	rowGap: 4,
	minHitSize: 32,
});

function rowHeight(parameter) {
	return parameter.param_type === "string" && parameter.config?.multiline
		? Math.max(80, PARAMETER_NODE_LAYOUT.rowHeight + 32)
		: PARAMETER_NODE_LAYOUT.rowHeight;
}

function controlRect(width, rowTop, parameter) {
	const left = PARAMETER_NODE_LAYOUT.bodyPadding;
	const right = Math.max(left + 120, width - PARAMETER_NODE_LAYOUT.outputColumn - PARAMETER_NODE_LAYOUT.bodyPadding);
	const height = parameter.param_type === "string" && parameter.config?.multiline
		? 64
		: PARAMETER_NODE_LAYOUT.controlHeight;
	return {
		left,
		top: rowTop + Math.max(0, (rowHeight(parameter) - height) / 2),
		width: Math.max(80, right - left),
		height,
	};
}

export function getVisibleOutputIndices(node) {
	const parameters = ensureParameters(node);
	const visible = [];
	for (const parameter of parameters) if (isTunable(parameter)) visible.push(visible.length);
	return visible.slice(0, Math.min(32, node.outputs?.length || 32));
}

export function computeParameterLayout(node) {
	const width = Math.max(PARAMETER_NODE_LAYOUT.minWidth, Number(node.size?.[0]) || PARAMETER_NODE_LAYOUT.minWidth);
	const contentTop = Number(node.constructor?.slot_start_y) || 0;
	const parameters = ensureParameters(node);
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
		const control = controlRect(width, cursor, parameter);
		const label = {
			left: control.left,
			top: cursor + 8,
			width: control.width,
			height: 18,
		};
		const output = {
			index: outputIndex,
			left: width - 1,
			top: cursor + height / 2,
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
	const contentHeight = Math.max(PARAMETER_NODE_LAYOUT.rowHeight, cursor + PARAMETER_NODE_LAYOUT.bodyPadding);
	const meta = tunableMeta(parameters).slice(0, 32);
	return {
		width,
		height: contentHeight,
		contentTop,
		rows,
		parameters,
		meta,
		visibleOutputIndices: getVisibleOutputIndices(node),
		outputColumn: { left: width - PARAMETER_NODE_LAYOUT.outputColumn, width: PARAMETER_NODE_LAYOUT.outputColumn },
	};
}

export function syncNativeOutputLayout(node, layout = computeParameterLayout(node)) {
	node._aaaliceParameterLayout = layout;
	node._aaaliceVisibleOutputIndices = new Set(layout.visibleOutputIndices);
	// Nodes 2.0 measures the private concrete slot collection directly. Keep the
	// public 32-slot protocol intact, but expose only the active prefix to native
	// layout and hit testing so unused outputs cannot reserve phantom height.
	const concrete = node?._concreteOutputs;
	if (Array.isArray(concrete)) {
		const previousAll = node._aaaliceAllConcreteOutputs;
		if (!Array.isArray(previousAll) || previousAll.length !== (node.outputs?.length || 0) || previousAll[0] !== concrete[0]) {
			node._aaaliceAllConcreteOutputs = concrete.slice();
		}
		const all = node._aaaliceAllConcreteOutputs || concrete;
		node._concreteOutputs = all.filter((slot) => node._aaaliceVisibleOutputIndices.has(all.indexOf(slot)));
	}
	for (const row of layout.rows) {
		if (row.kind !== "parameter") continue;
		const output = node.outputs?.[row.index];
		if (!output) continue;
		output.pos = [layout.width, layout.contentTop + row.output.top];
		output._aaaliceDisplayHidden = !layout.visibleOutputIndices.includes(row.index);
		output._aaaliceRawIndex = row.index;
	}
	for (let index = layout.meta.length; index < (node.outputs?.length || 0); index += 1) {
		const output = node.outputs[index];
		if (!output) continue;
		output._aaaliceDisplayHidden = true;
		output._aaaliceRawIndex = index;
		delete output.pos;
	}
	return layout;
}

export function withVisibleConcreteOutputs(node, callback) {
	const concrete = node?._concreteOutputs;
	if (!Array.isArray(concrete)) return callback();
	const visible = node._aaaliceVisibleOutputIndices || new Set();
	const previous = node._concreteOutputs;
	node._concreteOutputs = concrete.filter((slot, index) => visible.has(slot?._aaaliceRawIndex ?? index));
	try {
		return callback();
	} finally {
		node._concreteOutputs = previous;
	}
}

export function graphRectToViewport(node, rect) {
	const canvas = app?.canvas || globalThis.LiteGraph?.active_canvas;
	const element = canvas?.canvas || canvas?.el;
	const bounds = element?.getBoundingClientRect?.();
	const scale = Number(canvas?.ds?.scale) || 1;
	const offset = canvas?.ds?.offset || [0, 0];
	if (!bounds || !node?.pos) return rect;
	return {
		left: bounds.left + (node.pos[0] + offset[0] + rect.left) * scale,
		top: bounds.top + (node.pos[1] + offset[1] + rect.top) * scale,
		width: rect.width * scale,
		height: rect.height * scale,
	};
}

export function drawParameterStaticLayer(ctx, node, layout = node._aaaliceParameterLayout || computeParameterLayout(node)) {
	if (!ctx || node?.flags?.collapsed || app.canvas?.vueNodesMode === true) return;
	const styles = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
	const text = styles?.getPropertyValue("--fg-color").trim() || "#eee";
	const muted = styles?.getPropertyValue("--descrip-text").trim() || "#999";
	const accent = styles?.getPropertyValue("--p-primary-color").trim() || "#6aaeff";
	const control = styles?.getPropertyValue("--comfy-input-bg").trim() || "#202024";
	ctx.save();
	ctx.translate(0, layout.contentTop);
	ctx.font = "600 12px sans-serif";
	ctx.textBaseline = "middle";
	for (const row of layout.rows) {
		if (row.kind === "separator") {
			ctx.fillStyle = muted;
			ctx.fillText(row.name, row.label?.left || 8, row.top + row.height / 2);
			continue;
		}
		ctx.fillStyle = text;
		ctx.fillText(row.name, row.label.left, row.label.top + row.label.height / 2);
		const parameter = row.parameter;
		if (parameter.param_type === "slider") {
			const min = Number(parameter.config?.min ?? 0);
			const max = Number(parameter.config?.max ?? 100);
			const value = Number(parameter.value ?? min);
			const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
			const left = row.control.left;
			const right = row.control.left + row.control.width - 64;
			const y = row.control.top + row.control.height / 2;
			ctx.strokeStyle = muted;
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
			ctx.strokeStyle = accent;
			ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + (right - left) * ratio, y); ctx.stroke();
			ctx.fillStyle = accent;
			ctx.beginPath(); ctx.arc(left + (right - left) * ratio, y, 7, 0, Math.PI * 2); ctx.fill();
		}
		if (parameter.param_type === "switch") {
			const left = row.control.left;
			const top = row.control.top + 7;
			const width = 44;
			ctx.fillStyle = parameter.value ? accent : control;
			ctx.beginPath();
			if (typeof ctx.roundRect === "function") ctx.roundRect(left, top, width, 20, 10);
			else ctx.rect(left, top, width, 20);
			ctx.fill();
			ctx.fillStyle = text;
			ctx.beginPath(); ctx.arc(left + (parameter.value ? 34 : 10), top + 10, 7, 0, Math.PI * 2); ctx.fill();
		}
	}
	ctx.restore();
}
