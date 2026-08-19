/** Shared lazy thumbnail and large-preview behavior for library-backed entries. */

import { createTooltip, el, icon } from "./ui.js";

const IMAGE_PREVIEW_HOVER_DELAY = 600;
const ASYNC_IMAGE_PREVIEW_HOVER_DELAY = 260;
const previewTooltip = createTooltip({ delay: IMAGE_PREVIEW_HOVER_DELAY, closeDelay: 90 });

function readLabel(value, fallback = "") {
	const resolved = typeof value === "function" ? value() : value;
	return resolved == null ? fallback : String(resolved);
}

function normalizePreview(value) {
	if (typeof value === "string") return { source: value };
	return value && typeof value === "object" ? value : {};
}

function isVideoSource(source) {
	try {
		return /\.(?:mp4|webm|mov|m4v)$/i.test(new URL(source, document.baseURI).pathname);
	} catch {
		return /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(source);
	}
}

function createPreviewContent(value, { title = "", hint = "", loading = false, failureHint = "" } = {}) {
	const resolved = normalizePreview(value);
	const source = readLabel(resolved.source);
	const resolvedTitle = readLabel(resolved.title, readLabel(title));
	const resolvedHint = readLabel(resolved.hint, readLabel(hint));
	if (!source) {
		const message = loading ? resolvedHint || "Loading preview…" : resolvedHint || "Preview unavailable";
		return {
			content: el("span", {
				className: "aa-image-preview-quick-hint",
				children: [icon(loading ? "loading" : "image", { className: loading ? "is-loading" : "" }), el("span", { text: message })],
			}),
			hasSource: false,
		};
	}

	const video = isVideoSource(source);
	const media = video ? document.createElement("video") : document.createElement("img");
	media.alt = resolvedTitle;
	if (!video) media.decoding = "async";
	if (video) {
		media.autoplay = true;
		media.controls = false;
		media.loop = true;
		media.muted = true;
		media.playsInline = true;
		media.preload = "metadata";
	}
	const large = el("div", {
		className: "aa-image-preview-large",
		children: [
			media,
			el("div", {
				className: "aa-image-preview-caption",
				children: [
					...(resolvedTitle ? [el("strong", null, resolvedTitle)] : []),
					...(resolvedHint ? [el("small", null, resolvedHint)] : []),
				],
			}),
		],
	});
	const release = typeof resolved.release === "function" ? resolved.release : null;
	let released = false;
	const releaseSource = () => {
		if (released) return;
		released = true;
		release?.();
	};
	const reposition = () => previewTooltip.reposition();
	media.addEventListener(video ? "loadeddata" : "load", () => { releaseSource(); reposition(); }, { once: true });
	media.addEventListener("error", () => {
		releaseSource();
		if (!media.isConnected) return;
		media.replaceWith(el("span", "aa-image-preview-quick-hint", failureHint || resolvedHint || "Preview unavailable"));
		reposition();
	}, { once: true });
	return {
		content: large,
		hasSource: true,
		mount: () => {
			media.src = source;
			if (video) media.load();
		},
	};
}

function showPreview(trigger, value, {
	title = "",
	hint = "",
	loading = false,
	failureHint = "",
	immediate = false,
	placement = "auto",
	className = "",
} = {}) {
	const preview = createPreviewContent(value, { title, hint, loading, failureHint });
	const classes = [preview.hasSource ? "aa-image-preview-tooltip" : "aa-image-preview-hint-tooltip", className].filter(Boolean).join(" ");
	previewTooltip.show(trigger, preview.content, {
		className: classes,
		contentMode: "dom",
		immediate,
		placement,
		onMount: preview.mount,
	});
}

export function closeImagePreview() { previewTooltip.hide(); }

export function closeImagePreviewWithin(container) {
	if (previewTooltip.isAnchoredWithin(container)) previewTooltip.hide();
}

export function bindImagePreview(trigger, source, title, { immediate = false, hint = "", resolve = null, placement = "auto", className = "" } = {}) {
	if (!source && !hint && !resolve) return () => {};
	const show = (showImmediately) => {
		const resolved = resolve?.() || { source, title, hint };
		const normalized = normalizePreview(resolved);
		if (!normalized.source && !(normalized.hint ?? hint)) return;
		if (previewTooltip.isOpenFor(trigger)) {
			previewTooltip.cancelScheduledHide();
			return;
		}
		showPreview(trigger, normalized, { title, hint, immediate: showImmediately, placement, className });
	};
	const onMouseEnter = () => show(immediate);
	const onMouseLeave = () => previewTooltip.scheduleHide();
	const onFocusIn = () => show(true);
	const onFocusOut = (event) => { if (!trigger.contains(event.relatedTarget)) previewTooltip.scheduleHide(); };
	trigger.addEventListener("mouseenter", onMouseEnter);
	trigger.addEventListener("mouseleave", onMouseLeave);
	trigger.addEventListener("focusin", onFocusIn);
	trigger.addEventListener("focusout", onFocusOut);
	return () => {
		trigger.removeEventListener("mouseenter", onMouseEnter);
		trigger.removeEventListener("mouseleave", onMouseLeave);
		trigger.removeEventListener("focusin", onFocusIn);
		trigger.removeEventListener("focusout", onFocusOut);
		if (previewTooltip.isOpenFor(trigger)) previewTooltip.hide();
	};
}

