/**
 * ParameterControlPanel — node surface (classic + Nodes 2.0)
 *
 * Mount pattern (Zhen-Bo/comfyui-quick-latent):
 *   hide native widgets → onDrawForeground canvas UI → onMouseDown hit-test
 * State: node.properties.parameters (+ parameters_json mirror)
 * Execute: graphToPrompt injects inputs.parameters_json (Schema accept_all_inputs)
 *
 * Sidebar (parameter_sidebar.js) remains the full structure editor.
 */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	EVENT_PCP_CHANGED,
	EVENT_PCP_LIST,
	ensureParameters,
	loadParametersFromWidget,
	notifyPcpChanged,
	syncParametersToWidget,
} from "./lib/param_model.js";

const NODE = "ParameterControlPanel";

/** quick-latent purple palette (node canvas only; sidebar uses CSS tokens) */
const C = {
	pad: 10,
	choiceFill: "#252538",
	choiceBorder: "#3f3b5a",
	selectedFill: "#815fc8",
	selectedBorder: "rgba(229, 219, 255, 0.58)",
	selectedText: "#ffffff",
	optionText: "#918da3",
	label: "#8d899f",
	value: "#e8e8f0",
	track: "#1a1a28",
	hint: "#7f7a90",
	sep: "#6e6e85",
};

const MIN_W = 280;
const MIN_H = 120;
const HINT_H = 22;
const SEP_H = 26;
const ROW_H = 54; // label row + control row
const CONTROL_H = 26;

function isPcp(node) {
	if (!node) return false;
	const cands = [
		node.comfyClass,
		node.type,
		node.constructor?.comfyClass,
		node.constructor?.type,
		node.constructor?.nodeData?.name,
	];
	return cands.some((x) => x === NODE);
}

function hideAllNativeWidgets(node) {
	if (!node.widgets?.length) return;
	for (const w of node.widgets) {
		if (!w || w._aaaliceKeep) continue;
		w.hidden = true;
		w.type = "hidden";
		w.computeSize = () => [0, -4];
	}
}

function stripLegacyJsonUi(node) {
	if (node.widgets) {
		for (let i = node.widgets.length - 1; i >= 0; i--) {
			const w = node.widgets[i];
			if (w?.name === "parameters_json") {
				try {
					w.onRemove?.();
				} catch {
					/* ignore */
				}
				node.widgets.splice(i, 1);
			}
		}
	}
	if (node.inputs) {
		for (let i = node.inputs.length - 1; i >= 0; i--) {
			if (node.inputs[i]?.name === "parameters_json") {
				try {
					node.removeInput(i);
				} catch {
					node.inputs.splice(i, 1);
				}
			}
		}
	}
}

function contentHeight(params) {
	let h = C.pad + HINT_H + 6;
	if (!params.length) {
		h += 36;
	} else {
		for (const p of params) {
			h += p.param_type === "separator" ? SEP_H : ROW_H;
		}
	}
	return Math.max(MIN_H, h + C.pad);
}

function roundRect(ctx, x, y, w, h, r) {
	if (typeof ctx.roundRect === "function") {
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, r);
		return;
	}
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

function fillFrame(ctx, x, y, w, h, r, fill, stroke) {
	roundRect(ctx, x, y, w, h, r);
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.strokeStyle = stroke;
	ctx.lineWidth = 1;
	ctx.stroke();
}

function fillSelectedPill(ctx, x, y, w, h, r) {
	roundRect(ctx, x, y, w, h, r);
	ctx.fillStyle = C.selectedFill;
	ctx.fill();
	roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
	ctx.strokeStyle = C.selectedBorder;
	ctx.lineWidth = 1.25;
	ctx.stroke();
}

