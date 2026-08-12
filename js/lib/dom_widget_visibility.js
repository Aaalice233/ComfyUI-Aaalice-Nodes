/**
 * Keeps plugin-owned rich DOM active only while its host widget is near the
 * browser viewport. The ComfyUI widget itself remains mounted and registered.
 */
export function isDOMWidgetViewportVisible(entry) {
	return Boolean(entry?.isIntersecting || Number(entry?.intersectionRatio) > 0);
}

export function observeDOMWidgetVisibility(element, { onChange, rootMargin = "800px" } = {}) {
	const notify = typeof onChange === "function" ? onChange : () => {};
	if (!element || typeof IntersectionObserver !== "function") {
		notify(true);
		return { destroy() {} };
	}

	let active = null;
	const observer = new IntersectionObserver((entries) => {
		const entry = entries.find(Boolean);
		if (!entry) return;
		const next = isDOMWidgetViewportVisible(entry);
		if (next === active) return;
		active = next;
		notify(next);
	}, { rootMargin, threshold: 0 });
	observer.observe(element);
	return { destroy() { observer.disconnect(); } };
}
