/** Gallery card, selection-row, and drag-order view helpers. */
export function createGalleryCards(dependencies) {
	const {
		GALLERY_CATEGORIES, canWriteFavorite, capability, createSelectionStamp, createTagPillList,
		dimensions, effectivePrompt, el, finalPrompt, getSettings, iconButton,
		isPromptAssistantAvailable, label, notifyFavorite, proxyUrl, ratingLabel, ratingTone,
		selectionKey, stateFor, tagCount, transact,
	} = dependencies;

function installGalleryCardMotion(card) {
	const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	let frame = 0; let pointer = null;
	const reset = () => {
		pointer = null;
		card.style.setProperty("--aa-gallery-tilt-x", "0deg");
		card.style.setProperty("--aa-gallery-tilt-y", "0deg");
		card.style.setProperty("--aa-gallery-glare-x", "50%");
		card.style.setProperty("--aa-gallery-glare-y", "50%");
		card.style.setProperty("--aa-gallery-glare-position", "50%");
	};
	const draw = () => {
		frame = 0;
		if (!pointer || !card.isConnected || reducedMotion?.matches) return;
		const rect = card.getBoundingClientRect();
		if (!(rect.width > 0) || !(rect.height > 0)) return;
		const x = Math.max(-1, Math.min(1, ((pointer.x - rect.left) / rect.width - 0.5) * 2));
		const y = Math.max(-1, Math.min(1, ((pointer.y - rect.top) / rect.height - 0.5) * 2));
		card.style.setProperty("--aa-gallery-tilt-x", `${(-y * 3.2).toFixed(2)}deg`);
		card.style.setProperty("--aa-gallery-tilt-y", `${(x * 4).toFixed(2)}deg`);
		card.style.setProperty("--aa-gallery-glare-x", `${((x + 1) * 50).toFixed(1)}%`);
		card.style.setProperty("--aa-gallery-glare-y", `${((y + 1) * 50).toFixed(1)}%`);
		card.style.setProperty("--aa-gallery-glare-position", `${((x + 1) * 50).toFixed(1)}%`);
	};
	const onPointerMove = (event) => {
		if (event.pointerType === "touch" || reducedMotion?.matches) return;
		pointer = { x: event.clientX, y: event.clientY };
		if (!frame) frame = requestAnimationFrame(draw);
	};
	const onPointerLeave = () => { if (frame) cancelAnimationFrame(frame); frame = 0; reset(); };
	card.addEventListener("pointermove", onPointerMove, { passive: true });
	card.addEventListener("pointerleave", onPointerLeave, { passive: true });
	reset();
	return () => {
		if (frame) cancelAnimationFrame(frame);
		card.removeEventListener("pointermove", onPointerMove);
		card.removeEventListener("pointerleave", onPointerLeave);
	};
}

function galleryCardActionLayout(width, height, count) {
	const buttonSize = 28; const gap = 4; const inset = 14;
	const availableWidth = Math.max(0, Number(width) - inset); const availableHeight = Math.max(0, Number(height) - inset);
	const linearSize = Math.max(1, count) * buttonSize + Math.max(0, count - 1) * gap;
	if (availableHeight >= linearSize && availableWidth >= buttonSize) return "vertical";
	if (availableWidth >= linearSize && availableHeight >= buttonSize) return "horizontal";
	return "hybrid";
}

// Session-level decoded-preview pool: virtual masonry destroys cards while
// scrolling, so re-mounting a known image reuses the <img> element (kept off
// the DOM with its source intact so the decoded bitmap survives) and paints
// immediately instead of flashing a placeholder or re-decoding from cache.
// Bounded by both entry count and decoded pixels so AI TAG's full-size
// previews (megabytes each) cannot balloon the pool.
const previewImagePool = new Map();
const MAX_PREVIEW_IMAGE_POOL = 96;
const MAX_PREVIEW_POOL_PIXELS = 32 * 1024 * 1024; // ~128MB of decoded RGBA
let previewPoolPixels = 0;
function rememberPreviewImage(src, image, width, height) {
	const pixels = Math.max(1, Number(width) || 1) * Math.max(1, Number(height) || 1);
	if (pixels > MAX_PREVIEW_POOL_PIXELS) return;
	image._aaGalleryKeepSrc = true;
	const previous = previewImagePool.get(src);
	if (previous) previewPoolPixels -= previous.pixels;
	previewImagePool.delete(src);
	previewImagePool.set(src, { image, width, height, pixels });
	previewPoolPixels += pixels;
	while (previewImagePool.size > MAX_PREVIEW_IMAGE_POOL || previewPoolPixels > MAX_PREVIEW_POOL_PIXELS) {
		const stale = previewImagePool.keys().next().value;
		const entry = previewImagePool.get(stale);
		entry.image._aaGalleryKeepSrc = false;
		entry.image.removeAttribute("src");
		previewImagePool.delete(stale);
		previewPoolPixels -= entry.pixels;
	}
}
function takePreviewImage(src) {
	const entry = previewImagePool.get(src);
	if (!entry) return null;
	previewImagePool.delete(src);
	previewPoolPixels -= entry.pixels;
	return entry;
}

function createGalleryCard(node, controller, post, index) {
	const card = el("article", { className: "aa-gallery-card", attrs: { tabindex: 0, "aria-label": `${post.source} #${post.postId}` } });
	const surface = el("div", "aa-gallery-card__surface");
	const src = proxyUrl(post.source, post.previewUrl);
	const pooled = takePreviewImage(src);
	let image;
	if (pooled) {
		// 已解码的位图仍挂在元素上：直接复用，不重新请求也不等 load 事件。
		image = pooled.image;
		image._aaGalleryKeepSrc = false;
		controller.updateSize(post, pooled.width, pooled.height);
	} else {
		image = document.createElement("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async"; image.fetchPriority = "low";
		image.width = Math.max(1, Number(post.width) || 1); image.height = Math.max(1, Number(post.height) || 1);
		image.addEventListener("load", () => {
			surface.classList.remove("is-loading");
			if (image.naturalWidth > 0 && image.naturalHeight > 0) { controller.updateSize(post, image.naturalWidth, image.naturalHeight); rememberPreviewImage(image.currentSrc || src, image, image.naturalWidth, image.naturalHeight); }
		});
		image.addEventListener("error", () => { surface.classList.remove("is-loading"); void controller.recoverPreview(post, image); });
		surface.classList.add("is-loading");
		image.src = src;
	}
	const selectionStamp = createSelectionStamp(getSettings()?.selectionStamp);
	const selectedLayer = el("div", "aa-gallery-card__selected-layer");
	const hasRating = Boolean(post.rating) && Boolean(capability(post.source)?.ratings?.length);
	const rating = hasRating ? el("span", { className: "aa-gallery-card__rating", attrs: { "data-rating": ratingTone(post.rating) }, text: ratingLabel(post.rating) }) : null;
	const actions = el("div", { className: "aa-gallery-card__actions", attrs: { role: "group", "aria-label": label("card.actions", "Image actions") } });
	let selectionPending = false;
	const runSelection = async (event = null) => {
		if (selectionPending) return;
		controller.tooltip.hide();
		if (event?.type === "click") card.blur();
		selectionPending = true; card.classList.add("is-selection-pending");
		try { await controller.toggleSelection(post); }
		catch (error) { controller.showError(error); }
		finally { selectionPending = false; card.classList.remove("is-selection-pending"); }
	};
	const actionButton = (iconName, action, actionLabel, actionIndex, onClick) => {
		const control = iconButton({ iconName, label: actionLabel, variant: "ghost", className: `aa-gallery-card-action is-${action}`, onClick: (event) => { event?.stopPropagation?.(); onClick(event); if (event?.detail) control.blur(); } });
		control.style.setProperty("--aa-gallery-action-delay", `${actionIndex * 34}ms`);
		return control;
	};
	const editAction = actionButton("edit", "edit", label("card.edit", "Edit image tags"), 0, () => controller.openEditor(post).catch(controller.showError));
	let actionIndex = 1;
	const favoriteCapability = capability(post.source);
	const favoriteAction = (favoriteCapability?.favoriteRead || favoriteCapability?.favoriteWrite) ? actionButton("favorite", "favorite", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite"), actionIndex++, async () => {
		const targetFavorite = !Boolean(post.favorite);
		if (!canWriteFavorite(post.source, targetFavorite)) return;
		try { await controller.toggleFavorite(post); card._aaGalleryUpdate?.(); favoriteAction.classList.add("is-acknowledged"); notifyFavorite(post.source, targetFavorite); }
		catch (error) { notifyFavorite(post.source, targetFavorite, error); controller.showError(error); }
	}) : null;
	const copyPromptAction = actionButton("copy", "copyPrompt", label("card.copyPrompt", "Copy prompt"), actionIndex++, async () => {
		try { if (await controller.copyPostPrompt(post)) copyPromptAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	});
	const interrogateAction = isPromptAssistantAvailable() ? actionButton("scan", "interrogate", label("card.interrogate", "Interrogate prompt"), actionIndex++, async () => {
		try { await controller.interrogatePost(post, card, interrogateAction); interrogateAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	}) : null;
	const detailAction = actionButton("note", "detail", label("card.detail", "View details"), actionIndex++, () => controller.openDetail(post).catch(controller.showError));
	const actionControls = [editAction, ...(favoriteAction ? [favoriteAction] : []), copyPromptAction, ...(interrogateAction ? [interrogateAction] : []), detailAction];
	actions.append(...actionControls);
	card._aaVirtualMasonryLayout = (width, height) => { card.dataset.actionsLayout = galleryCardActionLayout(width, height, actionControls.length); };
	surface.append(el("div", { className: "aa-gallery-card__loading", attrs: { "aria-hidden": "true" } }), image, selectedLayer, el("div", { className: "aa-gallery-card__shade" }), el("div", { className: "aa-gallery-card__scan", attrs: { "aria-hidden": "true" } }), ...(rating ? [rating] : []), selectionStamp.root, actions);
	card.append(surface);
	const update = () => {
		const selected = stateFor(node).selections.some((item) => selectionKey(item) === `${post.source}:${post.postId}`);
		const previousSelected = card.dataset.selected;
		card.classList.toggle("is-selected", selected);
		selectionStamp.setStyle(getSettings()?.selectionStamp);
		card.dataset.selected = String(selected);
		if (previousSelected != null && previousSelected !== String(selected)) card.classList.add("is-selection-feedback");
		if (favoriteAction) { favoriteAction.classList.toggle("is-active", Boolean(post.favorite)); favoriteAction.setAttribute("aria-label", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite")); favoriteAction.title = favoriteAction.getAttribute("aria-label"); }
		card.setAttribute("aria-label", `${post.source} #${post.postId} · ${selected ? label("card.cancel", "Cancel selection") : label("card.select", "Select image")}`);
	};
	card._aaGalleryUpdate = update; update();
	card.addEventListener("animationend", (event) => {
		if (event.animationName === "aa-gallery-selection-feedback") card.classList.remove("is-selection-feedback");
		if (event.animationName === "aa-gallery-favorite-feedback") event.target.classList?.remove("is-acknowledged");
	});
	card.addEventListener("click", (event) => runSelection(event));
	card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runSelection(); } });
	let hoverTimer = 0;
	card.addEventListener("mouseenter", () => { if (!getSettings()?.tooltip) return; hoverTimer = setTimeout(() => controller.showHover(card, post), 280); });
	card.addEventListener("mouseleave", () => { clearTimeout(hoverTimer); controller.tooltip.hide(); });
	const disposeMotion = installGalleryCardMotion(card);
	card._aaVirtualMasonryDispose = () => { clearTimeout(hoverTimer); disposeMotion(); };
	return card;
}

function moveSelectionIndex(from, insertBefore) {
	const source = Math.floor(Number(from));
	const target = Math.floor(Number(insertBefore));
	if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || target < 0) return null;
	if (target === source || target === source + 1) return null;
	return target > source ? target - 1 : target;
}

function selectedDropEdge(row, clientY) {
	const rect = row.getBoundingClientRect();
	const before = clientY < rect.top + (rect.height / 2);
	const index = Math.floor(Number(row.dataset.index));
	if (!Number.isInteger(index) || index < 0) return null;
	return { row, before, index, insertBefore: before ? index : index + 1 };
}

function resolveSelectedDropTarget(listRoot, clientY) {
	const rows = [...listRoot.querySelectorAll(".aa-gallery-selected-row")];
	if (!rows.length) return null;
	for (const row of rows) {
		const rect = row.getBoundingClientRect();
		if (clientY < rect.top + (rect.height / 2)) return selectedDropEdge(row, rect.top);
		if (clientY <= rect.bottom) return selectedDropEdge(row, rect.bottom);
	}
	const last = rows.at(-1);
	return selectedDropEdge(last, last.getBoundingClientRect().bottom);
}

function selectedPromptTokens(selection, promptConfig) {
	const groups = selection.editedTags || selection.originalTags || {};
	const categories = new Set(promptConfig?.categories || []);
	const excluded = new Set(promptConfig?.excludedTags || []);
	const seen = new Set();
	const tokens = [];
	for (const category of GALLERY_CATEGORIES) {
		if (!categories.has(category)) continue;
		for (const tag of groups[category] || []) {
			if (seen.has(tag) || excluded.has(tag)) continue;
			seen.add(tag);
			let text = promptConfig?.replaceUnderscores ? tag.replaceAll("_", " ") : tag;
			if (promptConfig?.escapeParentheses) text = text.replaceAll("(", "\\(").replaceAll(")", "\\)");
			tokens.push({ category, raw: tag, text });
		}
	}
	return tokens;
}

function createGalleryTagPills(options = {}) {
	return createTagPillList({
		...options,
		labels: {
			menu: label("detail.tagMenu", "Tag actions"),
			menuHint: label("detail.tagActionsHint", "Click or right-click for tag actions"),
			editableMenuHint: label("detail.editableTagMenu", "Click to edit · Right-click for tag actions · {tag}"),
			editValue: label("selected.editTagValue", "Edit tag value"),
			edit: label("selected.edit", "Edit tag"),
			addToSearch: label("detail.addToSearch", "Add to search"),
			remove: label("selected.removeTag", "Remove {tag}"),
			...(options.labels || {}),
		},
	});
}
function selectedRowTagPreview(tokens) {
	return el("div", { className: "aa-gallery-selected-row__tags", attrs: { "aria-hidden": "true" }, children: [
		...tokens.map((token) => el("span", { attrs: { "data-category": token.category }, text: token.text })),
	] });
}

function selectedRowCopyContent(selection, promptConfig) {
	const promptText = finalPrompt(selection, promptConfig);
	const promptTokens = selectedPromptTokens(selection, promptConfig);
	const count = tagCount(selection.editedTags || selection.originalTags);
	return [
		el("div", { className: "aa-gallery-selected-row__title", children: [
			el("strong", null, `${selection.source} #${selection.postId}`),
			el("span", "aa-gallery-selected-row__format", selection.fileExt?.toUpperCase() || "IMAGE"),
		] }),
		el("small", { className: "aa-gallery-selected-row__meta", text: [
			dimensions(selection),
			selection.rating ? ratingLabel(selection.rating) : "",
			label("selected.tagCount", `${count} tags`).replace("{count}", String(count)),
		].filter(Boolean).join(" · ") }),
		promptTokens.length
			? selectedRowTagPreview(promptTokens)
			: el("p", { className: "aa-gallery-selected-row__prompt", text: promptText || label("selected.noPrompt", "No prompt tags in the current category selection") }),
	];
}

function createSelectedRow(node, controller, selection, index) {
	const promptConfig = effectivePrompt(node);
	const thumb = el("img", {
		className: "aa-gallery-selected-row__thumb",
		attrs: {
			src: proxyUrl(selection.source, selection.previewUrl),
			alt: "",
			loading: "lazy",
			decoding: "async",
		},
	});
	const copy = el("button", {
		className: "aa-gallery-selected-row__copy",
		attrs: {
			type: "button",
			"aria-label": label("card.detail", "View details"),
			title: label("card.detail", "View details"),
		},
		children: selectedRowCopyContent(selection, promptConfig),
	});
	const remove = iconButton({
		className: "aa-gallery-selected-row__remove",
		iconName: "delete",
		label: label("selected.remove", "Remove"),
		variant: "ghost",
		onClick: (event) => {
			event.stopPropagation();
			transact(node, (state) => state.selections.splice(index, 1));
			controller.renderSelected();
			controller.refreshCards();
		},
	});
	const actions = el("div", {
		className: "aa-gallery-selected-row__actions",
		attrs: { "aria-label": label("selected.remove", "Remove") },
		children: [remove],
	});
	const root = el("div", {
		className: "aa-gallery-selected-row",
		attrs: {
			"data-source": selection.source,
			"data-index": String(index),
			"data-rank": index < 3 ? String(index + 1) : "other",
			draggable: true,
			title: label("selected.reorder", "Drag to reorder"),
		},
		children: [
			thumb,
			copy,
			el("span", "aa-gallery-selected-row__order", String(index + 1)),
			actions,
		],
	});
	if (controller.selectedDragFrom === index) root.classList.add("is-dragging");
	let imageHoverTimer = 0;
	const clearImageHover = () => { clearTimeout(imageHoverTimer); imageHoverTimer = 0; };
	const hideHover = () => {
		clearImageHover();
		controller.tooltip.hide();
	};
	const openSelectedDetail = () => {
		hideHover();
		controller.openDetail(selection).catch(controller.showError);
	};
	thumb.addEventListener("mouseenter", () => {
		if (!getSettings()?.tooltip) return;
		clearImageHover();
		imageHoverTimer = setTimeout(() => controller.showHover(thumb, selection), 280);
	});
	thumb.addEventListener("mouseleave", () => {
		clearImageHover();
		if (controller.tooltip.isOpenFor(thumb)) controller.tooltip.hide();
	});
	copy.addEventListener("click", (event) => {
		event.preventDefault();
		openSelectedDetail();
	});
	root.addEventListener("dragstart", (event) => {
		hideHover();
		event.dataTransfer.setData("text/x-aa-gallery-index", String(index));
		event.dataTransfer.effectAllowed = "move";
		try { event.dataTransfer.setData("text/plain", String(index)); } catch { /* some hosts only expose plain text */ }
		controller.beginSelectedDrag(index, root);
	});
	root.addEventListener("dragend", () => controller.endSelectedDrag());
	return root;
}


	return {
		createGalleryCard, createGalleryTagPills, createSelectedRow, galleryCardActionLayout,
		moveSelectionIndex, resolveSelectedDropTarget,
	};
}
