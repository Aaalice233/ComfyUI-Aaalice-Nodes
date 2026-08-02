/** Zoom and pan behavior for the Discord share image viewport. */
import { el, iconButton } from "./ui.js";

export function createShareImageViewer(viewport, image, { label }) {
	const MIN_SCALE = 1;
	const MAX_SCALE = 8;
	const BUTTON_STEP = 1.35;
	let scale = MIN_SCALE;
	let offsetX = 0;
	let offsetY = 0;
	let activePointer = null;
	let dragX = 0;
	let dragY = 0;
	let zoomOut = null;
	let zoomIn = null;

	const zoomValue = el("output", {
		className: "aa-discord-share-picker__zoom-value",
		attrs: { "aria-live": "polite" },
	}, "100%");

	function clampOffsets() {
		if (!viewport.clientWidth || !viewport.clientHeight || !image.naturalWidth || !image.naturalHeight || scale <= MIN_SCALE) {
			offsetX = 0;
			offsetY = 0;
			return;
		}
		const fittedScale = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
		const maxX = Math.max(0, (image.naturalWidth * fittedScale * scale - viewport.clientWidth) / 2);
		const maxY = Math.max(0, (image.naturalHeight * fittedScale * scale - viewport.clientHeight) / 2);
		offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
		offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
	}

	function render() {
		clampOffsets();
		image.style.setProperty("--aa-discord-share-zoom", String(scale));
		image.style.setProperty("--aa-discord-share-pan-x", `${offsetX}px`);
		image.style.setProperty("--aa-discord-share-pan-y", `${offsetY}px`);
		viewport.classList.toggle("is-zoomed", scale > MIN_SCALE);
		zoomValue.value = `${Math.round(scale * 100)}%`;
		zoomValue.textContent = zoomValue.value;
		if (zoomOut) zoomOut.disabled = scale <= MIN_SCALE;
		if (zoomIn) zoomIn.disabled = scale >= MAX_SCALE;
	}

	function setScale(nextScale, clientX = null, clientY = null) {
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
		if (next === scale) return;
		const rect = viewport.getBoundingClientRect();
		const pointerX = (clientX ?? (rect.left + rect.width / 2)) - rect.left - rect.width / 2;
		const pointerY = (clientY ?? (rect.top + rect.height / 2)) - rect.top - rect.height / 2;
		const ratio = next / scale;
		offsetX = pointerX - (pointerX - offsetX) * ratio;
		offsetY = pointerY - (pointerY - offsetY) * ratio;
		scale = next;
		render();
	}

	function reset() {
		scale = MIN_SCALE;
		offsetX = 0;
		offsetY = 0;
		render();
	}

	zoomOut = iconButton({
		iconName: "zoomOut",
		label: label("picker.zoomOut", "Zoom out"),
		variant: "ghost",
		onClick: () => setScale(scale / BUTTON_STEP),
	});
	const fit = iconButton({
		iconName: "fit",
		label: label("picker.resetView", "Fit to screen"),
		variant: "ghost",
		onClick: reset,
	});
	zoomIn = iconButton({
		iconName: "zoomIn",
		label: label("picker.zoomIn", "Zoom in"),
		variant: "ghost",
		onClick: () => setScale(scale * BUTTON_STEP),
	});
	const controls = el("div", {
		className: "aa-discord-share-picker__viewer-controls",
		attrs: { role: "group", "aria-label": label("picker.viewerControls", "Image view controls") },
		children: [zoomOut, zoomValue, fit, zoomIn],
	});
	viewport.append(controls);

	viewport.addEventListener("wheel", (event) => {
		event.preventDefault();
		setScale(scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
	}, { passive: false });
	viewport.addEventListener("pointerdown", (event) => {
		viewport.focus({ preventScroll: true });
		if (event.button !== 0 || scale <= MIN_SCALE || event.target.closest?.(".aa-discord-share-picker__viewer-controls")) return;
		event.preventDefault();
		activePointer = event.pointerId;
		dragX = event.clientX - offsetX;
		dragY = event.clientY - offsetY;
		viewport.setPointerCapture(event.pointerId);
		viewport.classList.add("is-dragging");
	});
	viewport.addEventListener("pointermove", (event) => {
		if (event.pointerId !== activePointer) return;
		offsetX = event.clientX - dragX;
		offsetY = event.clientY - dragY;
		render();
	});
	const endDrag = (event) => {
		if (event.pointerId !== activePointer) return;
		activePointer = null;
		viewport.classList.remove("is-dragging");
		if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
	};
	viewport.addEventListener("pointerup", endDrag);
	viewport.addEventListener("pointercancel", endDrag);
	viewport.addEventListener("dblclick", reset);
	viewport.addEventListener("keydown", (event) => {
		if (event.target !== viewport) return;
		if (["+", "="].includes(event.key)) {
			event.preventDefault();
			setScale(scale * BUTTON_STEP);
			return;
		}
		if (event.key === "-") {
			event.preventDefault();
			setScale(scale / BUTTON_STEP);
			return;
		}
		if (event.key === "0") {
			event.preventDefault();
			reset();
			return;
		}
		const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
		if (!movement || scale <= MIN_SCALE) return;
		event.preventDefault();
		offsetX += movement[0];
		offsetY += movement[1];
		render();
	});
	image.addEventListener("load", render);
	image.draggable = false;
	const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(render) : null;
	resizeObserver?.observe(viewport);
	render();

	return {
		reset,
		destroy() {
			resizeObserver?.disconnect();
			if (activePointer !== null && viewport.hasPointerCapture(activePointer)) viewport.releasePointerCapture(activePointer);
			activePointer = null;
		},
	};
}
