/** Gallery card, selection-row, and drag-order view helpers. */

// 卡片倾斜与径向高光由瀑布流容器统一委托：一个 pointermove/pointerleave 监听
// 管理全部卡片，单 rAF 内只读取指针下方一张卡片的几何；滚动虚拟化卸载卡片后
// 待处理帧通过 isConnected 自然跳过，不再为每张卡片各挂一对监听器。
export function installMasonryCardMotion(container) {
	const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	let frame = 0; let card = null; let pointer = null;
	const reset = (target) => {
		if (!target) return;
		target.style.setProperty("--aa-gallery-tilt-x", "0deg");
		target.style.setProperty("--aa-gallery-tilt-y", "0deg");
		target.style.setProperty("--aa-gallery-glare-x", "50%");
		target.style.setProperty("--aa-gallery-glare-y", "50%");
		target.style.setProperty("--aa-gallery-glare-position", "50%");
	};
	const draw = () => {
		frame = 0;
		if (!card || !card.isConnected || reducedMotion?.matches || !pointer) return;
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
		const target = event.target instanceof Element ? event.target.closest(".aa-gallery-card") : null;
		if (target !== card) { reset(card); card = target; }
		if (!card) { if (frame) cancelAnimationFrame(frame); frame = 0; pointer = null; return; }
		pointer = { x: event.clientX, y: event.clientY };
		if (!frame) frame = requestAnimationFrame(draw);
	};
	const onPointerLeave = (event) => {
		if (event.pointerType === "touch") return;
		const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".aa-gallery-card") : null;
		if (next) return;
		if (frame) cancelAnimationFrame(frame); frame = 0;
		reset(card); card = null; pointer = null;
	};
	container.addEventListener("pointermove", onPointerMove, { passive: true });
	container.addEventListener("pointerleave", onPointerLeave, { passive: true });
	return () => {
		if (frame) cancelAnimationFrame(frame); frame = 0;
		container.removeEventListener("pointermove", onPointerMove);
		container.removeEventListener("pointerleave", onPointerLeave);
		reset(card); card = null; pointer = null;
	};
}

export function createGalleryCards(dependencies) {
	const {
		GALLERY_CATEGORIES, canWriteFavorite, capability, createSelectionStamp, createTagPillList,
		dimensions, effectivePrompt, el, finalPrompt, getSettings, icon, iconButton,
		isPromptAssistantAvailable, label, notifyFavorite, proxyUrl, ratingLabel, ratingTone,
		selectionKey, stateFor, tagCount, transact,
	} = dependencies;

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
	if (pixels > MAX_PREVIEW_POOL_PIXELS) return false;
	const previous = previewImagePool.get(src);
	if (previous) {
		previous.image.removeAttribute("src");
		previewPoolPixels -= previous.pixels;
	}
	previewImagePool.delete(src);
	previewImagePool.set(src, { image, width, height, pixels });
	previewPoolPixels += pixels;
	while (previewImagePool.size > MAX_PREVIEW_IMAGE_POOL || previewPoolPixels > MAX_PREVIEW_POOL_PIXELS) {
		const stale = previewImagePool.keys().next().value;
		const entry = previewImagePool.get(stale);
		entry.image.removeAttribute("src");
		previewImagePool.delete(stale);
		previewPoolPixels -= entry.pixels;
	}
	return true;
}
function takePreviewImage(src) {
	const entry = previewImagePool.get(src);
	if (!entry) return null;
	previewImagePool.delete(src);
	previewPoolPixels -= entry.pixels;
	return entry;
}

// URLs that failed to load recently: re-mounting a card must not re-request a
// known-missing preview (AI TAG's p0 links 404 for multi-image posts), so the
// card goes straight to the recovery path instead. Entries expire so transient
// upstream failures get another chance on later scroll-backs.
const failedPreviewSources = new Map();
const FAILED_PREVIEW_TTL_MS = 15000;
const MAX_FAILED_PREVIEW_SOURCES = 500;
function markFailedPreview(src) {
	failedPreviewSources.delete(src);
	failedPreviewSources.set(src, Date.now() + FAILED_PREVIEW_TTL_MS);
	if (failedPreviewSources.size > MAX_FAILED_PREVIEW_SOURCES) failedPreviewSources.delete(failedPreviewSources.keys().next().value);
}