function hitIn(box, px, py) {
	if (!box) return false;
	return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

function openOverlayInput({ node, box, value, multiline = false, onCommit }) {
	if (node._aaaliceOverlayInput) return;

	const ds = app.canvas?.ds;
	const canvasEl = app.canvas?.canvas;
	if (!ds || !canvasEl) return;

	const scale = ds.scale;
	const canvasRect = canvasEl.getBoundingClientRect();
	const [ox, oy] = ds.offset;
	const left = canvasRect.left + (node.pos[0] + box.x + ox) * scale;
	const top = canvasRect.top + (node.pos[1] + box.y + oy) * scale;

	const input = document.createElement(multiline ? "textarea" : "input");
	if (!multiline) input.type = "text";
	node._aaaliceOverlayInput = input;
	input.value = value != null ? String(value) : "";
	Object.assign(input.style, {
		position: "fixed",
		left: `${left}px`,
		top: `${top}px`,
		width: `${Math.max(box.w, 80) * scale}px`,
		height: `${Math.max(box.h, 22) * scale}px`,
		fontSize: `${12 * scale}px`,
		boxSizing: "border-box",
		padding: `${2 * scale}px ${6 * scale}px`,
		margin: "0",
		fontFamily: "system-ui, sans-serif",
		fontWeight: "600",
		color: C.value,
		background: C.choiceFill,
		border: `1px solid ${C.selectedFill}`,
		borderRadius: `${5 * scale}px`,
		zIndex: "10000",
		outline: "none",
		resize: "none",
	});
	document.body.appendChild(input);
	setTimeout(() => {
		input.focus();
		if (input.select) input.select();
	}, 0);

	let done = false;
	const cleanup = () => {
		window.removeEventListener("wheel", onWheel, true);
		input.remove();
		node._aaaliceOverlayInput = null;
	};
	const commit = () => {
		if (done) return;
		done = true;
		const next = input.value;
		cleanup();
		onCommit(next);
	};
	const cancel = () => {
		if (done) return;
		done = true;
		cleanup();
	};
	const onWheel = () => commit();

	input.addEventListener("keydown", (e) => {
		e.stopPropagation();
		if (e.key === "Enter" && !multiline) {
			commit();
			return;
		}
		if (e.key === "Escape") {
			cancel();
		}
	});
	input.addEventListener("blur", commit);
	window.addEventListener("wheel", onWheel, true);
}

function setupPcpNode(node) {
	if (!isPcp(node) || node._aaalicePcpCanvas) return;
	node._aaalicePcpCanvas = true;

	loadParametersFromWidget(node);
	stripLegacyJsonUi(node);
	hideAllNativeWidgets(node);

	/** @type {Array<{kind:string, param?:object, box:object, meta?:object}>} */
	let hits = [];
	let drag = null; // { param, track }

	const persist = () => {
		notifyPcpChanged(node);
		node.setDirtyCanvas?.(true, true);
	};

	const applySize = () => {
		const params = ensureParameters(node);
		const h = contentHeight(params);
		const w = Math.max(node.size?.[0] || MIN_W, MIN_W);
		try {
			node.setSize?.([w, Math.max(h, MIN_H)]);
			if (node.size) {
				node.size[0] = Math.max(node.size[0], MIN_W);
				node.size[1] = Math.max(node.size[1], h);
			}
		} catch {
			/* ignore */
		}
	};

	const origDrawFG = node.onDrawForeground;
	node.onDrawForeground = function (ctx) {
		origDrawFG?.apply(this, arguments);
		if (this.flags?.collapsed) return;

		const params = ensureParameters(this);
		hits = [];
		const width = this.size[0];
		const contentW = width - C.pad * 2;
		let y = C.pad;

		// hint
		ctx.fillStyle = C.hint;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		const hint = t(
			"aaalice.pcp.node.structureHint",
			"Edit structure in the sidebar tab “Parameter Panel”.",
		);
		// simple wrap-ish: clip single line
		ctx.fillText(hint, C.pad, y, contentW);
		y += HINT_H;

		if (!params.length) {
			fillFrame(ctx, C.pad, y, contentW, 40, 6, C.choiceFill, C.choiceBorder);
			ctx.fillStyle = C.optionText;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				t(
					"aaalice.pcp.node.empty",
					"No parameters yet — open the sidebar tab “Parameter Panel” to add some.",
				),
				C.pad + contentW / 2,
				y + 20,
				contentW - 12,
			);
			return;
		}

		for (const p of params) {
			if (p.param_type === "separator") {
				ctx.fillStyle = C.sep;
				ctx.font = "10px sans-serif";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				const label = p.name || "—";
				ctx.fillText(label.toUpperCase(), C.pad, y + SEP_H / 2, contentW);
				// underline
				ctx.strokeStyle = C.choiceBorder;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(C.pad, y + SEP_H - 4);
				ctx.lineTo(C.pad + contentW, y + SEP_H - 4);
				ctx.stroke();
				y += SEP_H;
				continue;
			}

			// name + type badge
			const name = p.name || p.id || "?";
			ctx.fillStyle = C.value;
			ctx.font = "12px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(name, C.pad, y + 10, contentW - 72);

			const typeLabel = p.param_type || "";
			ctx.font = "10px sans-serif";
			const tw = Math.min(ctx.measureText(typeLabel).width + 14, 70);
			const bx = C.pad + contentW - tw;
			fillFrame(ctx, bx, y + 2, tw, 16, 8, C.choiceFill, C.choiceBorder);
			ctx.fillStyle = C.optionText;
			ctx.textAlign = "center";
			ctx.fillText(typeLabel, bx + tw / 2, y + 10);

			const cy = y + 22;
			const control = { x: C.pad, y: cy, w: contentW, h: CONTROL_H };

			if (p.param_type === "slider") {
				drawSlider(ctx, p, control, hits);
			} else if (p.param_type === "switch") {
				drawSwitch(ctx, p, control, hits);
			} else if (p.param_type === "dropdown") {
				drawDropdown(ctx, p, control, hits);
			} else {
				// string (default)
				drawStringField(ctx, p, control, hits);
			}

			y += ROW_H;
		}
	};

	function drawSlider(ctx, p, box, hitList) {
		const cfg = p.config || {};
		const min = Number(cfg.min ?? 0);
		const max = Number(cfg.max ?? 100);
		const step = Number(cfg.step ?? 1);
		let val = Number(p.value ?? min);
		if (Number.isNaN(val)) val = min;
		const span = max - min || 1;
		const t01 = Math.max(0, Math.min(1, (val - min) / span));

		const valueW = 52;
		const trackX = box.x;
		const trackW = box.w - valueW - 8;
		const trackY = box.y + 8;
		const trackH = 10;

		// track
		fillFrame(ctx, trackX, trackY, trackW, trackH, 5, C.track, C.choiceBorder);
		// fill
		const fillW = Math.max(6, trackW * t01);
		roundRect(ctx, trackX, trackY, fillW, trackH, 5);
		ctx.fillStyle = C.selectedFill;
		ctx.fill();
		// thumb
		const thumbX = trackX + fillW - 6;
		roundRect(ctx, thumbX, trackY - 3, 12, trackH + 6, 4);
		ctx.fillStyle = C.selectedText;
		ctx.fill();

		// value box
		const vx = box.x + box.w - valueW;
		fillFrame(ctx, vx, box.y, valueW, box.h, 5, C.choiceFill, C.choiceBorder);
		ctx.fillStyle = C.value;
		ctx.font = "bold 11px monospace";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const display =
			step === 1 || Number.isInteger(step)
				? String(Math.round(val))
				: String(Math.round(val * 1000) / 1000);
		ctx.fillText(display, vx + valueW / 2, box.y + box.h / 2);

		hitList.push({
			kind: "slider_track",
			param: p,
			box: { x: trackX, y: box.y, w: trackW, h: box.h },
			meta: { min, max, step, trackX, trackW },
		});
		hitList.push({
			kind: "slider_value",
			param: p,
			box: { x: vx, y: box.y, w: valueW, h: box.h },
			meta: { min, max, step },
		});
	}

	function drawSwitch(ctx, p, box, hitList) {
		const on = Boolean(p.value);
		const w = 56;
		const h = box.h;
		const x = box.x;
		const y = box.y;
		fillFrame(ctx, x, y, w, h, 5, C.choiceFill, C.choiceBorder);
		if (on) {
			fillSelectedPill(ctx, x + 2, y + 2, w - 4, h - 4, 4);
		}
		ctx.fillStyle = on ? C.selectedText : C.optionText;
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(on ? "ON" : "OFF", x + w / 2, y + h / 2);

		// muted label remainder
		ctx.fillStyle = C.optionText;
		ctx.font = "11px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(on ? "On" : "Off", x + w + 10, y + h / 2);

		hitList.push({
			kind: "switch",
			param: p,
			box: { x, y, w: box.w, h },
		});
	}

	function drawDropdown(ctx, p, box, hitList) {
		const opts = Array.isArray(p.config?.options) ? p.config.options : [];
		const val = p.value != null ? String(p.value) : opts[0] ?? "";
		fillFrame(ctx, box.x, box.y, box.w, box.h, 5, C.choiceFill, C.choiceBorder);
		ctx.fillStyle = C.value;
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(val, box.x + 10, box.y + box.h / 2, box.w - 28);
		// chevron
		ctx.fillStyle = C.optionText;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText("▾", box.x + box.w - 10, box.y + box.h / 2);
		hitList.push({
			kind: "dropdown",
			param: p,
			box: { ...box },
			meta: { options: opts },
		});
	}

	function drawStringField(ctx, p, box, hitList) {
		const val = p.value != null ? String(p.value) : "";
		fillFrame(ctx, box.x, box.y, box.w, box.h, 5, C.choiceFill, C.choiceBorder);
		ctx.fillStyle = val ? C.value : C.optionText;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(val || "…", box.x + 10, box.y + box.h / 2, box.w - 16);
		hitList.push({
			kind: "string",
			param: p,
			box: { ...box },
		});
	}

	function setSliderFromX(param, meta, pointerX) {
		const { min, max, step, trackX, trackW } = meta;
		const t01 = Math.max(0, Math.min(1, (pointerX - trackX) / (trackW || 1)));
		let v = min + t01 * (max - min);
		if (step > 0) {
			v = Math.round((v - min) / step) * step + min;
		}
		// float hygiene
		const decimals = String(step).includes(".")
			? String(step).split(".")[1].length
			: 0;
		if (decimals > 0) v = Number(v.toFixed(decimals));
		else v = Math.round(v);
		v = Math.max(min, Math.min(max, v));
		if (param.value !== v) {
			param.value = v;
			persist();
		} else {
			node.setDirtyCanvas?.(true, false);
		}
	}

	const origMouseDown = node.onMouseDown;
	node.onMouseDown = function (e, localPos) {
		const r = origMouseDown?.apply(this, arguments);
		if (this.flags?.collapsed) return r;

		const px = localPos[0];
		const py = localPos[1];
		// leave right edge for resize handle
		if (px > this.size[0] - 12) return r ?? false;

		for (const hit of hits) {
			if (!hitIn(hit.box, px, py)) continue;

			if (hit.kind === "switch") {
				hit.param.value = !hit.param.value;
				persist();
				return true;
			}
			if (hit.kind === "slider_track") {
				setSliderFromX(hit.param, hit.meta, px);
				drag = { param: hit.param, meta: hit.meta };
				return true;
			}
			if (hit.kind === "slider_value") {
				const { min, max, step } = hit.meta;
				openOverlayInput({
					node: this,
					box: hit.box,
					value: hit.param.value ?? min,
					onCommit: (text) => {
						let v = Number(String(text).trim());
						if (Number.isNaN(v)) return;
						if (step > 0) {
							v = Math.round((v - min) / step) * step + min;
						}
						v = Math.max(min, Math.min(max, v));
						hit.param.value = v;
						persist();
					},
				});
				return true;
			}
			if (hit.kind === "dropdown") {
				const opts = hit.meta?.options || [];
				if (!opts.length) return true;
				const cur = hit.param.value;
				const idx = Math.max(0, opts.indexOf(cur));
				hit.param.value = opts[(idx + 1) % opts.length];
				persist();
				return true;
			}
			if (hit.kind === "string") {
				openOverlayInput({
					node: this,
					box: hit.box,
					value: hit.param.value ?? "",
					onCommit: (text) => {
						hit.param.value = text;
						persist();
					},
				});
				return true;
			}
		}
		return r ?? false;
	};

	const origMouseMove = node.onMouseMove;
	node.onMouseMove = function (e, localPos) {
		if (drag) {
			setSliderFromX(drag.param, drag.meta, localPos[0]);
			return true;
		}
		return origMouseMove?.apply(this, arguments) ?? false;
	};

	const origMouseUp = node.onMouseUp;
	node.onMouseUp = function () {
		if (drag) {
			drag = null;
			persist();
			return true;
		}
		return origMouseUp?.apply(this, arguments) ?? false;
	};

	const origConfigure = node.onConfigure;
	node.onConfigure = function () {
		const r = origConfigure?.apply(this, arguments);
		setTimeout(() => {
			loadParametersFromWidget(this);
			stripLegacyJsonUi(this);
			hideAllNativeWidgets(this);
			applySize();
			this.setDirtyCanvas?.(true, true);
		}, 0);
		return r;
	};

	node.computeSize = function () {
		const params = ensureParameters(this);
		return [Math.max(this.size?.[0] || MIN_W, MIN_W), contentHeight(params)];
	};

	const origResize = node.onResize;
	node.onResize = function (size) {
		if (size) {
			const params = ensureParameters(this);
			size[0] = Math.max(size[0], MIN_W);
			size[1] = Math.max(size[1], contentHeight(params));
		}
		return origResize?.apply(this, arguments);
	};

	// Sidebar / external edits → redraw + resize
	node._aaalicePcpRedraw = () => {
		loadParametersFromWidget(node);
		stripLegacyJsonUi(node);
		hideAllNativeWidgets(node);
		applySize();
		node.setDirtyCanvas?.(true, true);
	};

	const onEv = (e) => {
		if (e.detail?.nodeId != null && String(e.detail.nodeId) !== String(node.id)) {
			return;
		}
		node._aaalicePcpRedraw?.();
	};
	window.addEventListener(EVENT_PCP_CHANGED, onEv);
	window.addEventListener(EVENT_PCP_LIST, onEv);

	const prevRemove = node.onRemoved;
	node.onRemoved = function () {
		window.removeEventListener(EVENT_PCP_CHANGED, onEv);
		window.removeEventListener(EVENT_PCP_LIST, onEv);
		if (this._aaaliceOverlayInput) {
			try {
				this._aaaliceOverlayInput.remove();
			} catch {
				/* ignore */
			}
			this._aaaliceOverlayInput = null;
		}
		return prevRemove?.apply(this, arguments);
	};

	syncParametersToWidget(node);
	applySize();
	ensureI18nReady()
		.then(() => {
			node.setDirtyCanvas?.(true, true);
		})
		.catch(() => {});

	console.log("[Aaalice] PCP canvas surface ready", {
		id: node.id,
		comfyClass: node.comfyClass,
		type: node.type,
	});
}

