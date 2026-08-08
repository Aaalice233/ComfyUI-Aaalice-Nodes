/** Stateful browse/selection controller for one mounted Booru Gallery node. */
export function createGalleryControllerFactory(dependencies) {
	const {
		API, GALLERY_CATEGORIES, STATIC_EXTENSIONS,
		addGlobalBlacklistTag, addGlobalOutputFilterTag, app, blobToDataUrl, button, canWriteFavorite, capability,
		copyImageToClipboard, createDetailImageViewer, createDialog, createGalleryTagPills,
		createTooltip, currentLocale, dimensions, effectivePrompt, el, fetchMediaBlob,
		fileSizeLabel, finalPrompt, hasSourceCredentials, icon, jsonRequest, label,
		moveSelectionIndex, normalizeTagGroups, notifyFavorite, openInterrogateResultDialog,
		openSingleSelectionDialog, proxyUrl, ratingLabel, ratingTone, resolveSelectedDropTarget,
		searchQuery, sectionHeading, selectionFromDetail, selectionKey, stateFor,
		streamTagTranslations, tagCount, transact, promptAssistantApi,
	} = dependencies;

return function buildController(node, elements) {
	let posts = []; let knownPostKeys = new Set(); let pageSegments = []; let nextCursor = null; let ended = false; let loading = false; let requestController = null; let generation = 0; let detailDialogGeneration = 0; let destroyed = false; let activeDetailDialog = null; const sessionEdits = new Map();
	const detailCache = new Map(); const previewCache = new Map(); let previewGeneration = 0; let previewPrefetchActive = 0; const previewPrefetchQueue = []; const previewPrefetchPending = new Set(); const prefetchedPreviewSources = new Map();
	const touchCache = (cache, key, value) => { cache.delete(key); cache.set(key, value); return value; };
	const trimCache = (cache, maximum) => { while (cache.size > maximum) cache.delete(cache.keys().next().value); };
	const trimPreviewCache = () => { while (previewCache.size > 16) { const key = previewCache.keys().next().value; const entry = previewCache.get(key); if (!entry.ready) entry.loader.src = ""; previewCache.delete(key); } };
	const rotatePreviewCache = () => {
		previewGeneration += 1;
		clearTimeout(prefetchTimer); prefetchTimer = 0;
		previewPrefetchQueue.length = 0; previewPrefetchPending.clear(); prefetchedPreviewSources.clear();
		for (const entry of previewCache.values()) if (!entry.ready) entry.loader.src = "";
		previewCache.clear();
	};
	const cacheImage = (src) => {
		if (!src) return null;
		const cached = previewCache.get(src); if (cached) return touchCache(previewCache, src, cached);
		const cacheGeneration = previewGeneration; const loader = new Image(); loader.decoding = "async";
		const entry = { loader, ready: false, promise: null };
		entry.promise = new Promise((resolve, reject) => {
			loader.addEventListener("load", () => resolve(src), { once: true });
			loader.addEventListener("error", () => reject(new Error(`Gallery preview failed: ${src}`)), { once: true });
			loader.src = src;
		}).then((value) => { if (cacheGeneration === previewGeneration && previewCache.get(src) === entry) entry.ready = true; return value; })
			.catch((error) => { if (previewCache.get(src) === entry) previewCache.delete(src); throw error; });
		previewCache.set(src, entry); trimPreviewCache(); return entry;
	};
	let pageCommitTimer = 0;
	let selectedDragFrom = null;
	let selectedDropInsertBefore = null;
	const tooltip = createTooltip({ delay: 0, closeDelay: 120 });
	let errorTimer = 0;
	const showError = (error) => {
		// 已知上游失败签名映射为可操作提示；原始信息保留在 console。
		const text = error?.code === "upstream_timeout"
			? label("error.upstreamTimeout", "The site took too long to sort this many results. Add more tags or filters to narrow the search.")
			: error?.message || String(error);
		elements.errorLabel.textContent = text; elements.error.hidden = false; console.error("[Aaalice] Booru Gallery", error);
		// 位置随场景：页面没有任何图像卡片（首次加载、凭证缺失等）时错误横幅
		// 放在顶部避免被误认为状态条；瀑布流已有内容时保持底部，少遮挡结果。
		elements.error.classList.toggle("is-top", !posts.length);
		clearTimeout(errorTimer);
		// 凭证缺失属于持续状态：横幅保持到配置完成或下一次成功刷新，不自动消失。
		if (error?.code === "credentials_required") { errorTimer = 0; return; }
		errorTimer = setTimeout(() => { elements.error.hidden = true; }, 6000);
	};
	const clearError = () => { clearTimeout(errorTimer); errorTimer = 0; elements.error.hidden = true; elements.errorLabel.textContent = ""; };
	const setLoading = (value) => { loading = value; elements.loading.hidden = !value; elements.pageControl?.setBusy?.(value); };
	const addTagToSearch = (tag) => {
		const source = stateFor(node).source;
		const cap = capability(source);
		if (!cap?.tagSearch) return false;
		const maxTags = source === "danbooru" && hasSourceCredentials(source) ? null : cap.maxSearchTags;
		return elements.searchControl.addTag(tag, maxTags);
	};
	const refreshCards = () => elements.masonry.querySelectorAll(".aa-gallery-card").forEach((card) => card._aaGalleryUpdate?.());
	const hideSelectedDropIndicator = () => {
		selectedDropInsertBefore = null;
		const indicator = elements.selectedDropIndicator;
		if (!indicator) return;
		indicator.hidden = true;
		indicator.classList.remove("is-visible");
		indicator.style.removeProperty("left");
		indicator.style.removeProperty("width");
		indicator.style.removeProperty("top");
	};
	const clearSelectedDragClasses = () => {
		elements.selectedListRoot?.querySelectorAll(".aa-gallery-selected-row.is-dragging, .aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
	};
	const endSelectedDrag = () => {
		selectedDragFrom = null;
		hideSelectedDropIndicator();
		clearSelectedDragClasses();
		elements.selectedListRoot?.classList.remove("is-reordering");
	};
	const beginSelectedDrag = (index, row) => {
		selectedDragFrom = index;
		selectedDropInsertBefore = null;
		elements.selectedListRoot?.classList.add("is-reordering");
		clearSelectedDragClasses();
		row?.classList.add("is-dragging");
		hideSelectedDropIndicator();
	};
	const showSelectedDropIndicator = (target) => {
		const indicator = elements.selectedDropIndicator;
		if (!indicator || !target?.row) {
			hideSelectedDropIndicator();
			return;
		}
		const rect = target.row.getBoundingClientRect();
		const y = target.before ? rect.top : rect.bottom;
		indicator.hidden = false;
		indicator.classList.add("is-visible");
		indicator.style.left = `${Math.round(rect.left + 10)}px`;
		indicator.style.width = `${Math.max(48, Math.round(rect.width - 20))}px`;
		indicator.style.top = `${Math.round(y - 1.5)}px`;
		elements.selectedListRoot?.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
		target.row.classList.toggle("is-drop-before", target.before);
		target.row.classList.toggle("is-drop-after", !target.before);
	};
	const handleSelectedDragOver = (event) => {
		if (selectedDragFrom == null || !elements.selectedListRoot) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		const target = resolveSelectedDropTarget(elements.selectedListRoot, event.clientY);
		if (!target) {
			hideSelectedDropIndicator();
			return;
		}
		const dest = moveSelectionIndex(selectedDragFrom, target.insertBefore);
		selectedDropInsertBefore = dest == null ? null : target.insertBefore;
		if (dest == null) {
			hideSelectedDropIndicator();
			elements.selectedListRoot.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
				.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
			return;
		}
		showSelectedDropIndicator(target);
	};
	const handleSelectedDrop = (event) => {
		if (selectedDragFrom == null || !elements.selectedListRoot) return;
		event.preventDefault();
		const rawFrom = event.dataTransfer.getData("text/x-aa-gallery-index") || event.dataTransfer.getData("text/plain");
		const from = Number.isInteger(selectedDragFrom) ? selectedDragFrom : Number(rawFrom);
		const target = resolveSelectedDropTarget(elements.selectedListRoot, event.clientY);
		const insertBefore = target?.insertBefore ?? selectedDropInsertBefore;
		const dest = moveSelectionIndex(from, insertBefore);
		endSelectedDrag();
		if (dest == null) return;
		transact(node, (state) => {
			if (from < 0 || from >= state.selections.length || dest < 0 || dest >= state.selections.length) return;
			const [item] = state.selections.splice(from, 1);
			state.selections.splice(dest, 0, item);
		});
		renderSelected();
		refreshCards();
	};
	const handleSelectedDragLeave = (event) => {
		if (!elements.selectedListRoot || selectedDragFrom == null) return;
		if (elements.selectedListRoot.contains(event.relatedTarget)) return;
		hideSelectedDropIndicator();
		elements.selectedListRoot.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
	};
	const renderSelected = () => {
		tooltip.hide();
		if (selectedDragFrom == null) endSelectedDrag();
		const state = stateFor(node); const count = state.selections.length;
		elements.selectedList.setItems(state.selections, { preserveScroll: true });
		elements.tabs.setValue(elements.mode);
		elements.selectionMode.setValue(state.selectionMode);
		if (elements.selectedCount) {
			elements.selectedCount.textContent = String(count);
			elements.selectedCount.setAttribute("aria-label", label("selected.outputHint", "{count} outputs").replace("{count}", String(count)));
		}
		if (elements.selectedSummary) elements.selectedSummary.textContent = label("selected.summary", "{count} images · output in this order").replace("{count}", String(count));
		if (elements.selectedClear) elements.selectedClear.disabled = count === 0;
		elements.emptySelected.hidden = count > 0;
	};
	const setMode = (mode, { persist = true } = {}) => {
		mode = mode === "selected" ? "selected" : "browse";
		if (elements.mode === mode) return;
		tooltip.hide();
		endSelectedDrag();
		elements.mode = mode;
		elements.root.dataset.mode = mode;
		if (persist) transact(node, (state) => { state.view = mode; });
		renderSelected();
	};
	const setSelectionMode = (mode, { persist = true } = {}) => {
		mode = mode === "single" ? "single" : "multi";
		const current = stateFor(node).selectionMode;
		if (!persist) { elements.selectionMode.setValue(current); return; }
		if (current === mode) { elements.selectionMode.setValue(current); return; }
		if (mode === "single" && stateFor(node).selections.length > 1) {
			elements.selectionMode.setValue(current);
			openSingleSelectionDialog(() => {
				transact(node, (state) => { state.selectionMode = "single"; state.selections = state.selections.slice(0, 1); });
				renderSelected();
				refreshCards();
			});
			return;
		}
		transact(node, (state) => { state.selectionMode = mode; });
		renderSelected();
	};
	const rememberPage = (page) => {
		const value = Math.max(1, Math.floor(Number(page) || 1));
		const state = stateFor(node); if (state.navigation.page === value) return;
		// 页码立即写入内存并投影到 DOM；图 dirty 信号合并到滚动停止后，避免
		// 快速滚动跨页时 graph.change() 强制整张画布前景+背景全量重绘。
		state.navigation.page = value; elements.pageControl?.setPage(value);
		clearTimeout(pageCommitTimer);
		pageCommitTimer = setTimeout(() => { pageCommitTimer = 0; node.graph?.change?.(); }, 250);
	};
	const search = async ({ reset = false, page = null } = {}) => {
		if ((!reset && loading) || (ended && !reset)) return;
		const requestedPage = reset ? Math.max(1, Math.floor(Number(page ?? stateFor(node).navigation.page) || 1)) : null;
		// Mark the request active before clearing the masonry. setItems() draws synchronously
		// and may report near-end; that callback must not start a competing first-page request.
		setLoading(true);
		if (reset) { requestController?.abort(); requestController = new AbortController(); generation += 1; rotatePreviewCache(); posts = []; knownPostKeys = new Set(); pageSegments = []; nextCursor = null; ended = false; elements.masonryController.setItems([], { preserveScroll: false }); elements.end.hidden = true; elements.emptyResults.hidden = true; clearError(); rememberPage(requestedPage); }
		else requestController ||= new AbortController();
		const currentGeneration = generation; const state = stateFor(node);
		const favoritesFeed = state.filters.feed === "favorites";
		const cap = capability(state.source);
		const needsCredentials = (cap?.authRequired || (favoritesFeed && cap?.favoriteRead)) && !hasSourceCredentials(state.source);
		if (needsCredentials) {
			const credentialsError = new Error(label("error.credentialsRequired", "This source requires account credentials. Click here to open Gallery settings."));
			credentialsError.code = "credentials_required";
			showError(credentialsError);
			setLoading(false);
			return;
		}
		try {
			const favorites = state.filters.feed === "favorites";
			const params = new URLSearchParams({ source: state.source, limit: "60" });
			if (!favorites) { params.set("query", searchQuery(state)); params.set("sort", state.filters.sort); for (const rating of state.filters.ratings) params.append("rating", rating); }
			if (requestedPage != null) params.set("page", String(requestedPage)); else if (nextCursor) params.set("cursor", nextCursor);
			const endpoint = favorites ? "favorites" : state.filters.feed === "ranking" ? "ranking" : "search";
			if (state.filters.feed === "ranking") { params.delete("query"); params.delete("sort"); params.set("period", state.filters.period); }
			const resultPage = await jsonRequest(`${API}/${endpoint}?${params}`, { signal: requestController.signal });
			if (currentGeneration !== generation || requestController.signal.aborted) return;
			const additions = (resultPage.posts || []).filter((post) => {
				if (!post.previewUrl?.startsWith("https://")) return false;
				const key = `${post.source}:${post.postId}`; if (knownPostKeys.has(key)) return false; knownPostKeys.add(key); return true;
			});
			const start = posts.length; posts.push(...additions); pageSegments.push({ page: Math.max(1, Number(resultPage.page) || requestedPage || pageSegments.at(-1)?.page + 1 || 1), start, end: posts.length }); elements.masonryController.append(additions);
			nextCursor = resultPage.nextCursor || null; ended = Boolean(resultPage.ended || !nextCursor);
		const noResults = ended && !posts.length;
		elements.end.hidden = !ended || noResults; elements.emptyResults.hidden = !noResults;
		if (noResults) {
			const anonymousHidden = (resultPage.warnings || []).includes("restricted-media-hidden");
			elements.emptyResults.querySelector("span").textContent = anonymousHidden
				? label("warning.restrictedMediaHidden", "Danbooru hides loli/shota posts from member and anonymous accounts; only Builder-level and above can view them.")
				: label("emptyResults", "No posts match this search. Try widening the rating filter or reducing blocked tags.");
		}
		clearError();
		} catch (error) { if (error.name !== "AbortError") showError(error); }
		finally { if (currentGeneration === generation) setLoading(false); }
	};
	const visibleIndexChanged = (index) => {
		// 页段按起始下标有序排列；滚动定位在页码数量增长后仍保持对数查找。
		let low = 0; let high = pageSegments.length;
		while (low < high) {
			const middle = (low + high) >>> 1; const segment = pageSegments[middle];
			if (index < segment.start) high = middle;
			else if (index >= segment.end) low = middle + 1;
			else { rememberPage(segment.page); return; }
		}
	};
	const getDetail = (post) => {
		const key = `${post.source}:${post.postId}`; const cached = detailCache.get(key); if (cached) return touchCache(detailCache, key, cached);
		const request = jsonRequest(`${API}/detail?${new URLSearchParams({ source: post.source, postId: post.postId })}`).then((response) => {
			if (!response.mediaUrl || !STATIC_EXTENSIONS.has(String(response.fileExt).toLowerCase())) throw new Error(label("error.staticOnly", "Only static JPG, PNG, WebP, and GIF posts can be selected."));
			return response;
		}).catch((error) => { if (detailCache.get(key) === request) detailCache.delete(key); throw error; });
		detailCache.set(key, request); trimCache(detailCache, 128); return request;
	};
	const drainPreviewPrefetch = () => {
		while (!destroyed && previewPrefetchActive < 4 && previewPrefetchQueue.length) {
			const task = previewPrefetchQueue.shift();
			if (task.generation !== previewGeneration) { previewPrefetchPending.delete(task.key); continue; }
			previewPrefetchActive += 1;
			// Sample 地址已随搜索结果返回：直接下载大图，不再先等 Detail。
			cacheImage(task.sampleSrc)?.promise
				.catch(() => { if (task.generation === previewGeneration) prefetchedPreviewSources.delete(task.key); })
				.finally(() => { previewPrefetchActive -= 1; previewPrefetchPending.delete(task.key); drainPreviewPrefetch(); });
		}
	};
	let prefetchTimer = 0;
	const prefetchVisible = (visiblePosts) => {
		// 快速滚动时可见集合每帧变化；预取合并到滚动停止后一次执行，
		// 避免滚动帧中持续创建 Image 并触发 sample 下载与解码。
		clearTimeout(prefetchTimer);
		prefetchTimer = setTimeout(() => {
			prefetchTimer = 0;
			for (const post of visiblePosts.slice(0, 12)) {
				const key = `${post.source}:${post.postId}`;
				// 只预取真正的 Sample / Large Preview；AI TAG 的预览即原图，不批量下载。
				const sampleUrl = post.sampleUrl && post.sampleUrl !== post.previewUrl ? post.sampleUrl : null;
				if (!sampleUrl?.startsWith("https://")) continue;
				const sampleSrc = proxyUrl(post.source, sampleUrl);
				if (previewPrefetchPending.has(key) || prefetchedPreviewSources.get(key) === sampleSrc || previewCache.has(sampleSrc)) continue;
				previewPrefetchPending.add(key); prefetchedPreviewSources.set(key, sampleSrc);
				previewPrefetchQueue.push({ key, sampleSrc, generation: previewGeneration });
			}
			drainPreviewPrefetch();
		}, 150);
	};
	const recoverPreview = async (post, image) => {
		if (post.source !== "aitag" || image.dataset.previewRecovery) return;
		image.dataset.previewRecovery = "pending";
		try {
			const detail = await getDetail(post);
			if (!detail.previewUrl || detail.previewUrl === post.previewUrl) return;
			post.previewUrl = detail.previewUrl;
			post.width = detail.width;
			post.height = detail.height;
			image.dataset.previewRecovery = "done";
			image.parentElement?.classList.add("is-loading");
			image.parentElement?.classList.remove("is-error");
			image.src = proxyUrl(detail.source, detail.previewUrl);
		} catch (error) {
			image.dataset.previewRecovery = "failed";
			console.error(`[Aaalice] AI TAG preview recovery failed for ${post.postId}:`, error);
		}
	};
	const toggleSelection = async (post) => {
		const key = `${post.source}:${post.postId}`; const index = stateFor(node).selections.findIndex((item) => selectionKey(item) === key);
		if (index >= 0) transact(node, (state) => state.selections.splice(index, 1));
		else { const detail = await getDetail(post); const selection = selectionFromDetail(detail, sessionEdits.get(key)); if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete.")); transact(node, (state) => { state.selections = state.selectionMode === "single" ? [selection] : [...state.selections, selection]; }); }
		renderSelected(); refreshCards();
	};
	const toggleFavorite = async (post) => {
		const previous = Boolean(post.favorite); const response = await jsonRequest(`${API}/favorite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: post.source, postId: post.postId, favorite: !previous }) });
		post.favorite = Boolean(response.favorite); return post.favorite;
	};
	const copyPostPrompt = async (post) => {
		const key = `${post.source}:${post.postId}`;
		const detail = await getDetail(post);
		const selection = selectionFromDetail(detail, sessionEdits.get(key));
		if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete."));
		const text = finalPrompt(selection, effectivePrompt(node)).trim();
		if (!text) {
			app.extensionManager.toast.add({ severity: "warning", summary: label("card.copyPrompt", "Copy prompt"), detail: label("selected.noPrompt", "No prompt tags in the current category selection"), life: 4000 });
			return false;
		}
		await navigator.clipboard.writeText(text);
		app.extensionManager.toast.add({ severity: "success", summary: label("card.copyPrompt", "Copy prompt"), detail: label("card.promptCopied", "Prompt copied to clipboard"), life: 3200 });
		return true;
	};
	const interrogatePost = async (post, card, control) => {
		card.classList.add("is-interrogating");
		if (control) control.disabled = true;
		try {
			const detail = await getDetail(post);
			const mediaSrc = detail.mediaUrl || detail.sampleUrl || detail.previewUrl;
			if (!mediaSrc) throw new Error(label("error.incomplete", "The post detail is incomplete."));
			const imageData = await blobToDataUrl(await fetchMediaBlob(proxyUrl(detail.source, mediaSrc)));
			const base = promptAssistantApi?.();
			if (!base) throw new Error(label("interrogate.failed", "Interrogation failed."));
			const result = await jsonRequest(`${base}/vlm/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: imageData, request_id: crypto.randomUUID() }) });
			if (!result?.success) throw new Error(result?.error || label("interrogate.failed", "Interrogation failed."));
			if (destroyed) return;
			openInterrogateResultDialog(detail, String(result.data?.description || ""));
		} finally {
			card.classList.remove("is-interrogating");
			if (control) control.disabled = false;
		}
	};
	const showHover = (anchor, post) => {
		const previewSrc = proxyUrl(post.source, post.previewUrl);
		// Sample 地址随搜索结果返回：已预取就绪时直接以 Sample 起步，跳过小图阶段。
		const searchSample = post.sampleUrl && post.sampleUrl !== post.previewUrl ? post.sampleUrl : null;
		const searchSampleSrc = searchSample ? proxyUrl(post.source, searchSample) : null;
		const readySampleSrc = searchSampleSrc && previewCache.get(searchSampleSrc)?.ready ? searchSampleSrc : null;
		// 双层图片：base 常驻，sample 就绪后作为 upgrade 叠加层淡入覆盖，
		// 淡化结束后把 src 落回 base 并收起叠加层，避免硬切造成的闪变。
		const base = el("img", { attrs: { src: readySampleSrc || previewSrc, alt: "", decoding: "async" } });
		const upgrade = el("img", { className: "is-upgrade", attrs: { alt: "", decoding: "async", hidden: true } });
		// 大图始终按原图比例完整显示：先缩放进 320×420 盒子（不放大），再为底部信息区
		// 保证最小可读宽高；图片本体 contain 居中，宽高与容器不一致时留背景边而非裁切。
		// 尺寸在 show 时一次锁定，只有 detail 返回的真实宽高与当前值不同才重算，
		// 避免悬浮框在加载过程中反复改变尺寸并重新定位。
		let lockedSize = null;
		const applyHoverImageSize = (item) => {
			const width = Number(item?.width); const height = Number(item?.height);
			// 盒子只由宽高比决定：卡片会把 post 尺寸改写成预览图的自然像素，
			// 若按绝对像素计算，Detail 到达后盒子会从预览比例突然撑大到原图比例。
			// 预览/原图比例一致，按比例适配 320×420 时两种尺寸算出同一盒子。
			const next = !(width > 0) || !(height > 0)
				? { width: 320, height: 240 }
				: (() => { const scale = Math.min(320 / width, 420 / height); return { width: Math.max(240, Math.round(width * scale)), height: Math.max(150, Math.round(height * scale)) }; })();
			if (lockedSize && Math.abs(lockedSize.width - next.width) <= 2 && Math.abs(lockedSize.height - next.height) <= 2) return;
			lockedSize = next;
			content.style.setProperty("--aa-gallery-hover-image-width", `${next.width}px`);
			content.style.setProperty("--aa-gallery-hover-image-height", `${next.height}px`);
			// 尺寸过渡结束前按最终尺寸重定位，避免过渡中间测量把浮层留在视口外。
			content.addEventListener("transitionend", () => tooltip.reposition(), { once: true });
		};
		const resolution = el("dd", null, dimensions(post));
		const format = el("dd", null, "—");
		const size = el("dd", null, "—");
		const tags = el("dd", null, "—");
		const hasRating = Boolean(post.rating) && Boolean(capability(post.source)?.ratings?.length);
		const rating = hasRating ? el("span", { className: "aa-gallery-hover__rating", attrs: { "data-rating": ratingTone(post.rating) }, text: ratingLabel(post.rating) }) : null;
		const loading = el("span", { className: "aa-gallery-hover__loading", attrs: { role: "status", "aria-label": label("hover.loading", "Loading larger preview…") }, children: [icon("loading")] });
		const facts = [
			[label("detail.resolution", "Resolution"), resolution], [label("detail.format", "Format"), format],
			[label("detail.fileSize", "File size"), size], [label("detail.tags", "Tags"), tags],
		];
		const tagRows = Object.fromEntries(["artist", "character", "copyright"].map((category) => {
			const row = el("div", { className: `aa-gallery-hover__tag-row is-${category}`, attrs: { hidden: true }, children: [
				el("span", null, label(`category.${category}`, category)), el("p"),
			] });
			return [category, row];
		}));
		const info = el("div", { className: "aa-gallery-hover__info", children: [
				el("dl", { children: facts.map(([term, value]) => el("div", { children: [el("dt", null, term), value] })) }),
				el("div", { className: "aa-gallery-hover__tags", children: Object.values(tagRows) }),
			] });
		const content = el("div", { className: "aa-gallery-hover", children: [
			el("div", { className: "aa-gallery-hover__media", children: [base, upgrade, loading, ...(rating ? [rating] : []), info] }),
		] });
		applyHoverImageSize(post);
		base.addEventListener("load", () => { if (upgrade.hidden) tooltip.reposition(); });
		base.addEventListener("error", () => {
			loading.hidden = true;
			// 预览图失败时若已有 Sample 来源，直接尝试以 Sample 作为底图。
			if (sampleRequested && base.getAttribute("src") !== sampleRequested) base.src = sampleRequested;
		});
		tooltip.show(anchor, content, { className: "aa-gallery-hover-tooltip", immediate: true, interactive: false, placement: "side" });
		let sampleRequested = null;
		const upgradeSample = (sampleSrc) => {
			if (sampleRequested === sampleSrc || base.getAttribute("src") === sampleSrc) return;
			sampleRequested = sampleSrc;
			const cachedImage = cacheImage(sampleSrc);
			const apply = () => {
				if (!content.isConnected || !tooltip.isOpenFor(anchor) || sampleRequested !== sampleSrc) return;
				loading.hidden = true;
				const settle = () => {
					if (sampleRequested !== sampleSrc || !upgrade.classList.contains("is-visible")) return;
					base.src = sampleSrc;
					upgrade.classList.remove("is-visible");
					upgrade.hidden = true;
					upgrade.removeAttribute("src");
				};
				upgrade.addEventListener("transitionend", settle, { once: true });
				upgrade.src = sampleSrc;
				upgrade.hidden = false;
				requestAnimationFrame(() => upgrade.classList.add("is-visible"));
			};
			if (cachedImage?.ready) apply();
			else { loading.hidden = false; void cachedImage?.promise.then(apply).catch(() => { if (sampleRequested === sampleSrc) loading.hidden = true; }); }
		};
		if (readySampleSrc) { sampleRequested = readySampleSrc; loading.hidden = true; }
		else if (searchSampleSrc) upgradeSample(searchSampleSrc);
		void getDetail(post).then((detail) => {
			if (!content.isConnected || !tooltip.isOpenFor(anchor)) return;
			resolution.textContent = dimensions(detail); format.textContent = detail.fileExt?.toUpperCase() || "—";
			size.textContent = fileSizeLabel(detail.fileSize); tags.textContent = String(tagCount(detail.tags));
			if (rating) { rating.dataset.rating = ratingTone(detail.rating); rating.textContent = ratingLabel(detail.rating); }
			applyHoverImageSize(detail);
			for (const [category, row] of Object.entries(tagRows)) {
				const values = detail.tags?.[category] || [];
				row.hidden = !values.length;
				row.querySelector("p").textContent = values.slice(0, 2).join(" · ");
			}
			const detailSample = detail.sampleUrl && detail.sampleUrl !== post.previewUrl ? detail.sampleUrl : null;
			if (detailSample && detailSample !== post.sampleUrl) upgradeSample(proxyUrl(detail.source, detailSample));
			if (!detailSample && !searchSample) loading.hidden = true;
		}).catch(() => { loading.hidden = true; });
	};
	const openDetail = async (post) => {
		const openGeneration = ++detailDialogGeneration; activeDetailDialog?.close(); activeDetailDialog = null;
		const detail = await getDetail(post); const key = `${post.source}:${post.postId}`; const selected = stateFor(node).selections.some((item) => selectionKey(item) === key);
		if (destroyed || openGeneration !== detailDialogGeneration) return;
		const selectedSnapshot = stateFor(node).selections.find((item) => selectionKey(item) === key);
		const detailDrafts = normalizeTagGroups(selectedSnapshot?.editedTags || sessionEdits.get(key) || detail.tags);
		const detailCounts = {};
		const detailPillLists = {};
		const translationAbort = new AbortController();
		const detailTokens = (category) => detailDrafts[category].map((tag) => ({ category, raw: tag, text: tag }));
		const mutateDetailTag = (category, mutation) => {
			if (mutation.type !== "rename") return null;
			const index = detailDrafts[category].indexOf(mutation.raw);
			const value = String(mutation.value || "").trim();
			if (index < 0 || !value) return null;
			detailDrafts[category][index] = value;
			detailDrafts[category] = [...new Set(detailDrafts[category])];
			const editedTags = normalizeTagGroups(detailDrafts);
			if (selectedSnapshot) transact(node, (state) => { const current = state.selections.find((item) => selectionKey(item) === key); if (current) current.editedTags = editedTags; });
			else sessionEdits.set(key, editedTags);
			if (detailCounts[category]) detailCounts[category].textContent = String(detailDrafts[category].length);
			renderSelected();
			return detailTokens(category);
		};
		const previewUrl = detail.sampleUrl || detail.previewUrl || post.previewUrl || detail.mediaUrl;
		const viewer = createDetailImageViewer({ previewSrc: proxyUrl(detail.source, previewUrl), originalSrc: proxyUrl(detail.source, detail.mediaUrl), alt: `${detail.source} #${detail.postId}` });
		const actions = [];
		let dialog; actions.push(button({ className: `aa-gallery-detail__action is-selection${selected ? " is-selected" : ""}`, label: selected ? label("detail.remove", "Remove selection") : label("detail.select", "Select"), variant: selected ? "danger" : "primary", onClick: async () => { await toggleSelection(detail); dialog.close(); } }));
		actions.push(button({ className: "aa-gallery-detail__action is-source", label: label("detail.source", "Open source"), iconName: "link", variant: "ghost", onClick: () => window.open(detail.postUrl, "_blank", "noopener") }));
		actions.push(button({ className: "aa-gallery-detail__action is-original", label: label("detail.original", "Open original"), iconName: "download", variant: "ghost", onClick: () => window.open(proxyUrl(detail.source, detail.mediaUrl), "_blank", "noopener") }));
		actions.push(button({ className: "aa-gallery-detail__action is-copy-image", label: label("detail.copyImage", "Copy image"), iconName: "copy", variant: "ghost", onClick: async (event) => {
			const control = event.currentTarget; control.disabled = true;
			try {
				await copyImageToClipboard(proxyUrl(detail.source, detail.mediaUrl));
				app.extensionManager.toast.add({ severity: "success", summary: label("detail.copyImage", "Copy image"), detail: label("detail.imageCopied", "Image copied to clipboard"), life: 3200 });
			} catch (error) { showError(error); }
			finally { control.disabled = false; }
		} }));
		const cap = capability(detail.source);
		if (cap?.favoriteRead || cap?.favoriteWrite) actions.push(button({ className: `aa-gallery-detail__action is-favorite${detail.favorite ? " is-active" : ""}`, label: detail.favorite ? label("detail.unfavorite", "Remove favorite") : label("detail.favorite", "Favorite"), iconName: "favorite", variant: "ghost", onClick: async (event) => { const targetFavorite = !Boolean(detail.favorite); if (!canWriteFavorite(detail.source, targetFavorite)) return; const control = event.currentTarget; const previous = Boolean(detail.favorite); detail.favorite = targetFavorite; control.disabled = true; try { await jsonRequest(`${API}/favorite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: detail.source, postId: detail.postId, favorite: detail.favorite }) }); control.classList.toggle("is-active", detail.favorite); control.querySelector(".aa-ui-button__label").textContent = detail.favorite ? label("detail.unfavorite", "Remove favorite") : label("detail.favorite", "Favorite"); notifyFavorite(detail.source, targetFavorite); } catch (error) { detail.favorite = previous; notifyFavorite(detail.source, targetFavorite, error); showError(error); } finally { control.disabled = false; } } }));
		const tagTotal = tagCount(detail.tags);
		const facts = [
			["resolution", label("detail.resolution", "Resolution"), dimensions(detail)],
			["format", label("detail.format", "Format"), detail.fileExt?.toUpperCase() || "—"],
			...(detail.rating && cap?.ratings?.length ? [[`rating-${ratingTone(detail.rating)}`, label("detail.rating", "Rating"), ratingLabel(detail.rating)]] : []),
			["tags", label("detail.tags", "Tags"), String(tagTotal)],
		];
		const inspector = el("aside", { className: "aa-gallery-detail__inspector", children: [
			el("header", { className: "aa-gallery-detail__header", children: [el("span", { className: "aa-gallery-detail__source", attrs: { "data-source": detail.source }, text: detail.source }), el("strong", null, `#${detail.postId}`)] }),
			el("dl", { className: "aa-gallery-detail__facts", children: facts.map(([fact, term, value]) => el("div", { attrs: { "data-fact": fact }, children: [el("dt", null, term), el("dd", null, value)] })) }),
			el("div", { className: "aa-gallery-detail__tag-groups", children: GALLERY_CATEGORIES.map((category) => {
				const heading = sectionHeading(label(`category.${category}`, category), String(detailDrafts[category].length));
				detailCounts[category] = heading.querySelector("small");
				const pills = createGalleryTagPills({
					tokens: detailTokens(category),
					ariaLabel: label(`category.${category}`, category),
					emptyText: label("detail.noTags", "No tags"),
					onMutate: (mutation) => mutateDetailTag(category, mutation),
					contextMenuItems: (token, { edit }) => [
						{ label: label("detail.editTag", "Edit tag"), iconName: "edit", onSelect: edit },
						{ label: label("detail.copyTag", "Copy tag"), iconName: "copy", onSelect: async () => {
							try { await navigator.clipboard.writeText(token.raw); pills.flashToken(token.raw); }
							catch (error) { showError(error); }
						} },
						{ label: label("detail.addToSearch", "Add to search"), iconName: "search", disabled: !cap?.tagSearch, onSelect: () => addTagToSearch(token.raw) },
						{ label: label("detail.outputFilterTag", "Filter tag from output"), iconName: "delete", onSelect: async () => {
							try {
								await addGlobalOutputFilterTag(token.raw);
								app.extensionManager.toast.add({ severity: "success", summary: label("settings.outputFilter", "Output filter tags"), detail: label("detail.outputFilterAdded", "{tag} will be removed from output and copied prompts").replace("{tag}", token.raw), life: 4000 });
							} catch (error) { showError(error); }
						} },
						{ label: label("detail.blockTag", "Block tag"), iconName: "filter", danger: true, onSelect: async () => {
							dialog.close();
							try {
								await addGlobalBlacklistTag(token.raw);
								app.extensionManager.toast.add({ severity: "success", summary: label("settings.blacklist", "Content blacklist"), detail: label("detail.blacklistAdded", "Posts tagged {tag} are now hidden").replace("{tag}", token.raw), life: 4000 });
							} catch (error) { showError(error); }
						} },
					],
				});
				detailPillLists[category] = pills;
				return el("section", { className: "aa-gallery-detail__tag-group", attrs: { "data-category": category }, children: [heading, pills] });
			}) }),
		] });
		const body = el("div", { className: "aa-gallery-detail", children: [viewer.root, inspector] });
		dialog = createDialog({ title: label("detail.title", "Post details"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: actions }), size: "lg", className: "aa-gallery-detail-dialog", confirmOnEnter: false, onClose: () => { viewer.destroy(); translationAbort.abort(); if (activeDetailDialog === dialog) activeDetailDialog = null; } });
		activeDetailDialog = dialog;
		if (currentLocale() === "zh") {
			const translationTags = [];
			for (const category of GALLERY_CATEGORIES) for (const tag of detailDrafts[category]) translationTags.push({ name: tag, category });
			void streamTagTranslations({
				locale: "zh",
				tags: translationTags,
				signal: translationAbort.signal,
				onChunk: ({ translations }) => {
					if (destroyed || openGeneration !== detailDialogGeneration || !Object.keys(translations).length) return;
					for (const pills of Object.values(detailPillLists)) pills.setSecondary(translations);
				},
			});
		}
	};
	const openEditor = async (target) => {
		const selectedIndex = typeof target === "number" ? target : stateFor(node).selections.findIndex((item) => selectionKey(item) === `${target.source}:${target.postId}`);
		let selection = selectedIndex >= 0 ? stateFor(node).selections[selectedIndex] : null; const key = selection ? selectionKey(selection) : `${target.source}:${target.postId}`;
		if (!selection) { const detail = await getDetail(target); selection = selectionFromDetail(detail, sessionEdits.get(key)); }
		if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete.")); const groups = normalizeTagGroups(selection.editedTags || selection.originalTags);
		const drafts = normalizeTagGroups(groups);
		const counts = {};
		const pillLists = {};
		const tokensFor = (category) => drafts[category].map((tag) => ({ category, raw: tag, text: tag }));
		const updateCount = (category) => {
			const next = String(drafts[category].length);
			if (!counts[category] || counts[category].textContent === next) return;
			counts[category].textContent = next;
			counts[category].classList.remove("is-updated");
			void counts[category].offsetWidth;
			counts[category].classList.add("is-updated");
		};
		const mutateDraft = (category, mutation) => {
			const values = [...drafts[category]];
			if (mutation.type === "add") values.push(...mutation.values);
			else {
				const index = values.indexOf(mutation.raw);
				if (index < 0) return null;
				if (mutation.type === "remove") values.splice(index, 1);
				else if (mutation.type === "rename") values[index] = mutation.value;
				else return null;
			}
			drafts[category] = [...new Set(values.map((tag) => String(tag).trim()).filter(Boolean))];
			updateCount(category);
			return tokensFor(category);
		};
		const categoryViews = GALLERY_CATEGORIES.map((category) => {
			counts[category] = el("span", "aa-gallery-tag-editor__count", String(groups[category].length));
			counts[category].addEventListener("animationend", () => counts[category].classList.remove("is-updated"));
			pillLists[category] = createGalleryTagPills({
				tokens: tokensFor(category),
				editable: true,
				allowAdd: true,
				category,
				ariaLabel: label(`category.${category}`, category),
				addPlaceholder: label("editor.addPlaceholder", "+ Add tag"),
				onSearchTag: addTagToSearch,
				searchDisabled: !capability(stateFor(node).source)?.tagSearch,
				onMutate: (mutation) => mutateDraft(category, mutation),
			});
			const panel = el("section", { className: "aa-gallery-tag-editor__category", attrs: { "data-category": category, role: "tabpanel" }, children: [el("header", { children: [el("strong", null, label(`category.${category}`, category)), el("small", null, label("editor.pillHint", "Click to edit · Right-click to remove · Enter to add"))] }), pillLists[category]] });
			const tab = button({ className: "aa-gallery-tag-editor__category-tab", label: label(`category.${category}`, category), variant: "ghost", size: "sm" });
			const categoryId = `aa-gallery-editor-${category}`; tab.id = `${categoryId}-tab`; panel.id = `${categoryId}-panel`; tab.dataset.category = category; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", tab.id); tab.prepend(el("span", { className: "aa-gallery-tag-editor__category-dot", attrs: { "aria-hidden": "true" } })); tab.append(counts[category]);
			return { category, panel, tab };
		});
		const categoryNav = el("div", { className: "aa-gallery-tag-editor__categories", attrs: { role: "tablist", "aria-label": label("editor.categories", "Tag categories") }, children: categoryViews.map(({ tab }) => tab) });
		const categoryPanels = el("div", { className: "aa-gallery-tag-editor__panels", children: categoryViews.map(({ panel }) => panel) });
		const setCategory = (category) => { for (const view of categoryViews) { const active = view.category === category; view.panel.hidden = !active; view.tab.classList.toggle("is-active", active); view.tab.setAttribute("aria-selected", String(active)); view.tab.tabIndex = active ? 0 : -1; } };
		for (const view of categoryViews) view.tab.addEventListener("click", () => setCategory(view.category));
		categoryNav.addEventListener("keydown", (event) => { if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = Math.max(0, categoryViews.findIndex(({ tab }) => tab === document.activeElement)); const next = event.key === "Home" ? 0 : event.key === "End" ? categoryViews.length - 1 : (current + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + categoryViews.length) % categoryViews.length; setCategory(categoryViews[next].category); categoryViews[next].tab.focus({ preventScroll: true }); });
		setCategory(groups.general?.length ? "general" : categoryViews.find(({ category }) => groups[category]?.length)?.category || "general");
		const editorContext = el("header", { className: "aa-gallery-tag-editor__context", children: [el("img", { attrs: { src: proxyUrl(selection.source, selection.previewUrl), alt: "" } }), el("div", { children: [el("div", { className: "aa-gallery-tag-editor__identity", children: [el("span", { attrs: { "data-source": selection.source }, text: selection.source }), el("strong", null, `#${selection.postId}`)] }), el("small", null, label("editor.hint", "Changes stay in this workflow selection."))] })] });
		const body = el("div", { className: "aa-gallery-tag-editor", children: [editorContext, el("div", { className: "aa-gallery-tag-editor__workspace", children: [categoryNav, categoryPanels] })] }); let dialog;
		const values = () => normalizeTagGroups(drafts);
		const restore = button({ label: label("editor.restore", "Restore original"), iconName: "refresh", variant: "ghost", onClick: () => { for (const category of GALLERY_CATEGORIES) { drafts[category] = [...selection.originalTags[category]]; pillLists[category].setTokens(tokensFor(category)); updateCount(category); } } });
		const copy = button({ label: label("editor.copy", "Copy prompt"), iconName: "copy", variant: "ghost", onClick: () => navigator.clipboard.writeText(finalPrompt({ ...selection, editedTags: values() }, effectivePrompt(node))) });
		const save = button({ label: label("editor.save", "Save local tags"), variant: "primary", onClick: () => { const edited = values(); if (selectedIndex >= 0) transact(node, (state) => { state.selections[selectedIndex].editedTags = edited; }); else sessionEdits.set(key, edited); renderSelected(); dialog.close(); } });
		dialog = createDialog({ title: label("editor.title", "Edit local tags"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: [restore, copy, save] }), size: "lg", className: "aa-gallery-tag-editor-dialog", confirmOnEnter: false });
	};
	return {
		tooltip,
		get selectedDragFrom() { return selectedDragFrom; },
		beginSelectedDrag,
		endSelectedDrag,
		handleSelectedDragOver,
		handleSelectedDrop,
		handleSelectedDragLeave,
		search,
		jumpToPage(page) { return search({ reset: true, page }); },
		visibleIndexChanged,
		prefetchVisible,
		toggleSelection,
		toggleFavorite,
		copyPostPrompt,
		interrogatePost,
		recoverPreview,
		showHover,
		openDetail,
		openEditor,
		renderSelected,
		refreshCards,
		setMode,
		setSelectionMode,
		showError,
		updateSize(post, width, height) { elements.masonryController.updateItemSize(`${post.source}:${post.postId}`, width, height); },
		destroy() {
			destroyed = true; generation += 1; detailDialogGeneration += 1;
			clearTimeout(pageCommitTimer); pageCommitTimer = 0;
			clearTimeout(prefetchTimer); prefetchTimer = 0;
			requestController?.abort();
			activeDetailDialog?.close(); activeDetailDialog = null;
			endSelectedDrag();
			elements.selectedDropIndicator?.remove();
			tooltip.destroy();
			elements.masonryController.destroy();
			elements.selectedList.destroy();
			detailCache.clear(); rotatePreviewCache();
		},
	};
}

}