// 卡片 DOM 回收池：虚拟瀑布流滚动时持续挂载/卸载卡片，新建一张卡片要创建约
// 15 个元素和全部按钮监听。视图把 DOM 结构与数据绑定分离——卸载卡片回池、挂载时
// bind 新 post 复用整棵子树，滚动帧内只做重绑定；换绑时旧图进入 decoded-preview
// 池，新图优先从池中取回已解码元素。
const cardViewPool = [];
const MAX_POOLED_CARD_VIEWS = 48;

function createCardImage() {
	const image = document.createElement("img");
	image.alt = ""; image.loading = "lazy"; image.decoding = "async"; image.fetchPriority = "low";
	// 图片元素会在卡片池与预览池之间迁移，事件委托给当前持有者，迁移时无需拆装监听。
	image.addEventListener("load", () => image._aaCardView?.handleImageLoad(image));
	image.addEventListener("error", () => image._aaCardView?.handleImageError(image));
	// 图片生命周期由卡片池接管，瀑布流卸载时不剥离 src， decoded 位图随卡片保留。
	image._aaVirtualMasonryRelease = () => true;
	return image;
}

function releaseCardImage(view, image) {
	image._aaCardView = null;
	const loadedSrc = image.dataset.deferred === "1" ? null : image.getAttribute("src");
	if (loadedSrc && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) rememberPreviewImage(loadedSrc, image, image.naturalWidth, image.naturalHeight);
	else image.removeAttribute("src");
	image.remove();
}

function createGalleryCard(node, controller, post, index, deferImage = false) {
	const view = cardViewPool.pop() || buildGalleryCardView();
	view.bind(node, controller, post, deferImage);
	return view.root;
}

