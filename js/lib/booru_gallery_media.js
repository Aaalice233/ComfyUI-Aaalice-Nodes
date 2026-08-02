/** Detail viewer and selection-stamp rendering for the Booru Gallery. */
export function createGalleryMedia(dependencies) {
	const { button, el, icon, iconButton, label, ratingTone } = dependencies;

	function createDetailImageViewer({ previewSrc, originalSrc, alt }) {
	const MIN_SCALE = 1; const MAX_SCALE = 8; const BUTTON_STEP = 1.35;
	let scale = MIN_SCALE; let offsetX = 0; let offsetY = 0; let activePointer = null; let dragX = 0; let dragY = 0; let loadToken = 0; let originalLoader = null; let destroyed = false;
	previewSrc ||= originalSrc;
	const image = el("img", { className: "aa-gallery-detail__image", attrs: { src: previewSrc, alt } }); image.dataset.quality = previewSrc === originalSrc ? "original" : "preview";
	const viewport = el("div", { className: "aa-gallery-detail__viewport", attrs: { tabindex: "0", role: "group", "aria-label": label("detail.viewer", "Image viewer. Scroll to zoom, then drag to move. Double-click to reset.") }, children: [image] });
	const zoomValue = el("output", { className: "aa-gallery-detail__zoom-value", text: "100%" });
	const clampOffsets = () => {
		const width = viewport.clientWidth; const height = viewport.clientHeight;
		if (!width || !height || !image.naturalWidth || !image.naturalHeight || scale <= MIN_SCALE) { offsetX = 0; offsetY = 0; return; }
		const fittedScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
		const fittedWidth = image.naturalWidth * fittedScale; const fittedHeight = image.naturalHeight * fittedScale;
		const maxX = Math.max(0, (fittedWidth * scale - width) / 2); const maxY = Math.max(0, (fittedHeight * scale - height) / 2);
		offsetX = Math.max(-maxX, Math.min(maxX, offsetX)); offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
	};
	let zoomOut; let zoomIn;
	const render = () => {
		clampOffsets();
		image.style.setProperty("--aa-gallery-detail-scale", String(scale));
		image.style.setProperty("--aa-gallery-detail-offset-x", `${offsetX}px`);
		image.style.setProperty("--aa-gallery-detail-offset-y", `${offsetY}px`);
		viewport.classList.toggle("is-zoomed", scale > MIN_SCALE);
		zoomValue.value = `${Math.round(scale * 100)}%`; zoomValue.textContent = zoomValue.value;
		if (zoomOut) zoomOut.disabled = scale <= MIN_SCALE; if (zoomIn) zoomIn.disabled = scale >= MAX_SCALE;
	};
	const setScale = (nextScale, clientX = null, clientY = null) => {
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
		if (next === scale) return;
		const rect = viewport.getBoundingClientRect();
		const pointerX = (clientX ?? (rect.left + rect.width / 2)) - rect.left - rect.width / 2;
		const pointerY = (clientY ?? (rect.top + rect.height / 2)) - rect.top - rect.height / 2;
		const ratio = next / scale;
		offsetX = pointerX - (pointerX - offsetX) * ratio; offsetY = pointerY - (pointerY - offsetY) * ratio; scale = next; render();
	};
	const reset = () => { scale = MIN_SCALE; offsetX = 0; offsetY = 0; render(); };
	zoomOut = iconButton({ iconName: "zoomOut", label: label("detail.zoomOut", "Zoom out"), variant: "ghost", onClick: () => setScale(scale / BUTTON_STEP) });
	const fit = iconButton({ iconName: "fit", label: label("detail.resetView", "Reset view"), variant: "ghost", onClick: reset });
	zoomIn = iconButton({ iconName: "zoomIn", label: label("detail.zoomIn", "Zoom in"), variant: "ghost", onClick: () => setScale(scale * BUTTON_STEP) });
	const controls = el("div", { className: "aa-gallery-detail__viewer-controls", attrs: { role: "group", "aria-label": label("detail.viewerControls", "Image view controls") }, children: [zoomOut, zoomValue, fit, zoomIn] });
	const statusIcon = el("span", { className: "aa-gallery-detail__media-status-icon", attrs: { "aria-hidden": "true" } });
	const statusText = el("span", "aa-gallery-detail__media-status-text");
	const retry = iconButton({ iconName: "refresh", label: label("detail.retryOriginal", "Retry original"), variant: "ghost" });
	const status = el("div", { className: "aa-gallery-detail__media-status", attrs: { role: "status", "aria-live": "polite" }, children: [statusIcon, statusText, retry] });
	const setLoadState = (state, text) => {
		status.hidden = state === "ready"; status.dataset.state = state; statusText.textContent = text || ""; retry.hidden = state !== "error";
		statusIcon.replaceChildren(icon(state === "error" ? "statusError" : "loading"));
	};
	const loadOriginal = () => {
		if (destroyed || !originalSrc) return;
		const token = ++loadToken;
		setLoadState("loading", label("detail.loadingOriginal", "Loading original…"));
		if (previewSrc === originalSrc) {
			image.dataset.quality = "original"; image.removeAttribute("src");
			requestAnimationFrame(() => { if (!destroyed && token === loadToken) image.src = originalSrc; });
			return;
		}
		if (originalLoader) originalLoader.src = "";
		const loader = new Image(); originalLoader = loader; loader.decoding = "async";
		loader.addEventListener("load", () => {
			if (destroyed || token !== loadToken) return;
			originalLoader = null; image.dataset.quality = "original"; image.src = originalSrc;
		}, { once: true });
		loader.addEventListener("error", () => {
			if (destroyed || token !== loadToken) return;
			originalLoader = null; setLoadState("error", label("detail.originalFailed", "Original image failed to load. Preview kept."));
		}, { once: true });
		loader.src = originalSrc;
	};
	retry.addEventListener("click", loadOriginal);
	viewport.addEventListener("wheel", (event) => { event.preventDefault(); setScale(scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY); }, { passive: false });
	viewport.addEventListener("pointerdown", (event) => {
		viewport.focus({ preventScroll: true });
		if (event.button !== 0 || scale <= MIN_SCALE) return;
		event.preventDefault(); activePointer = event.pointerId; dragX = event.clientX - offsetX; dragY = event.clientY - offsetY; viewport.setPointerCapture(event.pointerId); viewport.classList.add("is-dragging");
	});
	viewport.addEventListener("pointermove", (event) => { if (event.pointerId !== activePointer) return; offsetX = event.clientX - dragX; offsetY = event.clientY - dragY; render(); });
	const endDrag = (event) => { if (event.pointerId !== activePointer) return; activePointer = null; viewport.classList.remove("is-dragging"); if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId); };
	viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag);
	viewport.addEventListener("dblclick", reset);
	viewport.addEventListener("keydown", (event) => {
		if (["+", "="].includes(event.key)) { event.preventDefault(); setScale(scale * BUTTON_STEP); return; }
		if (event.key === "-") { event.preventDefault(); setScale(scale / BUTTON_STEP); return; }
		if (event.key === "0") { event.preventDefault(); reset(); return; }
		const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
		if (!movement || scale <= MIN_SCALE) return;
		event.preventDefault(); offsetX += movement[0]; offsetY += movement[1]; render();
	});
	image.addEventListener("load", () => { render(); if (image.dataset.quality === "original") setLoadState("ready"); });
	image.addEventListener("error", () => {
		if (image.dataset.quality !== "original") return;
		if (previewSrc && previewSrc !== originalSrc) { image.dataset.quality = "preview"; image.src = previewSrc; }
		setLoadState("error", label("detail.originalFailed", "Original image failed to load. Preview kept."));
	});
	image.draggable = false; render(); loadOriginal();
	return {
		root: el("div", { className: "aa-gallery-detail__media", children: [viewport, status, controls] }),
		destroy() { destroyed = true; loadToken += 1; if (originalLoader && !originalLoader.complete) originalLoader.src = ""; originalLoader = null; image.removeAttribute("src"); },
	};
}
function ratingIcon(value) { return ({ general: "ratingGeneral", safe: "ratingGeneral", sensitive: "ratingSensitive", questionable: "ratingQuestionable", explicit: "ratingExplicit" })[ratingTone(value)] || "statusIdle"; }
function sortLabel(value) { return label(`collection.${value}`, String(value)); }
const SELECTION_STAMPS = [
	"inspection", "approved", "pass", "qa", "audit", "certified", "verified", "selected", "quality", "accepted", "official", "checked", "pure", "crown",
	"inspectionDate", "inspectionReverse", "passDate", "qaDate", "reviewBadge", "birthday", "organic", "silverCapital", "visa", "hotPick", "soldOut", "hot", "nationwideShipping", "nationwideFlight",
	"sfShipping", "qualityGuarantee", "praise", "delicacySquare", "traditionVertical", "chinaCuisine", "ruyi", "snowCuisine", "traditionCircle", "delicacyWide", "traditionWide", "auspicious", "exclusiveCertification", "soldOutPostal", "quarantineQualified",
];
function selectionStampCopy(style) {
	return {
		inspection: ["NO.01", label("stamp.inspection", "INSPECTED"), label("stamp.approved", "APPROVED")], approved: ["APPROVED", label("stamp.approved", "APPROVED"), "PASS"],
		pass: ["QUALITY", "PASS", "NO.02"], qa: ["QA 01", label("stamp.quality", "QUALITY"), "PASS"], audit: ["AUDIT", label("stamp.audit", "AUDITED"), "OK"],
		certified: ["100%", label("stamp.certified", "CERTIFIED"), "PASS"], verified: ["CHECK", label("stamp.verified", "VERIFIED"), "OK"],
		selected: ["PICK", label("stamp.selected", "SELECTED"), "✓"], quality: ["QA", label("stamp.quality", "QUALITY"), "100%"],
		accepted: ["REVIEW", label("stamp.accepted", "ACCEPTED"), "PASS"], official: ["OFFICIAL", label("stamp.official", "OFFICIAL"), "SEAL"],
		checked: ["CHECK", label("stamp.checked", "CHECKED"), "✓"], pure: ["100%", label("stamp.pure", "PURE"), "PASS"],
		crown: ["♛", label("stamp.crown", "PREMIUM"), "PASS"],
		inspectionDate: ["检验01", "2020.03.10", "合格"], inspectionReverse: ["合格", "2020.03.10", "检01"], passDate: ["PASS", "2020.03.10", "检02"], qaDate: ["QA01", "2020.03.10", "PASS"],
		reviewBadge: ["", "审核通过", ""], birthday: ["HAPPY BIRTHDAY", "生日快乐", "HAPPY BIRTHDAY"], organic: ["百分百", "原生态", "100% PURE"],
		silverCapital: ["♛", "官银资本", "OFFICIAL"], visa: ["", "VISA", ""], hotPick: ["爆款推荐", "HOT SALE", "爆款推荐"], soldOut: ["100%", "今日已售罄", "SOLD OUT"],
		hot: ["", "爆", ""], nationwideShipping: ["全国", "全国包邮", "包邮"], nationwideFlight: ["全国", "全国可飞", "可飞"], sfShipping: ["顺丰", "顺丰包邮", "包邮"], qualityGuarantee: ["品质", "品质保证", "保证"],
		praise: ["好评", "好评如潮", "如潮"], delicacySquare: ["", "美味\n佳肴", ""], traditionVertical: ["", "传\n统\n文\n化", ""], chinaCuisine: ["", "中国\n美味", ""],
		ruyi: ["", "如\n意", ""], snowCuisine: ["", "雪尖\n美食", ""], traditionCircle: ["", "传统\n文化", ""], delicacyWide: ["", "美味佳肴", ""], traditionWide: ["", "传统文化", ""],
		auspicious: ["", "吉\n祥", ""], exclusiveCertification: ["", "专属认证", ""], soldOutPostal: ["", "", ""], quarantineQualified: ["", "", ""],
	}[style] || ["NO.01", label("stamp.inspection", "INSPECTED"), label("stamp.approved", "APPROVED")];
}
function selectionStampLabel(style) {
	if (style === "soldOutPostal") return label("stampSoldOutPostal", "Xianyu Sold Out Postmark");
	if (style === "quarantineQualified") return label("stampQuarantineQualified", "Quarantine Qualified");
	return label(`stamp.${style}`, style);
}
function soldOutPostalArt() {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 104 72"); svg.setAttribute("class", "aa-gallery-stamp__postal"); svg.setAttribute("aria-hidden", "true");
	svg.innerHTML = '<g class="aa-gallery-stamp__postal-ring"><circle cx="34" cy="36" r="27"/><circle cx="34" cy="36" r="22"/></g><g class="aa-gallery-stamp__postal-waves"><path d="M58 20c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M59 28c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M59 36c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M58 44c10-6 17 4 28-2 6-3 10-7 16-9"/></g><text class="aa-gallery-stamp__postal-xianyu" x="34" y="20">XIANYU</text><text class="aa-gallery-stamp__postal-sold" x="34" y="59">SOLD OUT</text><g class="aa-gallery-stamp__postal-board"><rect x="5" y="25" width="65" height="27" rx="3"/><rect x="8" y="28" width="59" height="21" rx="2"/><text x="37" y="44">卖掉了</text></g>';
	return svg;
}
function quarantineQualifiedArt() {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("class", "aa-gallery-stamp__quarantine"); svg.setAttribute("aria-hidden", "true");
	svg.innerHTML = '<g class="aa-gallery-stamp__quarantine-rings"><circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="25"/></g><g class="aa-gallery-stamp__quarantine-copy"><text x="32" y="25">检疫</text><text x="32" y="45">合格</text></g>';
	return svg;
}
const TRADITIONAL_SEAL_SPECS = Object.freeze({
	delicacySquare: { shape: "square", lines: ["美味", "佳肴"] },
	traditionVertical: { shape: "vertical", lines: ["传", "统", "文", "化"] },
	chinaCuisine: { shape: "square", lines: ["中国", "美味"] },
	ruyi: { shape: "vertical", lines: ["如", "意"] },
	snowCuisine: { shape: "square", lines: ["雪尖", "美食"] },
	traditionCircle: { shape: "circle", lines: ["传统", "文化"] },
	delicacyWide: { shape: "wide", lines: ["美味佳肴"] },
	traditionWide: { shape: "wide", lines: ["传统文化"] },
	auspicious: { shape: "vertical", lines: ["吉", "祥"] },
});
function traditionalSealArt(style) {
	const spec = TRADITIONAL_SEAL_SPECS[style];
	const dimensions = spec.shape === "vertical" ? [40, 68] : spec.shape === "wide" ? [76, 42] : [64, 64];
	const [width, height] = dimensions;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("class", "aa-gallery-stamp__traditional"); svg.setAttribute("aria-hidden", "true");
	const outline = spec.shape === "circle"
		? `<circle cx="32" cy="32" r="29"/><circle class="aa-gallery-stamp__traditional-inset" cx="32" cy="32" r="25"/>`
		: `<rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${spec.shape === "wide" ? 5 : 7}"/><rect class="aa-gallery-stamp__traditional-inset" x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${spec.shape === "wide" ? 3 : 5}"/>`;
	const fontSize = spec.shape === "vertical" ? (spec.lines.length === 4 ? 13 : 19) : spec.shape === "wide" ? 16 : 20;
	const lineHeight = spec.shape === "vertical" && spec.lines.length === 4 ? 14 : fontSize + 3;
	const totalHeight = (spec.lines.length - 1) * lineHeight; const firstY = height / 2 - totalHeight / 2;
	const text = spec.lines.map((line, index) => `<text x="${width / 2}" y="${firstY + index * lineHeight}" font-size="${fontSize}">${line}</text>`).join("");
	svg.innerHTML = `<g class="aa-gallery-stamp__traditional-ink">${outline}${text}</g>`;
	return svg;
}
const SELECTION_STAMP_ART = Object.freeze({
	soldOutPostal: soldOutPostalArt,
	quarantineQualified: quarantineQualifiedArt,
	...Object.fromEntries(Object.keys(TRADITIONAL_SEAL_SPECS).map((style) => [style, () => traditionalSealArt(style)])),
});
function createSelectionStamp(initialStyle, { preview = false } = {}) {
	const top = el("span", "aa-gallery-stamp__top"); const main = el("span", "aa-gallery-stamp__main"); const bottom = el("span", "aa-gallery-stamp__bottom");
	const art = el("span", "aa-gallery-stamp__art");
	const root = el("span", { className: `aa-gallery-card__selection${preview ? " is-preview" : ""}`, attrs: { "aria-hidden": "true" }, children: [top, main, bottom, art] });
	const setStyle = (value) => {
		const style = SELECTION_STAMPS.includes(value) ? value : "inspection";
		root.dataset.stamp = style;
		[top.textContent, main.textContent, bottom.textContent] = selectionStampCopy(style);
		const createArt = SELECTION_STAMP_ART[style];
		art.replaceChildren(...(createArt ? [createArt()] : []));
	};
	setStyle(initialStyle); return { root, setStyle };
}

	return { createDetailImageViewer, createSelectionStamp, ratingIcon, SELECTION_STAMPS, selectionStampLabel, sortLabel };
}
