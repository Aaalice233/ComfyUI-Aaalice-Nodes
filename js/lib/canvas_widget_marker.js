function restoreProperty(object, name, descriptor) {
	try {
		if (descriptor) Object.defineProperty(object, name, descriptor);
		else delete object[name];
	} catch {
		// Another extension may replace the marked method before the next structure sync.
	}
}

function installProperty(object, name, value, state) {
	const descriptor = Object.getOwnPropertyDescriptor(object, name);
	try {
		Object.defineProperty(object, name, {
			configurable: true,
			enumerable: descriptor?.enumerable ?? false,
			writable: true,
			value,
		});
		state.properties.push({ name, descriptor, value });
		return true;
	} catch {
		return false;
	}
}

function positiveNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

function drawFallbackOutline(ctx, widget, width, y, height, color) {
	if (!ctx || !Number.isFinite(width) || !Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return;
	const widgetMargin = Number(widget?.margin);
	const isLayoutBacked = Number.isFinite(widgetMargin) && widgetMargin >= 0;
	const margin = isLayoutBacked ? widgetMargin : 15;
	const layoutHeight = isLayoutBacked ? positiveNumber(widget.computedHeight, height) : height;
	const outlineY = isLayoutBacked ? y + margin : y;
	const outlineWidth = Math.max(0, width - margin * 2);
	const outlineHeight = Math.max(0, layoutHeight - (isLayoutBacked ? margin * 2 : 0));
	if (outlineWidth <= 0 || outlineHeight <= 0) return;
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	if (typeof ctx.roundRect === "function") ctx.roundRect(margin, outlineY, outlineWidth, outlineHeight, Math.min(6, outlineHeight / 2));
	else ctx.rect(margin, outlineY, outlineWidth, outlineHeight);
	ctx.stroke();
	ctx.restore();
}

function sameWidgetSet(left, right) {
	if (left.size !== right.size) return false;
	for (const widget of left) if (!right.has(widget)) return false;
	return true;
}

function markerIntact(object, state) {
	return state.properties.length > 0 && state.properties.every((entry) => object[entry.name] === entry.value);
}

export function createCanvasWidgetMarkerManager(color) {
	const widgetMarkers = new WeakMap();
	const activeWidgets = new Set();
	const nodeMarkers = new WeakMap();
	const activeNodes = new Set();

	function uninstallWidget(widget) {
		const state = widgetMarkers.get(widget);
		if (!state) return;
		for (let index = state.properties.length - 1; index >= 0; index--) {
			const entry = state.properties[index];
			if (widget[entry.name] === entry.value) restoreProperty(widget, entry.name, entry.descriptor);
		}
		widgetMarkers.delete(widget);
		activeWidgets.delete(widget);
	}

	function installWidget(widget) {
		if (!widget || (typeof widget !== "object" && typeof widget !== "function")) return false;
		const existing = widgetMarkers.get(widget);
		if (existing) {
			if (markerIntact(widget, existing)) return false;
			uninstallWidget(widget);
		}

		const state = { properties: [] };
		let installed = false;
		if (typeof widget.getOutlineColor === "function") {
			installed = installProperty(widget, "getOutlineColor", function () { return color; }, state) || installed;
		}

		// Legacy/custom widgets own their draw path and may ignore getOutlineColor.
		// Draw the marker after them even when the modern color hook also exists.
		if (typeof widget.draw === "function") {
			const original = widget.draw;
			const wrapper = function (...args) {
				const result = original.apply(this, args);
				drawFallbackOutline(args[0], widget, Number(args[2]), Number(args[3]), Number(args[4]), color);
				return result;
			};
			installed = installProperty(widget, "draw", wrapper, state) || installed;
		} else if (!installed && typeof widget.drawWidget === "function") {
			const original = widget.drawWidget;
			const wrapper = function (ctx, options = {}) {
				const result = original.apply(this, arguments);
				drawFallbackOutline(ctx, widget, Number(options.width), Number(widget.y), Number(widget.height), color);
				return result;
			};
			installed = installProperty(widget, "drawWidget", wrapper, state) || installed;
		}

		if (!installed && "outline_color" in widget) {
			installed = installProperty(widget, "outline_color", color, state) || installed;
		}
		if (!installed) return false;
		widgetMarkers.set(widget, state);
		activeWidgets.add(widget);
		return true;
	}

	function drawProjectedWidgets(ctx, node, widgets) {
		const fallbackHeight = positiveNumber(globalThis.LiteGraph?.NODE_WIDGET_HEIGHT, 20);
		for (const widget of widgets) {
			if (typeof node.isWidgetVisible === "function" && !node.isWidgetVisible(widget)) continue;
			const width = positiveNumber(widget.width, positiveNumber(node.size?.[0], 0));
			const height = positiveNumber(widget.height, fallbackHeight);
			drawFallbackOutline(ctx, widget, width, Number(widget.y), height, color);
		}
	}

	function uninstallNode(node) {
		const state = nodeMarkers.get(node);
		if (!state) return;
		for (let index = state.properties.length - 1; index >= 0; index--) {
			const entry = state.properties[index];
			if (node[entry.name] === entry.value) restoreProperty(node, entry.name, entry.descriptor);
		}
		nodeMarkers.delete(node);
		activeNodes.delete(node);
	}

	function installNode(node, widgets) {
		const existing = nodeMarkers.get(node);
		if (existing) {
			if (markerIntact(node, existing)) {
				if (sameWidgetSet(existing.widgets, widgets)) return false;
				existing.widgets = new Set(widgets);
				return true;
			}
			uninstallNode(node);
		}
		if (typeof node?.drawWidgets !== "function") return false;
		const original = node.drawWidgets;
		const state = { properties: [], widgets: new Set(widgets) };
		const wrapper = function (...args) {
			const result = original.apply(this, args);
			drawProjectedWidgets(args[0], this, state.widgets);
			return result;
		};
		if (!installProperty(node, "drawWidgets", wrapper, state)) return false;
		nodeMarkers.set(node, state);
		activeNodes.add(node);
		return true;
	}

	return {
		sync(targetsByNode) {
			let changed = false;
			const nextWidgets = new Set();
			for (const widgets of targetsByNode.values()) {
				for (const widget of widgets) nextWidgets.add(widget);
			}
			for (const widget of activeWidgets) {
				if (!nextWidgets.has(widget)) {
					uninstallWidget(widget);
					changed = true;
				}
			}
			for (const widget of nextWidgets) changed = installWidget(widget) || changed;

			const fallbackTargets = new Map();
			for (const [node, widgets] of targetsByNode) {
				for (const widget of widgets) {
					if (widgetMarkers.has(widget)) continue;
					let targets = fallbackTargets.get(node);
					if (!targets) {
						targets = new Set();
						fallbackTargets.set(node, targets);
					}
					targets.add(widget);
				}
			}
			for (const node of activeNodes) {
				if (!fallbackTargets.has(node)) {
					uninstallNode(node);
					changed = true;
				}
			}
			for (const [node, widgets] of fallbackTargets) changed = installNode(node, widgets) || changed;
			return changed;
		},
		reset() {
			const changed = activeWidgets.size > 0 || activeNodes.size > 0;
			for (const widget of [...activeWidgets]) uninstallWidget(widget);
			for (const node of [...activeNodes]) uninstallNode(node);
			return changed;
		},
	};
}
