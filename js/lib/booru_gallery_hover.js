/** Hover preview presentation and viewport-constrained geometry for Booru Gallery. */
export function createGalleryHover(dependencies) {
	const {
		cacheImage, capability, createTooltip, currentLocale, dimensions, el, getDetail, icon, label,
		previewCache, proxyUrl, ratingLabel, ratingTone, streamTagTranslations, tagCount,
	} = dependencies;
	let translationAbort = null;
	let geometryCleanup = null;
	const tooltip = createTooltip({ delay: 0, closeDelay: 120 });
	const hideTooltip = tooltip.hide;
	tooltip.hide = () => {
		translationAbort?.abort();
		translationAbort = null;
		geometryCleanup?.();
		geometryCleanup = null;
		hideTooltip();
	};
	tooltip.destroy = tooltip.hide;

	const showHover = (anchor, post) => {
		translationAbort?.abort();
		geometryCleanup?.();
		geometryCleanup = null;
		translationAbort = new AbortController();
		const currentTranslation = translationAbort;
		const previewSrc = proxyUrl(post.source, post.previewUrl);
		const searchSample = post.sampleUrl && post.sampleUrl !== post.previewUrl ? post.sampleUrl : null;
		const searchSampleSrc = searchSample ? proxyUrl(post.source, searchSample) : null;
		const readySampleSrc = searchSampleSrc && previewCache.get(searchSampleSrc)?.ready ? searchSampleSrc : null;
		const base = el("img", { attrs: { src: readySampleSrc || previewSrc, alt: "", decoding: "async" } });
		const upgrade = el("img", { className: "is-upgrade", attrs: { alt: "", decoding: "async", hidden: true } });
		const loading = el("span", { className: "aa-gallery-hover__loading", attrs: { role: "status", "aria-label": label("hover.loading", "Loading larger preview…") }, children: [icon("loading")] });
		const anchorImage = anchor.matches?.("img") ? anchor : anchor.querySelector?.("img");
		const previewWidth = Number(anchorImage?.naturalWidth); const previewHeight = Number(anchorImage?.naturalHeight);
		const postWidth = Number(post.width); const postHeight = Number(post.height);
		const width = previewWidth > 0 && previewHeight > 0 ? previewWidth : postWidth;
		const height = previewWidth > 0 && previewHeight > 0 ? previewHeight : postHeight;
		const hoverWidth = Math.min(320, Math.max(0, window.innerWidth - 20));
		const imageHeight = width > 0 && height > 0 ? Math.max(150, Math.round(hoverWidth * height / width)) : 320;
		const stat = (iconName, value, ariaLabel) => el("span", { className: "aa-gallery-hover__stat", attrs: { "aria-label": ariaLabel }, children: [icon(iconName), value] });
		const resolution = el("span", null, dimensions(post));
		const score = el("span", null, String(post.score ?? 0));
		const favorites = el("span", null, String(post.favCount ?? 0));
		const tags = el("span", null, post.tags ? String(tagCount(post.tags)) : "—");
		const hasRating = Boolean(post.rating) && Boolean(capability(post.source)?.ratings?.length);
		const rating = hasRating ? el("span", { className: "aa-gallery-hover__rating", attrs: { "data-rating": ratingTone(post.rating) }, text: ratingLabel(post.rating) }) : null;
		const tagSpecs = [
			["artist", "brush", 3], ["character", "person", 4], ["copyright", "movie", 2],
		];
		const tagRows = Object.fromEntries(tagSpecs.map(([category, iconName, limit]) => {
			const values = el("p");
			const root = el("div", { className: `aa-gallery-hover__tag-row is-${category}`, attrs: { hidden: true }, children: [icon(iconName), values] });
			return [category, { root, values, limit, tags: [], translations: {} }];
		}));
		const renderTagRow = (entry) => {
			entry.values.replaceChildren(...entry.tags.map((tag) => {
				const translated = entry.translations[tag];
				return el("span", null, translated ? `${tag.replaceAll("_", " ")} (${translated})` : tag.replaceAll("_", " "));
			}));
		};
		const stats = el("div", { className: "aa-gallery-hover__stats", children: [
			stat("image", resolution, label("hover.resolution", "Resolution")),
			stat("thumbUp", score, label("hover.score", "Score")),
			stat("favorite", favorites, label("hover.favorites", "Favorites")),
			stat("tag", tags, label("hover.tags", "Tags")),
			...(rating ? [rating] : []),
		] });
		const info = el("div", { className: "aa-gallery-hover__info", children: [
			stats,
			el("div", { className: "aa-gallery-hover__tags", children: Object.values(tagRows).map((entry) => entry.root) }),
		] });
		const content = el("div", { className: "aa-gallery-hover", children: [
			el("div", { className: "aa-gallery-hover__media", children: [base, upgrade, loading] }),
			info,
		] });
		content.style.setProperty("--aa-gallery-hover-image-height", `${imageHeight}px`);
		const syncGeometry = () => {
			if (!content.isConnected) return;
			content.style.removeProperty("--aa-gallery-hover-info-height");
			const maxInfoHeight = Math.min(240, Math.max(40, Math.floor(window.innerHeight * 0.35)));
			const infoHeight = Math.min(maxInfoHeight, Math.max(40, Math.ceil(info.scrollHeight)));
			content.style.setProperty("--aa-gallery-hover-info-height", `${infoHeight}px`);
			content.classList.toggle("is-tall-crop", imageHeight > Math.max(0, window.innerHeight - 20 - infoHeight));
		};
		base.addEventListener("load", () => { if (upgrade.hidden) tooltip.reposition(); });
		base.addEventListener("error", () => {
			loading.hidden = true;
			if (sampleRequested && base.getAttribute("src") !== sampleRequested) base.src = sampleRequested;
		});
		tooltip.show(anchor, content, {
			className: "aa-gallery-hover-tooltip",
			immediate: true,
			interactive: false,
			placement: "side",
			onMount: () => {
				syncGeometry();
				const syncViewportGeometry = () => { syncGeometry(); tooltip.reposition(); };
				window.addEventListener("resize", syncViewportGeometry);
				geometryCleanup = () => window.removeEventListener("resize", syncViewportGeometry);
			},
		});
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
			resolution.textContent = dimensions(detail);
			score.textContent = String(detail.score ?? post.score ?? 0);
			favorites.textContent = String(detail.favCount ?? post.favCount ?? 0);
			tags.textContent = String(tagCount(detail.tags));
			if (rating) { rating.dataset.rating = ratingTone(detail.rating); rating.textContent = ratingLabel(detail.rating); }
			const translationTags = [];
			for (const [category, entry] of Object.entries(tagRows)) {
				entry.tags = (detail.tags?.[category] || []).slice(0, entry.limit);
				entry.root.hidden = !entry.tags.length;
				renderTagRow(entry);
				for (const tag of entry.tags) translationTags.push({ name: tag, category });
			}
			syncGeometry();
			tooltip.reposition();
			if (currentLocale() === "zh" && translationTags.length) void streamTagTranslations({
				locale: "zh",
				tags: translationTags,
				signal: currentTranslation.signal,
				onChunk: ({ translations }) => {
					if (!content.isConnected || !tooltip.isOpenFor(anchor)) return;
					for (const entry of Object.values(tagRows)) { Object.assign(entry.translations, translations); renderTagRow(entry); }
					syncGeometry();
					tooltip.reposition();
				},
			});
			const detailSample = detail.sampleUrl && detail.sampleUrl !== post.previewUrl ? detail.sampleUrl : null;
			if (detailSample && detailSample !== post.sampleUrl) upgradeSample(proxyUrl(detail.source, detailSample));
			if (!detailSample && !searchSample) loading.hidden = true;
		}).catch(() => { loading.hidden = true; });
	};

	return { tooltip, showHover };
}
