/** Gallery settings workspace and ComfyUI settings registration. */
export function createGallerySettings(dependencies) {
	const {
		API, GALLERY_CATEGORIES, SELECTION_STAMPS, allGraphNodes, app, button,
		checkboxControl, createDialog, createSelectionStamp, el, field, getCapabilities,
		getSettings, icon, iconButton, isGallery, jsonRequest, label, listboxControl,
		loadSetup, multiSelectControl, selectionStampLabel, setSettings, tagLines,
	} = dependencies;

function settingsInput(type, value = "") { const control = document.createElement("input"); control.type = type; control.className = "aa-ui-input"; control.value = value; return control; }

function settingsSectionHeader(iconName, title) {
	return el("header", { className: "aa-gallery-settings__section-header", children: [
		el("span", { className: "aa-gallery-settings__section-icon", attrs: { "aria-hidden": "true" }, children: [icon(iconName)] }),
		el("strong", null, title),
	] });
}

function credentialLabel(name) { return label(`settings.credential.${name}`, name); }

async function openSettingsDialog() {
	await loadSetup({ force: true }); let settings = getSettings(); const capabilities = getCapabilities(); const sourceInputs = {}; const sourceClears = {};
	for (const cap of capabilities) {
		sourceClears[cap.source] = new Set();
		sourceInputs[cap.source] = Object.fromEntries((cap.authFields || []).map((name) => { const input = settingsInput(name.toLowerCase().includes("key") ? "password" : "text"); const statusName = `has${name[0].toUpperCase()}${name.slice(1)}`; input.placeholder = settings.credentialStatus?.[cap.source]?.[statusName] ? label("settings.keepCredential", "Configured; leave blank to keep") : name; return [name, input]; }));
	}
	const defaultSource = listboxControl({ options: capabilities.map((cap) => ({ value: cap.source, label: cap.displayName })), value: settings.defaultSource, ariaLabel: label("settings.defaultSource", "Default source") });
	const blacklist = document.createElement("textarea"); blacklist.className = "aa-ui-input aa-gallery-settings__blacklist-input"; blacklist.value = (settings.blacklist || []).join("\n"); blacklist.placeholder = label("settings.blacklistPlaceholder", "watermark\ntext\nmale_focus"); blacklist.setAttribute("aria-label", label("settings.blacklist", "Content blacklist")); blacklist.setAttribute("data-autocomplete-plus", ""); blacklist.setAttribute("data-autocomplete-plus-mode", "raw-tag"); blacklist.title = label("prompt.excludeHint", "Global: hides matching posts and removes the tags from output prompts");
	const blacklistCount = el("span", { className: "aa-gallery-settings__blacklist-count", attrs: { "aria-live": "polite" } });
	const syncBlacklistCount = () => { const next = tagLines(blacklist.value).length; blacklistCount.textContent = label("settings.blacklistCount", "{count} blocked tags").replace("{count}", String(next)); blacklistCount.classList.toggle("is-active", next > 0); };
	blacklist.addEventListener("input", syncBlacklistCount); syncBlacklistCount();
	const outputFilter = document.createElement("textarea"); outputFilter.className = "aa-ui-input aa-gallery-settings__blacklist-input"; outputFilter.value = (settings.outputFilterTags || []).join("\n"); outputFilter.placeholder = label("settings.outputFilterPlaceholder", "watermark\nartist_name"); outputFilter.setAttribute("aria-label", label("settings.outputFilter", "Output filter tags")); outputFilter.setAttribute("data-autocomplete-plus", ""); outputFilter.setAttribute("data-autocomplete-plus-mode", "raw-tag"); outputFilter.title = label("settings.outputFilterHint", "Global: removes the tags from output and copied prompts without hiding posts");
	const outputFilterCount = el("span", { className: "aa-gallery-settings__blacklist-count", attrs: { "aria-live": "polite" } });
	const syncOutputFilterCount = () => { const next = tagLines(outputFilter.value).length; outputFilterCount.textContent = label("settings.outputFilterCount", "{count} output-filtered tags").replace("{count}", String(next)); outputFilterCount.classList.toggle("is-active", next > 0); };
	outputFilter.addEventListener("input", syncOutputFilterCount); syncOutputFilterCount();
	const defaultCategories = multiSelectControl({ className: "aa-gallery-prompt-categories aa-gallery-settings__prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: settings.promptDefaults?.categories || [], ariaLabel: label("prompt.categories", "Categories") });
	const defaultUnderscores = checkboxControl({ checked: settings.promptDefaults?.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces") });
	const defaultParentheses = checkboxControl({ checked: settings.promptDefaults?.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses") });
	const timeout = settingsInput("number", String(settings.timeout)); timeout.min = "3"; timeout.max = "300";
	const budget = settingsInput("number", String(settings.cacheBudgetMiB)); budget.min = "128"; budget.max = "32768";
	const tooltip = checkboxControl({ checked: settings.tooltip, label: label("settings.tooltip", "Show hover details") });
	let selectedStamp = SELECTION_STAMPS.includes(settings.selectionStamp) ? settings.selectionStamp : "quarantineQualified";
	const stampButtons = new Map();
	const stampPicker = el("div", { className: "aa-gallery-settings__stamp-picker", attrs: { role: "radiogroup", "aria-label": label("settings.selectionStamp", "Selection stamp") } });
	const setStamp = (value) => { selectedStamp = value; for (const [style, control] of stampButtons) { const active = style === value; control.classList.toggle("is-active", active); control.setAttribute("aria-checked", String(active)); control.tabIndex = active ? 0 : -1; } };
	for (const style of SELECTION_STAMPS) {
		const preview = createSelectionStamp(style, { preview: true }).root;
		const control = el("button", { className: "aa-gallery-settings__stamp-option", attrs: { type: "button", role: "radio", "aria-label": selectionStampLabel(style) }, children: [preview, el("span", null, selectionStampLabel(style))] });
		control.addEventListener("click", () => setStamp(style)); stampButtons.set(style, control); stampPicker.append(control);
	}
	setStamp(selectedStamp);
	const sourceIsConfigured = (cap) => (cap.authFields || []).length > 0 && (cap.authFields || []).every((name) => settings.credentialStatus?.[cap.source]?.[`has${name[0].toUpperCase()}${name.slice(1)}`]);
	const sourceViews = capabilities.map((cap) => {
		const authFields = cap.authFields || [];
		const configured = sourceIsConfigured(cap);
		const stateText = !authFields.length ? label("settings.publicOnly", "Public access") : configured ? label("settings.configured", "Configured") : label("settings.notConfigured", "Not configured");
		const status = el("span", { className: "aa-gallery-settings__connection-status", attrs: { role: "status" } });
		const test = button({ className: "aa-gallery-settings__test", label: label("settings.test", "Test connection"), iconName: "refresh", variant: "ghost", size: "sm", onClick: async () => {
			test.disabled = true; test.classList.add("is-testing"); status.className = "aa-gallery-settings__connection-status is-testing"; status.textContent = label("settings.testing", "Testing…");
			try { await jsonRequest(`${API}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: cap.source, credentials: Object.fromEntries(Object.entries(sourceInputs[cap.source]).map(([name, input]) => [name, input.value])) }) }); status.className = "aa-gallery-settings__connection-status is-success"; status.textContent = label("settings.connected", "Connection succeeded."); }
			catch (error) { status.className = "aa-gallery-settings__connection-status is-error"; status.textContent = error.message; }
			finally { test.disabled = false; test.classList.remove("is-testing"); }
		} });
		const credentialFields = Object.entries(sourceInputs[cap.source]).map(([name, input]) => {
			const clearCredential = iconButton({ className: "aa-gallery-settings__credential-clear", iconName: "delete", label: label("settings.clearCredential", "Clear saved value"), variant: "ghost", size: "sm", onClick: () => { sourceClears[cap.source].add(name); input.value = ""; input.placeholder = label("settings.credentialWillClear", "Saved value will be cleared"); input.closest(".aa-gallery-settings__credential")?.classList.add("is-clearing"); } });
			return el("div", { className: "aa-gallery-settings__credential", children: [field({ label: credentialLabel(name), control: input }), clearCredential] });
		});
		const credentialHelp = cap.credentialsUrl ? el("a", { className: "aa-gallery-settings__credentials-link", attrs: { href: cap.credentialsUrl, target: "_blank", rel: "noopener noreferrer" }, children: [icon("link"), el("span", null, label("settings.credentialsHint", "Get these API credentials from your {source} account page").replace("{source}", cap.displayName))] }) : null;
		const abilityLabels = [cap.favoriteRead ? label("settings.favoriteRead", "Favorite read") : "", cap.favoriteWrite ? label("settings.favoriteWrite", "Favorite write") : "", cap.categorizedTags ? label("settings.tagGroups", "Tag groups") : "", (cap.rankingPeriods || []).length ? label("settings.rankings", "Rankings") : ""].filter(Boolean);
		const panel = el("section", { className: `aa-gallery-settings__source ${configured ? "is-configured" : authFields.length ? "needs-setup" : "is-public"}`, attrs: { role: "tabpanel", tabindex: "0", "data-source": cap.source }, children: [
			el("header", { children: [el("div", { className: "aa-gallery-settings__source-identity", children: [el("span", { className: "aa-gallery-settings__source-mark", children: [icon(configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle")] }), el("div", { children: [el("strong", null, cap.displayName), el("small", null, cap.source)] })] }), el("span", { className: "aa-gallery-settings__source-state", children: [el("i"), stateText] })] }),
			el("div", { className: "aa-gallery-settings__capabilities", children: (abilityLabels.length ? abilityLabels : [label("settings.publicOnly", "Public access")]).map((value) => el("span", null, value)) }),
			...(credentialFields.length ? [el("div", { className: "aa-gallery-settings__credentials", children: [...credentialFields, ...(credentialHelp ? [credentialHelp] : [])] })] : [el("p", { className: "aa-gallery-settings__public-note", text: label("settings.publicHint", "No account is required for this source.") })]),
			el("div", { className: "aa-gallery-settings__actions", children: [test, status] }),
		] });
		const tab = button({ className: `aa-gallery-settings__source-tab ${configured ? "is-configured" : authFields.length ? "needs-setup" : "is-public"}`, label: cap.displayName, iconName: configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle", variant: "ghost", size: "sm" });
		const sourceId = cap.source.replace(/[^a-z0-9_-]/gi, "-"); tab.id = `aa-gallery-source-tab-${sourceId}`; panel.id = `aa-gallery-source-panel-${sourceId}`;
		tab.dataset.source = cap.source; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", tab.id); tab.append(el("span", { className: "aa-gallery-settings__source-tab-state", text: stateText }));
		return { cap, panel, tab, configured };
	});
	let dialog; const status = el("span", { className: "aa-ui-field__hint", attrs: { role: "status" } });
	const clear = button({ className: "aa-gallery-settings__clear-cache", label: label("settings.clearCache", "Clear Gallery cache"), iconName: "delete", variant: "ghost", onClick: async () => { clear.disabled = true; try { await jsonRequest(`${API}/cache/clear`, { method: "POST" }); status.textContent = label("settings.cacheCleared", "Gallery cache cleared."); } catch (error) { status.textContent = error.message; } finally { clear.disabled = false; } } });
	const blacklistCard = el("section", { className: "aa-gallery-settings__blacklist-card", children: [
		el("header", { children: [el("span", { className: "aa-gallery-settings__blacklist-icon", children: [icon("lock")] }), el("strong", null, label("settings.blacklist", "Content blacklist")), blacklistCount] }),
		blacklist,
	] });
	const browsePanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "browse" }, children: [settingsSectionHeader("filter", label("settings.browseTitle", "Browsing defaults")), el("div", { className: "aa-gallery-settings__form-grid", children: [field({ label: label("settings.defaultSource", "Default source"), control: defaultSource }), el("div", { className: "aa-gallery-settings__toggle-card", children: [el("strong", null, label("settings.tooltip", "Show hover details")), tooltip] })] }), field({ label: label("settings.selectionStamp", "Selection stamp"), hint: label("settings.selectionStampHint", "Applied to selected cards in every Gallery node."), control: stampPicker })] });
	const blacklistPanel = el("section", { className: "aa-gallery-settings__page aa-gallery-settings__blacklist-page", attrs: { "data-page": "blacklist" }, children: [blacklistCard] });
	const promptPanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "prompt" }, children: [settingsSectionHeader("tag", label("settings.promptTitle", "Prompt defaults")), field({ label: label("prompt.categories", "Categories"), control: defaultCategories }), el("div", { className: "aa-gallery-settings__switches", children: [el("label", { className: "aa-gallery-check-row", children: [defaultUnderscores, el("span", null, label("prompt.underscores", "Replace underscores with spaces"))] }), el("label", { className: "aa-gallery-check-row", children: [defaultParentheses, el("span", null, label("prompt.parentheses", "Escape parentheses"))] })] }), el("section", { className: "aa-gallery-settings__blacklist-card", children: [
		el("header", { children: [el("span", { className: "aa-gallery-settings__blacklist-icon", children: [icon("delete")] }), el("strong", null, label("settings.outputFilter", "Output filter tags")), outputFilterCount] }),
		outputFilter,
	] })] });
	const performancePanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "performance" }, children: [settingsSectionHeader("refresh", label("settings.performanceTitle", "Network & storage")), el("div", { className: "aa-gallery-settings__form-grid", children: [field({ label: label("settings.timeout", "Request timeout (seconds)"), control: timeout }), field({ label: label("settings.cacheBudget", "Original cache budget (MiB)"), control: budget })] }), el("div", { className: "aa-gallery-settings__cache-card", children: [el("span", { children: [icon("delete")] }), el("div", { children: [el("strong", null, label("settings.clearCache", "Clear Gallery cache")), el("small", null, label("settings.clearCacheHint", "Removes cached originals and metadata; your selections are not affected."))] }), clear] })] });
	const sourceList = el("div", { className: "aa-gallery-settings__source-list", attrs: { role: "tablist", "aria-label": label("settings.sourcesTitle", "Sources & accounts") }, children: sourceViews.map(({ tab }) => tab) });
	const sourceDetail = el("div", { className: "aa-gallery-settings__source-detail", children: sourceViews.map(({ panel }) => panel) });
	const accountsPanel = el("section", { className: "aa-gallery-settings__page is-active", attrs: { "data-page": "accounts" }, children: [settingsSectionHeader("lock", label("settings.sourcesTitle", "Sources & accounts")), el("div", { className: "aa-gallery-settings__source-workspace", children: [sourceList, sourceDetail] })] });
	const setSource = (source) => {
		for (const { cap, panel, tab } of sourceViews) {
			const active = cap.source === source; panel.hidden = !active; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
		}
	};
	for (const { cap, tab } of sourceViews) tab.addEventListener("click", () => setSource(cap.source));
	sourceList.addEventListener("keydown", (event) => {
		if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || !sourceViews.length) return;
		event.preventDefault(); const current = Math.max(0, sourceViews.findIndex(({ tab }) => tab === document.activeElement));
		const next = event.key === "Home" ? 0 : event.key === "End" ? sourceViews.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + sourceViews.length) % sourceViews.length;
		setSource(sourceViews[next].cap.source); sourceViews[next].tab.focus({ preventScroll: true });
	});
	setSource(sourceViews.find(({ configured }) => configured)?.cap.source || sourceViews[0]?.cap.source);
	const pages = { accounts: accountsPanel, browse: browsePanel, blacklist: blacklistPanel, prompt: promptPanel, performance: performancePanel };
	const navItems = [
		{ value: "accounts", label: label("settings.navAccounts", "Accounts"), iconName: "lock" }, { value: "browse", label: label("settings.navBrowse", "Browsing"), iconName: "filter" },
		{ value: "blacklist", label: label("settings.blacklist", "Content blacklist"), iconName: "delete" },
		{ value: "prompt", label: label("settings.navPrompt", "Prompt"), iconName: "tag" }, { value: "performance", label: label("settings.navPerformance", "Storage"), iconName: "storage" },
	];
	const navButtons = new Map();
	const setPage = (value) => {
		for (const [name, panel] of Object.entries(pages)) { const active = name === value; panel.hidden = !active; panel.classList.toggle("is-active", active); }
		for (const [name, control] of navButtons) { const active = name === value; control.classList.toggle("is-active", active); control.setAttribute("aria-current", active ? "page" : "false"); }
	};
	const nav = el("nav", { className: "aa-gallery-settings__nav", attrs: { "aria-label": label("settings.navigation", "Settings sections") } });
	for (const item of navItems) { const control = button({ className: "aa-gallery-settings__nav-item", label: item.label, iconName: item.iconName, variant: "ghost", size: "sm", onClick: () => setPage(item.value) }); navButtons.set(item.value, control); nav.append(control); }
	browsePanel.hidden = true; blacklistPanel.hidden = true; promptPanel.hidden = true; performancePanel.hidden = true;
	const configuredCount = capabilities.filter(sourceIsConfigured).length;
	nav.append(el("div", { className: "aa-gallery-settings__nav-summary", children: [el("strong", null, label("settings.accountCount", "{count} accounts ready").replace("{count}", String(configuredCount)))] }));
	setPage("accounts");
	const body = el("div", { className: "aa-gallery-settings", children: [nav, el("div", { className: "aa-gallery-settings__pages", children: [accountsPanel, browsePanel, blacklistPanel, promptPanel, performancePanel] })] });
	const save = button({ label: label("settings.save", "Save"), variant: "primary", onClick: async () => { save.disabled = true; try { const previousBlacklist = JSON.stringify(settings.blacklist || []); const previousCredentials = JSON.stringify(settings.credentialStatus || {}); settings = await jsonRequest(`${API}/settings/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultSource: defaultSource.value, blacklist: tagLines(blacklist.value), outputFilterTags: tagLines(outputFilter.value), promptDefaults: { categories: defaultCategories.values(), replaceUnderscores: defaultUnderscores.getAttribute("aria-checked") === "true", escapeParentheses: defaultParentheses.getAttribute("aria-checked") === "true" }, tooltip: tooltip.getAttribute("aria-checked") === "true", selectionStamp: selectedStamp, timeout: Number(timeout.value), cacheBudgetMiB: Number(budget.value), credentials: Object.fromEntries(Object.entries(sourceInputs).map(([sourceName, fields]) => [sourceName, Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]))])), clearCredentials: Object.fromEntries(Object.entries(sourceClears).map(([sourceName, values]) => [sourceName, [...values]])) }) }); setSettings(settings); dialog.close(); const credentialsChanged = previousCredentials !== JSON.stringify(settings.credentialStatus || {}); for (const galleryNode of allGraphNodes(app.graph)) { if (!isGallery(galleryNode)) continue; galleryNode._aaGalleryController?.renderSelected(); galleryNode._aaGalleryController?.refreshCards(); if (previousBlacklist !== JSON.stringify(settings.blacklist || []) || credentialsChanged) void galleryNode._aaGalleryController?.search({ reset: true, page: 1 }); } } catch (error) { status.textContent = error.message; save.disabled = false; } } });
	dialog = createDialog({ title: label("settings.title", "Booru Gallery"), body, footer: el("div", { className: "aa-gallery-settings__footer", children: [status, save] }), size: "lg", className: "aa-gallery-settings-dialog", confirmOnEnter: false });
}

function registerSettings() {
	if (app._aaGallerySettingsRegistered) return; app._aaGallerySettingsRegistered = true;
	app.ui.settings.addSetting({ id: "Aaalice.BooruGallery.Configure", name: label("settings.entry", "Booru Gallery"), category: ["Aaalice Nodes", "Booru Gallery"], type: () => {
		const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 2;
		cell.append(button({ label: label("settings.open", "Configure Gallery…"), onClick: () => openSettingsDialog().catch((error) => console.error("[Aaalice] Gallery settings failed", error)) })); row.append(cell); return row;
	} });
}


	return { openSettingsDialog, registerSettings };
}
