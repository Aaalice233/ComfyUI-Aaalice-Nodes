/** Search and confirmation dialogs shared by the Gallery mount and controller. */
export function createGalleryDialogs(dependencies) {
	const {
		app, button, createDialog, el, icon, iconButton, label, proxyUrl, searchQuery,
		searchToggleButton, stateFor, t, transact,
	} = dependencies;

function createSearchControl(node, { defaultOpen = false, onOpenChange = null } = {}) {
	const root = el("div", "aa-gallery-search");
	const input = document.createElement("input"); input.type = "search"; input.className = "aa-gallery-search__input aa-ui-search-input";
	input.setAttribute("data-autocomplete-plus", "");
	input.setAttribute("data-autocomplete-plus-mode", "raw-tag");
	input.placeholder = label("search.placeholder", "Search tags…"); input.setAttribute("aria-label", label("search.label", "Search posts"));
	const close = iconButton({ iconName: "arrowRight", label: label("search.close", "Close search"), className: "aa-ui-search-collapse", variant: "ghost", onClick: () => setOpen(false) });
	root.append(icon("search"), input, close);
	const toggle = searchToggleButton({ label: label("search.label", "Search posts"), onClick: () => setOpen(true) });
	let open = false; let composing = false;
	const submit = () => {
		transact(node, (state) => { state.query = input.value.trim(); state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; });
		toggle.setSearchValue(input.value.trim());
		node._aaGalleryController?.syncState();
		node._aaGalleryController?.search({ reset: true, page: 1 });
	};
	const setOpen = (next, { focus = true, submitChanges = true, notifyChange = true } = {}) => {
		const changed = open !== Boolean(next);
		open = Boolean(next);
		if (!open && submitChanges && input.value.trim() !== searchQuery(stateFor(node))) submit();
		root.classList.toggle("is-open", open); toggle.hidden = open; toggle.setSearchOpen(open);
		if (changed && notifyChange) onOpenChange?.(open);
		if (open && focus) queueMicrotask(() => { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); });
	};
	const addTag = (tag, maxTags = null) => {
		const value = String(tag || "").trim();
		if (!value) return false;
		setOpen(true);
		const terms = input.value.trim().match(/"[^"]+"|'[^']+'|\S+/g) || [];
		if (terms.some((term) => term.replace(/^(["'])|(["'])$/g, "").toLocaleLowerCase() === value.toLocaleLowerCase())) return true;
		if (Number.isInteger(maxTags) && terms.length >= maxTags) {
			app.extensionManager.toast.add({ severity: "warning", summary: label("search.limitTitle", "Search limit"), detail: label("search.tagLimit", "This source supports up to {count} tags per search.").replace("{count}", String(maxTags)), life: 4000 });
			return false;
		}
		input.value = [...terms, value].join(" ");
		submit();
		return true;
	};
	const syncInput = () => {
		toggle.setSearchValue(input.value);
		if (!composing && !input.value.trim() && searchQuery(stateFor(node))) submit();
	};
	input.addEventListener("input", syncInput);
	input.addEventListener("compositionstart", () => { composing = true; }); input.addEventListener("compositionend", () => { composing = false; syncInput(); });
	// 失焦即确认：未提交的查询在焦点离开输入框时自动执行；IME 组合中的失焦让位给 compositionend。
	// 补全面板打开期间的失焦（如点击画布）先等插件关闭面板、写入最终文本，再按结果提交。
	let pendingBlurCommit = null;
	const commitIfChanged = () => { if (input.value.trim() !== searchQuery(stateFor(node))) submit(); };
	const commitOnBlur = () => {
		if (composing) return;
		if (!input.hasAttribute("data-autocomplete-plus-open")) { commitIfChanged(); return; }
		if (pendingBlurCommit) return;
		const observer = new MutationObserver(() => {
			if (input.hasAttribute("data-autocomplete-plus-open")) return;
			observer.disconnect(); pendingBlurCommit = null;
			setTimeout(commitIfChanged, 0);
		});
		observer.observe(input, { attributes: true, attributeFilter: ["data-autocomplete-plus-open"] });
		const guard = setTimeout(() => { observer.disconnect(); pendingBlurCommit = null; }, 2000);
		pendingBlurCommit = { cancel: () => { clearTimeout(guard); observer.disconnect(); pendingBlurCommit = null; } };
	};
	input.addEventListener("blur", commitOnBlur);
	input.addEventListener("focus", () => pendingBlurCommit?.cancel());
	input.addEventListener("keydown", (event) => {
		// 补全候选面板打开时，导航、确认和关闭键全部让给 Autocomplete-Plus
		if (input.hasAttribute("data-autocomplete-plus-open")) return;
		if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
		else if (event.key === "Enter" && !composing && !event.isComposing) { event.preventDefault(); submit(); }
	});
	setOpen(defaultOpen, { focus: false, notifyChange: false });
	return { root, input, toggle, setOpen, addTag, sync: () => { if (document.activeElement !== input) input.value = stateFor(node).query; toggle.setSearchValue(input.value); } };
}

function openGalleryErrorDialog(error, onRetry) {
	const message = String(error?.message || error?.summary || error || "");
	const isCertificateError = error?.code === "tls_certificate_error";
	const guidance = isCertificateError
		? label("error.tlsCertificate", "SSL certificate verification failed. Check the system clock, HTTPS proxy or packet-inspection certificate, and trusted root certificates. Gallery will not disable certificate verification.")
		: "";
	let dialog;
	const close = button({ label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => dialog.close() });
	const copy = button({ label: label("error.copy", "Copy error"), iconName: "copy", variant: "secondary", onClick: async () => {
		try {
			await navigator.clipboard.writeText(message);
			app.extensionManager.toast.add({ severity: "success", summary: label("error.dialogTitle", "Gallery error details"), detail: label("error.copied", "Complete error copied to clipboard."), life: 3200 });
		} catch (copyError) {
			app.extensionManager.toast.add({ severity: "error", summary: label("error.dialogTitle", "Gallery error details"), detail: copyError.message, life: 5000 });
		}
	} });
	const retry = button({ label: label("error.retry", "Retry"), iconName: "refresh", variant: "primary", onClick: () => { dialog.close(); onRetry?.(); } });
	const body = el("div", { className: "aa-gallery-error-details", attrs: { "data-code": error?.code || "generic" }, children: [
		...(guidance ? [el("div", { className: "aa-gallery-error-details__notice", children: [icon("statusWarning"), el("p", null, guidance)] })] : []),
		el("pre", { className: "aa-gallery-error-details__raw", attrs: { tabindex: "0", "aria-label": label("error.complete", "Complete error") }, text: message }),
	] });
	dialog = createDialog({
		title: label("error.dialogTitle", "Gallery error details"),
		body,
		footer: el("div", { className: "aa-gallery-dialog-actions", children: [close, copy, retry] }),
		size: "sm",
		className: "aa-gallery-error-dialog",
		confirmOnEnter: false,
	});
}

function openInterrogateResultDialog(detail, text) {
	let dialog;
	const copy = button({ label: t("aaalice.common.copy", "Copy"), iconName: "copy", variant: "primary", onClick: async () => {
		try {
			await navigator.clipboard.writeText(text);
			app.extensionManager.toast.add({ severity: "success", summary: label("interrogate.title", "Image interrogation"), detail: label("interrogate.copied", "Interrogated prompt copied to clipboard"), life: 3200 });
			dialog.close();
		} catch (error) {
			app.extensionManager.toast.add({ severity: "error", summary: label("interrogate.title", "Image interrogation"), detail: error.message, life: 5000 });
		}
	} });
	const close = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const body = el("div", { className: "aa-gallery-interrogate", children: [
		el("div", { className: "aa-gallery-interrogate__meta", children: [
			el("img", { className: "aa-gallery-interrogate__thumb", attrs: { src: proxyUrl(detail.source, detail.previewUrl), alt: "" } }),
			el("span", { attrs: { "data-source": detail.source }, text: detail.source }),
			el("strong", null, `#${detail.postId}`),
		] }),
		el("p", { className: "aa-gallery-interrogate__text", text }),
	] });
	dialog = createDialog({ title: label("interrogate.title", "Image interrogation"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: [close, copy] }), className: "aa-gallery-interrogate-dialog", confirmOnEnter: false });
}

function openClearSelectionDialog(node, controller) {
	if (!stateFor(node).selections.length) return;
	let dialog;
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const clear = button({ label: label("selected.clearAction", "Clear selection"), iconName: "delete", variant: "danger", onClick: () => {
		transact(node, (state) => { state.selections = []; });
		controller.renderSelected();
		controller.refreshCards();
		dialog.close();
	} });
	dialog = createDialog({
		title: label("selected.clearTitle", "Clear selected posts"),
		body: el("div", { className: "aa-gallery-clear-confirm", children: [icon("delete"), el("p", null, label("selected.clearConfirm", "Clear all selected posts?"))] }),
		footer: el("div", { className: "aa-gallery-dialog-actions", children: [cancel, clear] }),
		size: "compact",
		className: "aa-gallery-clear-confirm-dialog",
		confirmOnEnter: false,
	});
}

function openSingleSelectionDialog(onConfirm) {
	let dialog;
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const confirm = button({ label: label("selectionMode.changeAction", "Keep first image"), iconName: "selectionSingle", variant: "primary", onClick: () => {
		onConfirm();
		dialog.close();
	} });
	dialog = createDialog({
		title: label("selectionMode.changeTitle", "Switch to single selection"),
		body: el("div", { className: "aa-gallery-selection-mode-confirm", children: [icon("selectionSingle"), el("p", null, label("selectionMode.changeConfirm", "Only the first selected image will remain. Continue?"))] }),
		footer: el("div", { className: "aa-gallery-dialog-actions", children: [cancel, confirm] }),
		size: "compact",
		className: "aa-gallery-selection-mode-confirm-dialog",
		confirmOnEnter: false,
	});
}


	return { createSearchControl, openClearSelectionDialog, openGalleryErrorDialog, openInterrogateResultDialog, openSingleSelectionDialog };
}