function buildGalleryCardView() {
	const card = el("article", { className: "aa-gallery-card", attrs: { tabindex: 0 } });
	const surface = el("div", "aa-gallery-card__surface");
	const errorLayer = el("button", { className: "aa-gallery-card__error", attrs: { type: "button", "aria-label": label("card.retryImage", "Retry image") }, children: [icon("statusError"), el("span", null, label("card.imageFailed", "Load failed"))] });
	const selectionStamp = createSelectionStamp(getSettings()?.selectionStamp);
	const selectedLayer = el("div", "aa-gallery-card__selected-layer");
	const rating = el("span", { className: "aa-gallery-card__rating", attrs: { hidden: true } });
	const actions = el("div", { className: "aa-gallery-card__actions", attrs: { role: "group", "aria-label": label("card.actions", "Image actions") } });
	const view = {
		root: card, node: null, controller: null, post: null, image: null, currentSrc: "", hoverTimer: 0, selectionPending: false, visibleActions: 0,
	};
	const actionButton = (iconName, action, actionIndex, onClick) => {
		const control = iconButton({ iconName, label: "", variant: "ghost", className: `aa-gallery-card-action is-${action}`, onClick: (event) => { event?.stopPropagation?.(); onClick(event); if (event?.detail) control.blur(); } });
		control.style.setProperty("--aa-gallery-action-delay", `${actionIndex * 34}ms`);
		return control;
	};
	const editAction = actionButton("edit", "edit", 0, () => view.controller.openEditor(view.post).catch(view.controller.showError));
	editAction.setAttribute("aria-label", label("card.edit", "Edit image tags")); editAction.title = label("card.edit", "Edit image tags");
	const favoriteAction = actionButton("favorite", "favorite", 1, async () => {
		const post = view.post; const targetFavorite = !Boolean(post.favorite);
		if (!canWriteFavorite(post.source, targetFavorite)) return;
		try { await view.controller.toggleFavorite(post); card._aaGalleryUpdate?.(); favoriteAction.classList.add("is-acknowledged"); notifyFavorite(post.source, targetFavorite); }
		catch (error) { notifyFavorite(post.source, targetFavorite, error); view.controller.showError(error); }
	});
	const copyPromptAction = actionButton("copy", "copyPrompt", 2, async () => {
		try { if (await view.controller.copyPostPrompt(view.post)) copyPromptAction.classList.add("is-acknowledged"); }
		catch (error) { view.controller.showError(error); }
	});
	copyPromptAction.setAttribute("aria-label", label("card.copyPrompt", "Copy prompt")); copyPromptAction.title = label("card.copyPrompt", "Copy prompt");
	const interrogateAction = actionButton("scan", "interrogate", 3, async () => {
		try { await view.controller.interrogatePost(view.post, card, interrogateAction); interrogateAction.classList.add("is-acknowledged"); }
		catch (error) { view.controller.showError(error); }
	});
	interrogateAction.setAttribute("aria-label", label("card.interrogate", "Interrogate prompt")); interrogateAction.title = label("card.interrogate", "Interrogate prompt");
	const downloadAction = actionButton("download", "download", 4, () => view.controller.downloadOriginal(view.post, downloadAction).catch(view.controller.showError));
	downloadAction.setAttribute("aria-label", label("card.download", "Download original")); downloadAction.title = label("card.download", "Download original");
	const detailAction = actionButton("note", "detail", 5, () => view.controller.openDetail(view.post).catch(view.controller.showError));
	detailAction.setAttribute("aria-label", label("card.detail", "View details")); detailAction.title = label("card.detail", "View details");
	const actionControls = [editAction, favoriteAction, copyPromptAction, interrogateAction, downloadAction, detailAction];
	actions.append(...actionControls);
	surface.append(el("div", { className: "aa-gallery-card__loading", attrs: { "aria-hidden": "true" } }), selectedLayer, el("div", { className: "aa-gallery-card__shade" }), el("div", { className: "aa-gallery-card__scan", attrs: { "aria-hidden": "true" } }), rating, selectionStamp.root, errorLayer, actions);
	card.append(surface);

	view.handleImageLoad = (image) => {
		if (image !== view.image || !view.post) return;
		surface.classList.remove("is-loading", "is-error");
		failedPreviewSources.delete(view.currentSrc);
		if (image.naturalWidth > 0 && image.naturalHeight > 0) view.controller.updateSize(view.post, image.naturalWidth, image.naturalHeight);
	};
	view.handleImageError = (image) => {
		if (image !== view.image || !view.post) return;
		surface.classList.remove("is-loading");
		surface.classList.add("is-error");
		markFailedPreview(view.currentSrc);
		void view.controller.recoverPreview(view.post, image);
	};

	view.bind = (node, controller, post, deferImage = false) => {
		view.node = node; view.controller = controller; view.post = post;
		downloadAction._aaGalleryDownloadOperation = null;
		downloadAction.disabled = false;
		downloadAction.classList.remove("is-downloading");
		downloadAction.querySelector(".aa-ui-icon")?.replaceWith(icon("download"));
		const src = proxyUrl(post.source, post.previewUrl);
		view.currentSrc = src;
		let image = view.image;
		const boundSrc = image ? (image.dataset.deferred === "1" ? image.dataset.src : image.getAttribute("src")) : null;
		if (image && boundSrc !== src) { releaseCardImage(view, image); image = null; }
		if (!image) {
			const pooled = takePreviewImage(src);
			if (pooled) {
				// 池只持有已解码图片，取出后所有权转给当前卡片。
				image = pooled.image; image._aaCardView = view;
				controller.updateSize(post, pooled.width, pooled.height);
				surface.classList.remove("is-loading", "is-error");
			} else {
				image = createCardImage(); image._aaCardView = view;
				image.width = Math.max(1, Number(post.width) || 1); image.height = Math.max(1, Number(post.height) || 1);
				const failedAt = failedPreviewSources.get(src);
				if (failedAt && failedAt > Date.now()) {
					// 已知失败：不重复请求注定失败的 URL，直接走恢复链路换真实来源。
					surface.classList.remove("is-loading");
					surface.classList.add("is-error");
					void controller.recoverPreview(post, image);
				} else {
					surface.classList.remove("is-error");
					surface.classList.add("is-loading");
					if (deferImage) {
						// 滚动活跃期挂载的卡片只占位，滚动停止后由入口统一补挂 src。
						image.dataset.deferred = "1";
						image.dataset.src = src;
					} else image.src = src;
				}
			}
			surface.insertBefore(image, selectedLayer);
			view.image = image;
		}
		const favoriteCapability = capability(post.source);
		const favoriteVisible = Boolean(favoriteCapability?.favoriteRead || favoriteCapability?.favoriteWrite);
		// .aa-ui-button 的 display 声明会覆盖 hidden 属性，显隐必须走 inline style。
		favoriteAction.style.display = favoriteVisible ? "" : "none";
		interrogateAction.style.display = isPromptAssistantAvailable() ? "" : "none";
		downloadAction.style.display = favoriteCapability?.download ? "" : "none";
		view.favoriteVisible = favoriteVisible;
		view.visibleActions = actionControls.filter((control) => control.style.display !== "none").length;
		const hasRating = Boolean(post.rating) && Boolean(favoriteCapability?.ratings?.length);
		rating.hidden = !hasRating;
		if (hasRating) { rating.dataset.rating = ratingTone(post.rating); rating.textContent = ratingLabel(post.rating); }
		view.update();
	};

	view.update = () => {
		const post = view.post; if (!post || !view.node) return;
		const selected = stateFor(view.node).selections.some((item) => selectionKey(item) === `${post.source}:${post.postId}`);
		const previousSelected = card.dataset.selected;
		card.classList.toggle("is-selected", selected);
		selectionStamp.setStyle(getSettings()?.selectionStamp);
		card.dataset.selected = String(selected);
		if (previousSelected != null && previousSelected !== String(selected)) card.classList.add("is-selection-feedback");
		if (view.favoriteVisible) { favoriteAction.classList.toggle("is-active", Boolean(post.favorite)); favoriteAction.setAttribute("aria-label", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite")); favoriteAction.title = favoriteAction.getAttribute("aria-label"); }
		card.setAttribute("aria-label", `${post.source} #${post.postId} · ${selected ? label("card.cancel", "Cancel selection") : label("card.select", "Select image")}`);
	};
	card._aaGalleryUpdate = () => view.update();
	card._aaVirtualMasonryLayout = (width, height) => { card.dataset.actionsLayout = galleryCardActionLayout(width, height, view.visibleActions); };

	const runSelection = async (event = null) => {
		if (view.selectionPending || !view.post) return;
		view.controller.tooltip.hide();
		if (event?.type === "click") card.blur();
		view.selectionPending = true; card.classList.add("is-selection-pending");
		try { await view.controller.toggleSelection(view.post); }
		catch (error) { view.controller.showError(error); }
		finally { view.selectionPending = false; card.classList.remove("is-selection-pending"); }
	};
	errorLayer.addEventListener("click", () => {
		const image = view.image; const src = view.currentSrc;
		if (!image || !src) return;
		surface.classList.remove("is-error");
		surface.classList.add("is-loading");
		failedPreviewSources.delete(src);
		image.removeAttribute("src");
		image.src = src;
	});
	card.addEventListener("animationend", (event) => {
		if (event.animationName === "aa-gallery-selection-feedback") card.classList.remove("is-selection-feedback");
		if (event.animationName === "aa-gallery-favorite-feedback") event.target.classList?.remove("is-acknowledged");
	});
	card.addEventListener("click", (event) => runSelection(event));
	card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runSelection(); } });
	card.addEventListener("mouseenter", () => { if (!getSettings()?.tooltip || !view.controller) return; view.hoverTimer = setTimeout(() => view.controller?.showHover(card, view.post), 280); });
	card.addEventListener("mouseleave", () => { clearTimeout(view.hoverTimer); view.hoverTimer = 0; view.controller?.tooltip.hide(); });
	card._aaVirtualMasonryDispose = () => {
		clearTimeout(view.hoverTimer); view.hoverTimer = 0;
		view.node = null; view.controller = null; view.post = null; view.selectionPending = false;
		card.classList.remove("is-selection-pending", "is-interrogating", "is-selection-feedback");
		if (cardViewPool.length < MAX_POOLED_CARD_VIEWS) cardViewPool.push(view);
		else if (view.image) { releaseCardImage(view, view.image); view.image = null; }
	};
	return view;
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
		createGalleryCard, createGalleryTagPills, createSelectedRow, galleryCardActionLayout, installMasonryCardMotion,
		moveSelectionIndex, resolveSelectedDropTarget,
	};
}
