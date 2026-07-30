/** Read-only batch preview for ComfyUI's built-in PreviewImage execution output. */

import { createDialog, el, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function normalizedImages(value) {
	return (Array.isArray(value) ? value : []).filter((url) => typeof url === "string" && url);
}

export function renderImageOutputControl(spec) {
	let images = normalizedImages(spec.value);
	let index = 0;
	let viewer = null;
	const root = el("div", "aa-control aa-image-output");
	const viewport = el("div", {
		className: "aa-image-output__viewport",
		attrs: { tabindex: "0", role: "button", "aria-haspopup": "dialog", "aria-label": spec.labels.open || "Open full-screen image preview" },
	});
	const image = el("img", { className: "aa-image-output__image", attrs: { alt: spec.label || "Image preview", draggable: "false" } });
	image.draggable = false;
	const empty = el("p", { className: "aa-image-output__empty", attrs: { role: "status" } }, spec.labels.empty || "Run the workflow to preview images");
	const count = el("span", "aa-image-output__count");
	const previous = iconButton({ iconName: "arrowRight", label: spec.labels.previous || "Previous image", variant: "ghost", className: "aa-image-output__previous" });
	const next = iconButton({ iconName: "arrowRight", label: spec.labels.next || "Next image", variant: "ghost" });
	const expand = iconButton({ iconName: "fit", label: spec.labels.open || "Open full-screen image preview", variant: "ghost", className: "aa-image-output__expand" });
	const toolbar = el("div", { className: "aa-image-output__toolbar", children: [previous, count, next, expand] });

	function currentUrl() { return images[index] || ""; }
	function move(step) {
		if (images.length < 2) return;
		index = (index + step + images.length) % images.length;
		update();
	}
	function update() {
		if (index >= images.length) index = Math.max(0, images.length - 1);
		const url = currentUrl();
		if (url) image.src = url; else image.removeAttribute("src");
		image.hidden = !url;
		empty.hidden = Boolean(url);
		count.textContent = images.length ? `${index + 1} / ${images.length}` : "—";
		previous.disabled = images.length < 2;
		next.disabled = images.length < 2;
		expand.disabled = !url;
		viewer?.updateImage();
	}

	function openViewer() {
		if (viewer || !currentUrl()) {
			viewer?.dialog.focus({ preventScroll: true });
			return;
		}
		let zoom = MIN_ZOOM;
		let panX = 0;
		let panY = 0;
		let gesture = null;
		let zoomOut = null;
		let zoomIn = null;
		const stage = el("div", {
			className: "aa-image-output-viewer__stage",
			attrs: { tabindex: "0", "aria-label": spec.labels.viewer || "Full-screen image preview. Scroll to zoom, drag enlarged images to move, and double-click to reset." },
		});
		const viewerImage = el("img", { className: "aa-image-output-viewer__image", attrs: { alt: spec.label || "Image preview", draggable: "false" } });
		viewerImage.draggable = false;
		const viewerCount = el("span", "aa-image-output__count");
		const scale = el("output", { className: "aa-image-output-viewer__scale", attrs: { "aria-live": "polite" } }, "100%");

		function clampPan() {
			if (zoom <= MIN_ZOOM || !stage.clientWidth || !stage.clientHeight || !viewerImage.naturalWidth || !viewerImage.naturalHeight) {
				panX = 0; panY = 0; return;
			}
			const fittedScale = Math.min(stage.clientWidth / viewerImage.naturalWidth, stage.clientHeight / viewerImage.naturalHeight);
			const maxX = Math.max(0, (viewerImage.naturalWidth * fittedScale * zoom - stage.clientWidth) / 2);
			const maxY = Math.max(0, (viewerImage.naturalHeight * fittedScale * zoom - stage.clientHeight) / 2);
			panX = Math.max(-maxX, Math.min(maxX, panX));
			panY = Math.max(-maxY, Math.min(maxY, panY));
		}
		function updateTransform() {
			clampPan();
			stage.style.setProperty("--aa-image-output-zoom", String(zoom));
			stage.style.setProperty("--aa-image-output-pan-x", `${panX}px`);
			stage.style.setProperty("--aa-image-output-pan-y", `${panY}px`);
			stage.dataset.pannable = String(zoom > MIN_ZOOM);
			scale.value = `${Math.round(zoom * 100)}%`;
			scale.textContent = scale.value;
			if (zoomOut) zoomOut.disabled = zoom <= MIN_ZOOM;
			if (zoomIn) zoomIn.disabled = zoom >= MAX_ZOOM;
		}
		function setZoom(nextZoom, clientX = null, clientY = null) {
			const normalized = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
			if (normalized === zoom) return;
			const rect = stage.getBoundingClientRect();
			if (clientX != null && clientY != null && rect.width && rect.height) {
				const offsetX = clientX - rect.left - rect.width / 2;
				const offsetY = clientY - rect.top - rect.height / 2;
				panX = offsetX - ((offsetX - panX) / zoom) * normalized;
				panY = offsetY - ((offsetY - panY) / zoom) * normalized;
			}
			zoom = normalized;
			updateTransform();
		}
		function resetZoom() { zoom = MIN_ZOOM; panX = 0; panY = 0; updateTransform(); }
		function updateViewerImage() {
			const url = currentUrl();
			if (url) viewerImage.src = url; else viewerImage.removeAttribute("src");
			viewerCount.textContent = images.length ? `${index + 1} / ${images.length}` : "—";
			resetZoom();
		}

		stage.addEventListener("dragstart", (event) => event.preventDefault());
		stage.addEventListener("pointerdown", (event) => {
			if (event.button !== 0 || zoom <= MIN_ZOOM) return;
			stage.focus({ preventScroll: true });
			gesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, panX, panY };
			stage.classList.add("is-panning");
			stage.setPointerCapture?.(event.pointerId);
		});
		stage.addEventListener("pointermove", (event) => {
			if (!gesture || gesture.pointerId !== event.pointerId) return;
			panX = gesture.panX + event.clientX - gesture.clientX;
			panY = gesture.panY + event.clientY - gesture.clientY;
			updateTransform();
		});
		const finishGesture = (event) => {
			if (!gesture || gesture.pointerId !== event.pointerId) return;
			if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
			stage.classList.remove("is-panning");
			gesture = null;
		};
		stage.addEventListener("pointerup", finishGesture);
		stage.addEventListener("pointercancel", finishGesture);
		stage.addEventListener("wheel", (event) => {
			event.preventDefault();
			setZoom(zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
		}, { passive: false });
		stage.addEventListener("dblclick", resetZoom);
		stage.addEventListener("keydown", (event) => {
			if ([",", "."].includes(event.key) && images.length > 1) { event.preventDefault(); move(event.key === "," ? -1 : 1); return; }
			if (["+", "="].includes(event.key)) { event.preventDefault(); setZoom(zoom * 1.35); return; }
			if (event.key === "-") { event.preventDefault(); setZoom(zoom / 1.35); return; }
			if (event.key === "0") { event.preventDefault(); resetZoom(); return; }
			const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
			if (!movement || zoom <= MIN_ZOOM) return;
			event.preventDefault();
			panX += movement[0]; panY += movement[1]; updateTransform();
		});
		viewerImage.addEventListener("load", updateTransform);
		zoomOut = iconButton({ iconName: "zoomOut", label: spec.labels.zoomOut || "Zoom out", variant: "ghost", onClick: () => setZoom(zoom / 1.35) });
		zoomIn = iconButton({ iconName: "zoomIn", label: spec.labels.zoomIn || "Zoom in", variant: "ghost", onClick: () => setZoom(zoom * 1.35) });
		const viewerToolbar = el("div", { className: "aa-image-output-viewer__toolbar", children: [
			iconButton({ iconName: "arrowRight", label: spec.labels.previous || "Previous image", variant: "ghost", className: "aa-image-output__previous", disabled: images.length < 2, onClick: () => move(-1) }),
			viewerCount,
			iconButton({ iconName: "arrowRight", label: spec.labels.next || "Next image", variant: "ghost", disabled: images.length < 2, onClick: () => move(1) }),
			el("div", { className: "aa-image-output-viewer__zoom", children: [zoomOut, scale, zoomIn, iconButton({ iconName: "fit", label: spec.labels.fit || "Fit to screen", variant: "ghost", onClick: resetZoom })] }),
		] });
		stage.append(viewerImage);
		const body = el("div", { className: "aa-image-output-viewer", children: [stage, viewerToolbar] });
		const dialog = createDialog({ title: spec.labels.title || "Image preview", body, size: "lg", className: "aa-image-output-dialog", confirmOnEnter: false, onClose: () => { viewer = null; } });
		dialog.overlay.classList.add("aa-image-output-viewer-backdrop");
		dialog.header.append(iconButton({ iconName: "close", label: spec.labels.close || "Close full-screen image preview", variant: "ghost", onClick: () => dialog.requestClose(null) }));
		viewer = { dialog: dialog.dialog, requestClose: dialog.requestClose, updateImage: updateViewerImage };
		updateViewerImage();
	}

	previous.addEventListener("click", (event) => { event.stopPropagation(); move(-1); });
	next.addEventListener("click", (event) => { event.stopPropagation(); move(1); });
	expand.addEventListener("click", (event) => { event.stopPropagation(); openViewer(); });
	viewport.addEventListener("click", openViewer);
	viewport.addEventListener("dragstart", (event) => event.preventDefault());
	viewport.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openViewer(); return; }
		if (!["ArrowLeft", "ArrowRight"].includes(event.key) || images.length < 2) return;
		event.preventDefault();
		move(event.key === "ArrowLeft" ? -1 : 1);
	});
	viewport.append(image, empty, toolbar);
	root.append(viewport);
	update();
	return controlView({
		root,
		kind: "image-output",
		update: (nextSpec) => { images = normalizedImages(nextSpec.value); update(); },
		destroy: () => viewer?.requestClose(null),
	});
}
