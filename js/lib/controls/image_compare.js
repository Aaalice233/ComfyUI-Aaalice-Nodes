/** Read-only projection of ComfyUI's native ImageCompare execution view. */

import { createDialog, el, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function imageUrls(value, key) {
	return (Array.isArray(value?.[key]) ? value[key] : []).filter((url) => typeof url === "string" && url);
}

export function renderImageCompareControl(spec) {
	const beforeImages = imageUrls(spec.value, "beforeImages");
	const afterImages = imageUrls(spec.value, "afterImages");
	let beforeIndex = 0; let afterIndex = 0; let position = 50;
	let viewer = null;
	let previewPointerStart = null;
	let previewPointerMoved = false;
	const root = el("div", "aa-control aa-image-compare");
	const viewport = el("div", { className: "aa-image-compare__viewport", attrs: { role: "slider", tabindex: "0", "aria-label": spec.labels.slider || "Comparison position", "aria-haspopup": "dialog", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" } });
	const after = el("img", { className: "aa-image-compare__image is-after", attrs: { alt: spec.labels.after || "Image B", draggable: "false" } });
	const before = el("img", { className: "aa-image-compare__image is-before", attrs: { alt: spec.labels.before || "Image A", draggable: "false" } });
	after.draggable = false;
	before.draggable = false;
	const divider = el("span", { className: "aa-image-compare__divider", attrs: { "aria-hidden": "true" } });
	const empty = el("p", { className: "aa-image-compare__empty", attrs: { role: "status" } }, spec.labels.empty || "Run the workflow to compare images");
	const expand = iconButton({ iconName: "fit", label: spec.labels.open || "Open full-screen comparison", variant: "ghost", className: "aa-image-compare__expand" });
	const counter = (label, index, total) => `${label} ${total ? `${index + 1}/${total}` : "—"}`;
	const nav = el("div", "aa-image-compare__nav");

	function updatePosition(next) {
		position = Math.max(0, Math.min(100, next));
		root.style.setProperty("--aa-image-compare-position", `${position}%`);
		viewport.setAttribute("aria-valuenow", String(Math.round(position)));
		viewer?.updatePosition();
	}
	function updateImages() {
		const beforeUrl = beforeImages[beforeIndex] || ""; const afterUrl = afterImages[afterIndex] || "";
		if (beforeUrl) before.src = beforeUrl; else before.removeAttribute("src");
		if (afterUrl) after.src = afterUrl; else after.removeAttribute("src");
		before.hidden = !beforeUrl; after.hidden = !afterUrl; empty.hidden = Boolean(beforeUrl || afterUrl);
		nav.replaceChildren(
			el("div", { className: "aa-image-compare__nav-group", children: [
				iconButton({ iconName: "arrowRight", label: spec.labels.previousBefore || "Previous Image A", variant: "ghost", className: "aa-image-compare__previous", disabled: beforeImages.length < 2, onClick: () => { beforeIndex = (beforeIndex - 1 + beforeImages.length) % beforeImages.length; updateImages(); } }),
				el("span", "aa-image-compare__counter", counter(spec.labels.before || "Image A", beforeIndex, beforeImages.length)),
				iconButton({ iconName: "arrowRight", label: spec.labels.nextBefore || "Next Image A", variant: "ghost", disabled: beforeImages.length < 2, onClick: () => { beforeIndex = (beforeIndex + 1) % beforeImages.length; updateImages(); } }),
			] }),
			el("div", { className: "aa-image-compare__nav-group", children: [
				iconButton({ iconName: "arrowRight", label: spec.labels.previousAfter || "Previous Image B", variant: "ghost", className: "aa-image-compare__previous", disabled: afterImages.length < 2, onClick: () => { afterIndex = (afterIndex - 1 + afterImages.length) % afterImages.length; updateImages(); } }),
				el("span", "aa-image-compare__counter", counter(spec.labels.after || "Image B", afterIndex, afterImages.length)),
				iconButton({ iconName: "arrowRight", label: spec.labels.nextAfter || "Next Image B", variant: "ghost", disabled: afterImages.length < 2, onClick: () => { afterIndex = (afterIndex + 1) % afterImages.length; updateImages(); } }),
			] }),
		);
		expand.disabled = !beforeUrl && !afterUrl;
		viewer?.updateImages();
	}
	function pointerPosition(event) {
		const rect = viewport.getBoundingClientRect();
		if (rect.width) updatePosition(((event.clientX - rect.left) / rect.width) * 100);
	}

	function openViewer() {
		if (viewer || (!beforeImages[beforeIndex] && !afterImages[afterIndex])) {
			viewer?.dialog.focus({ preventScroll: true });
			return;
		}
		let zoom = 1;
		let panX = 0;
		let panY = 0;
		let gesture = null;
		let zoomOut = null;
		let zoomIn = null;
		const stage = el("div", {
			className: "aa-image-compare-viewer__stage",
			attrs: { tabindex: "0", "aria-label": spec.labels.viewer || "Full-screen image comparison. Move the pointer to compare, scroll to zoom, drag enlarged images to move, and double-click to reset." },
		});
		const viewerAfter = el("img", { className: "aa-image-compare-viewer__image", attrs: { alt: spec.labels.after || "Image B", draggable: "false" } });
		const viewerBefore = el("img", { className: "aa-image-compare-viewer__image", attrs: { alt: spec.labels.before || "Image A", draggable: "false" } });
		viewerAfter.draggable = false;
		viewerBefore.draggable = false;
		const afterLayer = el("div", { className: "aa-image-compare-viewer__layer is-after", children: [viewerAfter] });
		const beforeLayer = el("div", { className: "aa-image-compare-viewer__layer is-before", children: [viewerBefore] });
		const viewerDivider = el("div", {
			className: "aa-image-compare-viewer__divider",
			attrs: { "aria-hidden": "true" },
		});
		const scale = el("output", { className: "aa-image-compare-viewer__scale", attrs: { "aria-live": "polite" } }, "100%");
		const beforeCounter = el("span", "aa-image-compare__counter");
		const afterCounter = el("span", "aa-image-compare__counter");

		function clampPan() {
			const width = stage.clientWidth;
			const height = stage.clientHeight;
			if (!width || !height || zoom <= MIN_ZOOM) { panX = 0; panY = 0; return; }
			const fittedSizes = [viewerBefore, viewerAfter].filter((image) => image.naturalWidth && image.naturalHeight).map((image) => {
				const fittedScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
				return { width: image.naturalWidth * fittedScale, height: image.naturalHeight * fittedScale };
			});
			const maxX = Math.max(0, ...fittedSizes.map((size) => (size.width * zoom - width) / 2));
			const maxY = Math.max(0, ...fittedSizes.map((size) => (size.height * zoom - height) / 2));
			panX = Math.max(-maxX, Math.min(maxX, panX));
			panY = Math.max(-maxY, Math.min(maxY, panY));
		}
		function updateTransform() {
			clampPan();
			stage.style.setProperty("--aa-image-compare-zoom", String(zoom));
			stage.style.setProperty("--aa-image-compare-pan-x", `${panX}px`);
			stage.style.setProperty("--aa-image-compare-pan-y", `${panY}px`);
			stage.dataset.pannable = String(zoom > MIN_ZOOM);
			scale.value = `${Math.round(zoom * 100)}%`;
			scale.textContent = scale.value;
			if (zoomOut) zoomOut.disabled = zoom <= MIN_ZOOM;
			if (zoomIn) zoomIn.disabled = zoom >= MAX_ZOOM;
		}
		function setZoom(next, clientX = null, clientY = null) {
			const normalized = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
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
		function resetZoom() {
			zoom = MIN_ZOOM; panX = 0; panY = 0; updateTransform();
		}
		function updateViewerPosition() {
			stage.style.setProperty("--aa-image-compare-position", `${position}%`);
		}
		function setPositionFromPointer(event) {
			const rect = stage.getBoundingClientRect();
			if (rect.width) updatePosition(((event.clientX - rect.left) / rect.width) * 100);
		}
		function updateViewerImages() {
			const beforeUrl = beforeImages[beforeIndex] || "";
			const afterUrl = afterImages[afterIndex] || "";
			if (beforeUrl) viewerBefore.src = beforeUrl; else viewerBefore.removeAttribute("src");
			if (afterUrl) viewerAfter.src = afterUrl; else viewerAfter.removeAttribute("src");
			beforeLayer.hidden = !beforeUrl; afterLayer.hidden = !afterUrl;
			beforeCounter.textContent = counter(spec.labels.before || "Image A", beforeIndex, beforeImages.length);
			afterCounter.textContent = counter(spec.labels.after || "Image B", afterIndex, afterImages.length);
		}
		function navigationGroup(labelElement, images, direction) {
			return el("div", { className: `aa-image-compare-viewer__nav-group is-${direction}`, children: [
				iconButton({ iconName: "arrowRight", label: direction === "before" ? (spec.labels.previousBefore || "Previous Image A") : (spec.labels.previousAfter || "Previous Image B"), variant: "ghost", className: "aa-image-compare__previous", disabled: images.length < 2, onClick: () => {
					if (direction === "before") beforeIndex = (beforeIndex - 1 + beforeImages.length) % beforeImages.length;
					else afterIndex = (afterIndex - 1 + afterImages.length) % afterImages.length;
					updateImages();
				} }),
				labelElement,
				iconButton({ iconName: "arrowRight", label: direction === "before" ? (spec.labels.nextBefore || "Next Image A") : (spec.labels.nextAfter || "Next Image B"), variant: "ghost", disabled: images.length < 2, onClick: () => {
					if (direction === "before") beforeIndex = (beforeIndex + 1) % beforeImages.length;
					else afterIndex = (afterIndex + 1) % afterImages.length;
					updateImages();
				} }),
			] });
		}

		stage.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			stage.focus({ preventScroll: true });
			if (zoom <= MIN_ZOOM) {
				gesture = { mode: "compare", pointerId: event.pointerId };
				setPositionFromPointer(event);
			} else {
				gesture = { mode: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, panX, panY };
				stage.classList.add("is-panning");
			}
			if (gesture) stage.setPointerCapture?.(event.pointerId);
		});
		stage.addEventListener("dragstart", (event) => event.preventDefault());
		stage.addEventListener("pointermove", (event) => {
			if (!gesture) {
				if (event.pointerType === "mouse") setPositionFromPointer(event);
				return;
			}
			if (gesture.pointerId !== event.pointerId) return;
			if (gesture.mode === "compare") setPositionFromPointer(event);
			else {
				panX = gesture.panX + event.clientX - gesture.clientX;
				panY = gesture.panY + event.clientY - gesture.clientY;
				updateTransform();
			}
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
			if (event.defaultPrevented) return;
			if (["+", "="].includes(event.key)) { event.preventDefault(); setZoom(zoom * 1.35); return; }
			if (event.key === "-") { event.preventDefault(); setZoom(zoom / 1.35); return; }
			if (event.key === "0") { event.preventDefault(); resetZoom(); return; }
			if (event.key === "Home" || event.key === "End") { event.preventDefault(); updatePosition(event.key === "Home" ? 0 : 100); return; }
			if (zoom <= MIN_ZOOM && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
				event.preventDefault();
				updatePosition(position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 2));
				return;
			}
			const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
			if (!movement || zoom <= MIN_ZOOM) return;
			event.preventDefault();
			panX += movement[0]; panY += movement[1]; updateTransform();
		});
		viewerBefore.addEventListener("load", updateTransform);
		viewerAfter.addEventListener("load", updateTransform);

		zoomOut = iconButton({ iconName: "zoomOut", label: spec.labels.zoomOut || "Zoom out", variant: "ghost", onClick: () => setZoom(zoom / 1.35) });
		zoomIn = iconButton({ iconName: "zoomIn", label: spec.labels.zoomIn || "Zoom in", variant: "ghost", onClick: () => setZoom(zoom * 1.35) });
		const toolbar = el("div", { className: "aa-image-compare-viewer__toolbar", children: [
			navigationGroup(beforeCounter, beforeImages, "before"),
			el("div", { className: "aa-image-compare-viewer__zoom", children: [
				zoomOut,
				scale,
				zoomIn,
				iconButton({ iconName: "fit", label: spec.labels.fit || "Fit to screen", variant: "ghost", onClick: resetZoom }),
			] }),
			navigationGroup(afterCounter, afterImages, "after"),
		] });
		stage.append(afterLayer, beforeLayer, viewerDivider);
		const body = el("div", { className: "aa-image-compare-viewer", children: [stage, toolbar] });
		const dialog = createDialog({
			title: spec.labels.title || "Image comparison",
			body,
			size: "lg",
			className: "aa-image-compare-dialog",
			confirmOnEnter: false,
			onClose: () => { viewer = null; },
		});
		dialog.overlay.classList.add("aa-image-compare-viewer-backdrop");
		dialog.header.append(iconButton({ iconName: "close", label: spec.labels.close || "Close full-screen comparison", variant: "ghost", className: "aa-image-compare-viewer__close", onClick: () => dialog.requestClose(null) }));
		viewer = { dialog: dialog.dialog, requestClose: dialog.requestClose, updateImages: updateViewerImages, updatePosition: updateViewerPosition };
		updateViewerPosition();
		updateViewerImages();
		updateTransform();
	}

	expand.addEventListener("pointerdown", (event) => event.stopPropagation());
	expand.addEventListener("click", (event) => { event.stopPropagation(); openViewer(); });
	viewport.addEventListener("dragstart", (event) => event.preventDefault());
	viewport.addEventListener("pointerdown", (event) => {
		previewPointerStart = { x: event.clientX, y: event.clientY };
		previewPointerMoved = false;
		viewport.setPointerCapture?.(event.pointerId);
		pointerPosition(event);
	});
	viewport.addEventListener("pointermove", (event) => {
		if (previewPointerStart && Math.hypot(event.clientX - previewPointerStart.x, event.clientY - previewPointerStart.y) > 4) previewPointerMoved = true;
		if (event.pointerType === "mouse" || viewport.hasPointerCapture?.(event.pointerId)) pointerPosition(event);
	});
	viewport.addEventListener("pointerup", () => { previewPointerStart = null; });
	viewport.addEventListener("click", () => {
		if (!previewPointerMoved) openViewer();
		previewPointerMoved = false;
	});
	viewport.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openViewer();
			return;
		}
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		if (event.key === "Home") updatePosition(0); else if (event.key === "End") updatePosition(100); else updatePosition(position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 2));
	});
	viewport.append(after, before, divider, empty, expand); root.append(viewport, nav); updatePosition(position); updateImages();
	return controlView({ root, kind: "image-compare", destroy: () => viewer?.requestClose(null) });
}