export function bindAsyncImagePreview(trigger, resolve, {
	title = "",
	loadingHint = "Loading preview…",
	unavailableHint = "Preview unavailable",
	failureHint = unavailableHint,
	placement = "side",
	className = "",
	delay = ASYNC_IMAGE_PREVIEW_HOVER_DELAY,
} = {}) {
	if (!trigger || typeof resolve !== "function") return () => {};
	let active = false;
	let generation = 0;
	let hoverTimer = null;
	let requestController = null;

	const clearHoverTimer = () => {
		clearTimeout(hoverTimer);
		hoverTimer = null;
	};
	const isCurrent = (requestGeneration) => active
		&& requestGeneration === generation
		&& trigger.isConnected
		&& previewTooltip.isOpenFor(trigger);
	const show = () => {
		clearHoverTimer();
		if (!active || !trigger.isConnected) return;
		if (previewTooltip.isOpenFor(trigger)) {
			previewTooltip.cancelScheduledHide();
			return;
		}
		const requestGeneration = ++generation;
		requestController?.abort();
		const controller = new AbortController();
		requestController = controller;
		showPreview(trigger, { hint: readLabel(loadingHint, "Loading preview…") }, {
			title,
			loading: true,
			immediate: true,
			placement,
			className,
		});
		Promise.resolve().then(() => resolve({ signal: controller.signal })).then((resolved) => {
			if (requestController === controller) requestController = null;
			if (!isCurrent(requestGeneration)) {
				resolved?.release?.();
				return;
			}
			const normalized = normalizePreview(resolved);
			const preview = normalized.source || normalized.hint
				? normalized
				: { ...normalized, hint: readLabel(unavailableHint, "Preview unavailable") };
			showPreview(trigger, preview, {
				title,
				failureHint: readLabel(failureHint, "Preview unavailable"),
				immediate: true,
				placement,
				className,
			});
		}).catch((error) => {
			if (requestController === controller) requestController = null;
			if (error?.name === "AbortError" || !isCurrent(requestGeneration)) return;
			showPreview(trigger, { hint: readLabel(unavailableHint, "Preview unavailable") }, {
				title,
				immediate: true,
				placement,
				className,
			});
		});
	};
	const stop = () => {
		active = false;
		generation += 1;
		requestController?.abort();
		requestController = null;
		clearHoverTimer();
		previewTooltip.scheduleHide();
	};
	const onMouseEnter = () => {
		active = true;
		clearHoverTimer();
		if (previewTooltip.isOpenFor(trigger)) {
			previewTooltip.cancelScheduledHide();
			return;
		}
		hoverTimer = setTimeout(show, Math.max(0, delay));
	};
	const onMouseLeave = stop;
	const onFocusIn = () => {
		active = true;
		show();
	};
	const onFocusOut = (event) => { if (!trigger.contains(event.relatedTarget)) stop(); };
	trigger.addEventListener("mouseenter", onMouseEnter);
	trigger.addEventListener("mouseleave", onMouseLeave);
	trigger.addEventListener("focusin", onFocusIn);
	trigger.addEventListener("focusout", onFocusOut);
	return () => {
		stop();
		trigger.removeEventListener("mouseenter", onMouseEnter);
		trigger.removeEventListener("mouseleave", onMouseLeave);
		trigger.removeEventListener("focusin", onFocusIn);
		trigger.removeEventListener("focusout", onFocusOut);
	};
}

function thumbnail(source, placeholderIcon) {
	if (!source) return el("span", { className: "aa-image-preview-media is-placeholder", attrs: { "aria-hidden": "true" }, children: [icon(placeholderIcon)] });
	const image = document.createElement("img"); image.src = source; image.alt = ""; image.loading = "lazy"; image.decoding = "async";
	return el("span", { className: "aa-image-preview-media", attrs: { "aria-hidden": "true" }, children: [image] });
}

export function createImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note", hint = "" } = {}) {
	const classes = `aa-image-preview${className ? ` ${className}` : ""}`;
	const trigger = el("button", { className: `${classes}${source ? "" : " is-placeholder"}`, attrs: { type: "button", "aria-label": label }, children: [thumbnail(source, placeholderIcon)] });
	bindImagePreview(trigger, source, title, { hint });
	return trigger;
}

export function createSelectableImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note", selected = false, inputId = "", onChange = null } = {}) {
	const input = document.createElement("input"); input.type = "checkbox"; input.checked = selected; input.id = inputId; input.setAttribute("aria-label", label);
	input.addEventListener("change", () => onChange?.(input.checked));
	const root = el("label", { className: `aa-image-preview aa-image-preview-selectable${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`, children: [
		input, thumbnail(source, placeholderIcon), el("span", { className: "aa-image-preview-selection", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] }),
	] });
	bindImagePreview(root, source, title);
	return { root, input };
}
