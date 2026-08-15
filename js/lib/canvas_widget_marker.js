function restoreProperty(object, name, descriptor) {
	try {
		if (descriptor) Object.defineProperty(object, name, descriptor);
		else delete object[name];
	} catch {
		// Another extension may replace the widget method while it is marked.
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

function drawFallbackOutline(ctx, width, y, height, color) {
	if (!ctx || !Number.isFinite(width) || !Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return;
	const margin = 15;
	const outlineWidth = Math.max(0, width - margin * 2);
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	if (typeof ctx.roundRect === "function") ctx.roundRect(margin, y, outlineWidth, height, Math.min(6, height / 2));
	else ctx.rect(margin, y, outlineWidth, height);
	ctx.stroke();
	ctx.restore();
}

export function createCanvasWidgetMarkerManager(color) {
	const markers = new WeakMap();
	const activeWidgets = new Set();

	function uninstall(widget) {
		const state = markers.get(widget);
		if (!state) return;
		for (let index = state.properties.length - 1; index >= 0; index--) {
			const entry = state.properties[index];
			if (widget[entry.name] === entry.value) restoreProperty(widget, entry.name, entry.descriptor);
		}
		markers.delete(widget);
		activeWidgets.delete(widget);
	}

	function install(widget) {
		if (!widget || (typeof widget !== "object" && typeof widget !== "function")) return false;
		const existing = markers.get(widget);
		if (existing) {
			const intact = existing.properties.length > 0 && existing.properties.every((entry) => widget[entry.name] === entry.value);
			if (intact) return false;
			uninstall(widget);
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
				drawFallbackOutline(args[0], Number(args[2]), Number(args[3]), Number(args[4]), color);
				return result;
			};
			installed = installProperty(widget, "draw", wrapper, state) || installed;
		} else if (!installed && typeof widget.drawWidget === "function") {
			const original = widget.drawWidget;
			const wrapper = function (ctx, options = {}) {
				const result = original.apply(this, arguments);
				drawFallbackOutline(ctx, Number(options.width), Number(widget.y), Number(widget.computedHeight ?? widget.height), color);
				return result;
			};
			installed = installProperty(widget, "drawWidget", wrapper, state) || installed;
		}

		if (!installed && "outline_color" in widget) {
			installed = installProperty(widget, "outline_color", color, state) || installed;
		}
		if (!installed) return false;
		markers.set(widget, state);
		activeWidgets.add(widget);
		return true;
	}

	return {
		sync(widgets) {
			let changed = false;
			for (const widget of activeWidgets) {
				if (!widgets.has(widget)) {
					uninstall(widget);
					changed = true;
				}
			}
			for (const widget of widgets) changed = install(widget) || changed;
			return changed;
		},
		reset() {
			const changed = activeWidgets.size > 0;
			for (const widget of [...activeWidgets]) uninstall(widget);
			return changed;
		},
	};
}
