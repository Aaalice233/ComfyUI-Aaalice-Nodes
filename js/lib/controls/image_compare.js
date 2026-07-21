/** Read-only projection of ComfyUI's native ImageCompare execution view. */

import { el, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

function imageUrls(value, key) {
	return (Array.isArray(value?.[key]) ? value[key] : []).filter((url) => typeof url === "string" && url);
}

export function renderImageCompareControl(spec) {
	const beforeImages = imageUrls(spec.value, "beforeImages");
	const afterImages = imageUrls(spec.value, "afterImages");
	let beforeIndex = 0; let afterIndex = 0; let position = 50;
	const root = el("div", "aa-control aa-image-compare");
	const viewport = el("div", { className: "aa-image-compare__viewport", attrs: { role: "slider", tabindex: "0", "aria-label": spec.labels.slider || "Comparison position", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" } });
	const after = el("img", { className: "aa-image-compare__image is-after", attrs: { alt: spec.labels.after || "Image B", draggable: "false" } });
	const before = el("img", { className: "aa-image-compare__image is-before", attrs: { alt: spec.labels.before || "Image A", draggable: "false" } });
	const divider = el("span", { className: "aa-image-compare__divider", attrs: { "aria-hidden": "true" }, children: [el("span", "aa-image-compare__handle")] });
	const empty = el("p", { className: "aa-image-compare__empty", attrs: { role: "status" } }, spec.labels.empty || "Run the workflow to compare images");
	const counter = (label, index, total) => `${label} ${total ? `${index + 1}/${total}` : "—"}`;
	const nav = el("div", "aa-image-compare__nav");

	function updatePosition(next) {
		position = Math.max(0, Math.min(100, next));
		root.style.setProperty("--aa-image-compare-position", `${position}%`);
		viewport.setAttribute("aria-valuenow", String(Math.round(position)));
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
	}
	function pointerPosition(event) {
		const rect = viewport.getBoundingClientRect();
		if (rect.width) updatePosition(((event.clientX - rect.left) / rect.width) * 100);
	}
	viewport.addEventListener("pointerdown", (event) => { viewport.setPointerCapture?.(event.pointerId); pointerPosition(event); });
	viewport.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse" || viewport.hasPointerCapture?.(event.pointerId)) pointerPosition(event); });
	viewport.addEventListener("keydown", (event) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		if (event.key === "Home") updatePosition(0); else if (event.key === "End") updatePosition(100); else updatePosition(position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 2));
	});
	viewport.append(after, before, divider, empty); root.append(viewport, nav); updatePosition(position); updateImages();
	return controlView({ root, kind: "image-compare" });
}