function installPromptHook() {
	if (app._aaalicePcpPromptHook) return;
	app._aaalicePcpPromptHook = true;
	const orig = app.graphToPrompt?.bind(app);
	if (typeof orig !== "function") {
		console.warn("[Aaalice] graphToPrompt missing");
		return;
	}
	app.graphToPrompt = async function (...args) {
		const nodes = (app.graph?._nodes || []).filter(isPcp);
		for (const n of nodes) {
			loadParametersFromWidget(n);
			syncParametersToWidget(n);
		}
		const result = await orig(...args);
		const out = result?.output ?? result;
		if (out && typeof out === "object") {
			for (const n of nodes) {
				const e = out[String(n.id)];
				if (!e) continue;
				if (!e.inputs) e.inputs = {};
				e.inputs.parameters_json = JSON.stringify(ensureParameters(n));
			}
		}
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaalicePcpHooked) return;
	nodeType.__aaalicePcpHooked = true;
	const prev = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const r = prev?.apply(this, arguments);
		// Canvas hooks do not need graph for registerWidget; still defer one tick
		// so size/widgets from schema settle first.
		requestAnimationFrame(() => setupPcpNode(this));
		setTimeout(() => setupPcpNode(this), 0);
		return r;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterControlPanel",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== NODE) return;
		hookPrototype(nodeType);
	},

	nodeCreated(node) {
		if (!isPcp(node)) return;
		setupPcpNode(node);
	},

	loadedGraphNode(node) {
		if (!isPcp(node)) return;
		setupPcpNode(node);
		node._aaalicePcpRedraw?.();
	},

	async setup() {
		installPromptHook();
		const types = globalThis.LiteGraph?.registered_node_types || {};
		for (const [k, v] of Object.entries(types)) {
			if (k === NODE || v?.comfyClass === NODE) hookPrototype(v);
		}
		for (const n of app.graph?._nodes || []) {
			if (isPcp(n)) {
				setupPcpNode(n);
				n._aaalicePcpRedraw?.();
			}
		}
		console.log("[Aaalice] PCP canvas extension setup done");
	},
});
