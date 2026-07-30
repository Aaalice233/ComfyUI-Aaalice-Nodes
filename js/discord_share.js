/** Discord sharing entry points, membership flow and latest-run image picker. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	beginDiscordShareAuthentication,
	clearDiscordShareSession,
	disconnectDiscordShare,
	loadDiscordShareConfig,
	loadDiscordShareSession,
	sendDiscordShare,
	verifyDiscordShareSession,
} from "./lib/discord_share_client.js";
import {
	captureEvents,
	clearPromptSource,
	promptSourceBinding,
	setPromptSource,
} from "./lib/discord_share_capture.js";
import { normalizeSharePlacement } from "./lib/discord_share_model.js";
import { nativeOutputNodeClass } from "./lib/native_output_model.js";
import {
	badge,
	button,
	createContextMenu,
	createDialog,
	el,
	emptyState,
	icon,
	segmentedControl,
} from "./lib/ui.js";

const EXTENSION_NAME = "ComfyUI.Aaalice.DiscordShare";
const PLACEMENT_SETTING_ID = "Aaalice.DiscordShare.Placement";
const TOPBAR_ICON_CLASS = "aaalice-discord-share-topbar-icon";
const INTRO_STORAGE_KEY = "aaalice.discord-share.intro-seen.v1";
const SIDEBAR_SELECTOR = '[data-testid="side-toolbar"]';
const entryButtons = new Set();
const placementControls = new Set();
const topbarBindings = new WeakSet();
let publicConfig = null;
let configPromise = null;
let entryObserver = null;
let syncFrame = 0;
let activeDialog = null;
let settingsRegistered = false;

function label(key, fallback, params = null) {
	return t(`aaalice.discordShare.${key}`, fallback, params);
}

function toast(severity, detail, summary = label("title", "Discord Share")) {
	app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 4500 });
}

function currentPlacement() {
	return normalizeSharePlacement(app.ui.settings.getSettingValue(PLACEMENT_SETTING_ID, "sidebar"));
}

function setPlacement(next) {
	const placement = normalizeSharePlacement(next);
	app.ui.settings.setSettingValue(PLACEMENT_SETTING_ID, placement);
	for (const control of placementControls) control.setValue?.(placement);
	scheduleEntrypointSync();
}

function sessionState() {
	return loadDiscordShareSession() ? "connected" : "unverified";
}

function syncEntryState(buttonElement) {
	const state = sessionState();
	buttonElement.dataset.sessionState = state;
	buttonElement.setAttribute("aria-label", state === "connected"
		? label("entry.connected", "Share latest image to Discord · connected")
		: label("entry.unverified", "Share latest image to Discord · verification required"));
	buttonElement.title = buttonElement.getAttribute("aria-label");
}

function showEntryContextMenu(event, surface) {
	event.preventDefault();
	event.stopPropagation();
	const items = surface === "topbar"
		? [
			{ label: label("menu.toSidebar", "Move back to sidebar"), iconName: "move", onSelect: () => setPlacement("sidebar") },
			{ label: label("menu.hide", "Hide share entry"), iconName: "close", onSelect: () => setPlacement("hidden") },
		]
		: [
			{ label: label("menu.toTopbar", "Pin to canvas top bar"), iconName: "pin", onSelect: () => setPlacement("topbar") },
			{ label: label("menu.hide", "Hide share entry"), iconName: "close", onSelect: () => setPlacement("hidden") },
		];
	createContextMenu({
		x: event.clientX,
		y: event.clientY,
		ariaLabel: label("menu.label", "Discord share entry"),
		items,
	});
}

function createSidebarEntry() {
	const entry = el("button", {
		className: "aa-discord-share-entry",
		attrs: { type: "button" },
		children: [
			el("span", { className: "aa-discord-share-entry__icon", children: [icon("send")] }),
			el("span", "aa-discord-share-entry__label", label("entry.short", "Share")),
			el("span", { className: "aa-discord-share-entry__status", attrs: { "aria-hidden": "true" } }),
		],
	});
	if (localStorage.getItem(INTRO_STORAGE_KEY) !== "true") {
		entry.classList.add("is-intro");
		entry.addEventListener("animationend", () => {
			entry.classList.remove("is-intro");
			localStorage.setItem(INTRO_STORAGE_KEY, "true");
		}, { once: true });
	}
	entry.addEventListener("click", () => void openShareFlow());
	entry.addEventListener("contextmenu", (event) => showEntryContextMenu(event, "sidebar"));
	syncEntryState(entry);
	entryButtons.add(entry);
	return entry;
}

function attachSidebarEntry() {
	const toolbar = document.querySelector(SIDEBAR_SELECTOR);
	if (!toolbar) return;
	const groups = toolbar.querySelectorAll(".sidebar-item-group");
	const bottomGroup = groups.length ? groups[groups.length - 1] : null;
	if (!bottomGroup) return;
	let entry = bottomGroup.querySelector(":scope > .aa-discord-share-entry");
	if (!entry) {
		entry = createSidebarEntry();
		bottomGroup.prepend(entry);
	}
	entry.hidden = currentPlacement() !== "sidebar";
	entry.style.display = entry.hidden ? "none" : "";
	syncEntryState(entry);
}

function bindTopbarButton(buttonElement) {
	if (topbarBindings.has(buttonElement)) return;
	topbarBindings.add(buttonElement);
	buttonElement.addEventListener("contextmenu", (event) => showEntryContextMenu(event, "topbar"));
}

function syncTopbarEntries() {
	for (const iconElement of document.querySelectorAll(`.${TOPBAR_ICON_CLASS}`)) {
		const buttonElement = iconElement.closest("button");
		if (!buttonElement) continue;
		bindTopbarButton(buttonElement);
		const hidden = currentPlacement() !== "topbar";
		buttonElement.hidden = hidden;
		buttonElement.style.display = hidden ? "none" : "";
		syncEntryState(buttonElement);
	}
}

function syncEntrypoints() {
	syncFrame = 0;
	attachSidebarEntry();
	syncTopbarEntries();
	for (const entry of [...entryButtons]) {
		if (!entry.isConnected) entryButtons.delete(entry);
		else syncEntryState(entry);
	}
}

function scheduleEntrypointSync() {
	if (syncFrame) return;
	syncFrame = requestAnimationFrame(syncEntrypoints);
}

function observeEntrypoints() {
	if (entryObserver) return;
	entryObserver = new MutationObserver(scheduleEntrypointSync);
	entryObserver.observe(document.body, { childList: true, subtree: true });
	scheduleEntrypointSync();
}

async function config() {
	if (publicConfig) return publicConfig;
	if (!configPromise) {
		configPromise = loadDiscordShareConfig()
			.then((value) => {
				publicConfig = value;
				return value;
			})
			.finally(() => { configPromise = null; });
	}
	return configPromise;
}

function closeActiveDialog() {
	activeDialog?.close?.();
	activeDialog = null;
}

function openUnavailableDialog() {
	closeActiveDialog();
	const body = el("div", { className: "aa-discord-share-state", children: [
		emptyState({
			iconName: "send",
			title: label("unavailable.title", "Sharing service is not configured"),
			description: label("unavailable.body", "This installation does not have an Aaalice Discord relay URL yet."),
		}),
	] });
	const footer = el("div", { children: [
		button({ label: label("actions.done", "Done"), variant: "secondary", onClick: () => closeActiveDialog() }),
	] });
	activeDialog = createDialog({ title: label("title", "Discord Share"), body, footer, size: "compact", onClose: () => { activeDialog = null; } });
}

function openMembershipRequiredDialog(error, shareConfig) {
	closeActiveDialog();
	const body = el("div", { className: "aa-discord-share-state", children: [
		el("div", { className: "aa-discord-share-state__mark is-warning", children: [icon("statusWarning")] }),
		el("strong", null, label("membership.title", "Server membership required")),
		el("p", null, error?.message || label("membership.body", "Join the Aaalice Discord server, then verify again.")),
	] });
	const footer = el("div");
	if (shareConfig.communityUrl) {
		footer.append(button({
			label: label("actions.join", "Join server"),
			variant: "secondary",
			iconName: "link",
			onClick: () => window.open(shareConfig.communityUrl, "_blank", "noopener,noreferrer"),
		}));
	}
	footer.append(
		button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => closeActiveDialog() }),
		button({
			label: label("actions.verifyAgain", "Verify again"),
			iconName: "refresh",
			onClick: async (event) => {
				event.currentTarget.disabled = true;
				try {
					const session = await beginDiscordShareAuthentication(shareConfig);
					closeActiveDialog();
					scheduleEntrypointSync();
					if (captureEvents.latest?.images?.length) await openSharePicker(shareConfig, session, captureEvents.latest);
					else toast("success", label("toast.connected", "Discord membership verified."));
				} catch (nextError) {
					event.currentTarget.disabled = false;
					if (nextError?.code !== "cancelled") toast("error", nextError.message);
				}
			},
		}),
	);
	activeDialog = createDialog({ title: label("title", "Discord Share"), body, footer, size: "compact", onClose: () => { activeDialog = null; } });
}

function openConnectDialog(shareConfig, { continueToPicker = true } = {}) {
	closeActiveDialog();
	const body = el("div", { className: "aa-discord-share-connect", children: [
		el("div", { className: "aa-discord-share-connect__identity", children: [
			el("span", { className: "aa-discord-share-connect__icon", children: [icon("send")] }),
			el("strong", null, label("connect.title", "Verify with Discord")),
			badge(label("connect.serverOnly", "Members only"), { className: "aa-discord-share-badge" }),
		] }),
		el("p", null, label("connect.body", "Discord sign-in only confirms that you belong to the server. The webhook secret stays on the relay and is never stored in ComfyUI.")),
	] });
	const footer = el("div");
	footer.append(
		button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => closeActiveDialog() }),
		button({
			label: label("actions.connect", "Connect Discord"),
			iconName: "link",
			defaultAction: true,
			onClick: async (event) => {
				const action = event.currentTarget;
				action.disabled = true;
				action.classList.add("is-loading");
				try {
					const session = await beginDiscordShareAuthentication(shareConfig);
					closeActiveDialog();
					scheduleEntrypointSync();
					if (continueToPicker && captureEvents.latest?.images?.length) {
						await openSharePicker(shareConfig, session, captureEvents.latest);
					} else {
						toast("success", label("toast.connected", "Discord membership verified."));
					}
				} catch (error) {
					action.disabled = false;
					action.classList.remove("is-loading");
					if (error?.code === "not_member") openMembershipRequiredDialog(error, shareConfig);
					else if (error?.code !== "cancelled") toast("error", error.message);
				}
			},
		}),
	);
	activeDialog = createDialog({ title: label("title", "Discord Share"), body, footer, size: "compact", onClose: () => { activeDialog = null; } });
}

function imageUrl(reference) {
	const query = new URLSearchParams({
		filename: reference.filename,
		subfolder: reference.subfolder || "",
		type: reference.type || "output",
	});
	return api.apiURL(`/view?${query}${app.getRandParam?.() || ""}`);
}

function imageMeta(image) {
	return image.width && image.height
		? `${image.width} × ${image.height}`
		: label("picker.readingSize", "Reading size…");
}

function hydrateImageDimensions(image, onChange) {
	if (image.width && image.height) return;
	const probe = new Image();
	probe.onload = () => {
		image.width = probe.naturalWidth;
		image.height = probe.naturalHeight;
		onChange?.();
	};
	probe.src = image.url;
}

async function openSharePicker(shareConfig, session, snapshot) {
	closeActiveDialog();
	const images = snapshot.images.map((image) => ({ ...image, url: imageUrl(image), width: 0, height: 0 }));
	let selectedIndex = 0;
	const body = el("div", "aa-discord-share-picker");
	const stageImage = el("img", { className: "aa-discord-share-picker__image", attrs: { alt: "" } });
	const filename = el("strong", "aa-discord-share-picker__filename");
	const dimensions = el("span", "aa-discord-share-picker__dimensions");
	const counter = badge("", { className: "aa-discord-share-picker__counter" });
	const stage = el("div", { className: "aa-discord-share-picker__stage", children: [
		stageImage,
		el("div", { className: "aa-discord-share-picker__stage-meta", children: [counter, filename, dimensions] }),
	] });
	const filmstrip = el("div", { className: "aa-discord-share-filmstrip", attrs: { role: "listbox", "aria-label": label("picker.images", "Latest run images"), tabindex: 0 } });
	const prompt = el("pre", "aa-discord-share-picker__prompt");
	const promptState = el("div", "aa-discord-share-picker__prompt-state");
	const footer = el("div");
	const send = button({
		label: label("actions.send", "Send to Discord"),
		iconName: "send",
		defaultAction: true,
		onClick: async () => {
			const selected = images[selectedIndex];
			if (!selected || !snapshot.prompt) return;
			send.disabled = true;
			send.classList.add("is-loading");
			send.querySelector(".aa-ui-button__label").textContent = label("actions.sending", "Sending…");
			try {
				await sendDiscordShare(shareConfig, session, { image: selected, prompt: snapshot.prompt });
				closeActiveDialog();
				toast("success", label("toast.sent", "Image and prompt sent to Discord."));
			} catch (error) {
				send.disabled = false;
				send.classList.remove("is-loading");
				send.querySelector(".aa-ui-button__label").textContent = label("actions.send", "Send to Discord");
				if ([401, 403].includes(error?.status)) {
					closeActiveDialog();
					scheduleEntrypointSync();
					openConnectDialog(shareConfig);
				} else toast("error", error.message);
			}
		},
	});

	const thumbnails = images.map((image, index) => {
		const meta = el("span", "aa-discord-share-filmstrip__meta", imageMeta(image));
		const item = el("button", {
			className: "aa-discord-share-filmstrip__item",
			attrs: { type: "button", role: "option", "aria-selected": "false", title: image.filename },
			children: [
				el("img", { attrs: { src: image.url, alt: "" } }),
				el("span", "aa-discord-share-filmstrip__name", image.filename),
				meta,
			],
		});
		item.addEventListener("click", () => select(index, { focus: false }));
		hydrateImageDimensions(image, () => {
			meta.textContent = imageMeta(image);
			if (selectedIndex === index) dimensions.textContent = imageMeta(image);
		});
		filmstrip.append(item);
		return item;
	});

	function select(index, { focus = true } = {}) {
		selectedIndex = (index + images.length) % images.length;
		const selected = images[selectedIndex];
		stageImage.src = selected.url;
		stageImage.alt = selected.filename;
		filename.textContent = selected.filename;
		dimensions.textContent = imageMeta(selected);
		counter.textContent = `${selectedIndex + 1} / ${images.length}`;
		for (const [itemIndex, item] of thumbnails.entries()) {
			const active = itemIndex === selectedIndex;
			item.classList.toggle("is-selected", active);
			item.setAttribute("aria-selected", String(active));
		}
		const activeItem = thumbnails[selectedIndex];
		activeItem?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
		if (focus) activeItem?.focus({ preventScroll: true });
	}

	filmstrip.addEventListener("keydown", (event) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const next = event.key === "Home" ? 0
			: event.key === "End" ? images.length - 1
				: selectedIndex + (event.key === "ArrowRight" ? 1 : -1);
		select(next);
	});
	const hasPrompt = Boolean(snapshot.prompt);
	if (hasPrompt) {
		prompt.textContent = snapshot.prompt;
		promptState.append(
			el("span", { className: "aa-discord-share-picker__prompt-ok", children: [icon("statusCheck")] }),
			el("strong", null, snapshot.promptBinding?.label || label("picker.prompt", "Positive prompt")),
		);
	} else {
		prompt.textContent = label("picker.promptMissing", "Right-click a Preview Any node and set it as the Discord prompt source, then run the workflow again.");
		prompt.classList.add("is-missing");
		promptState.append(
			el("span", { className: "aa-discord-share-picker__prompt-warning", children: [icon("statusWarning")] }),
			el("strong", null, label("picker.promptUnavailable", "Prompt unavailable")),
		);
	}
	send.disabled = !hasPrompt;
	body.append(
		stage,
		filmstrip,
		el("section", { className: "aa-discord-share-picker__prompt-panel", attrs: { "aria-label": label("picker.prompt", "Positive prompt") }, children: [promptState, prompt] }),
	);
	footer.append(
		button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => closeActiveDialog() }),
		send,
	);
	activeDialog = createDialog({
		title: label("picker.title", "Share latest run"),
		body,
		footer,
		size: "lg",
		className: "aa-discord-share-dialog",
		confirmOnEnter: false,
		onClose: () => { activeDialog = null; },
	});
	select(0, { focus: false });
}

async function verifiedSession(shareConfig) {
	const stored = loadDiscordShareSession();
	if (!stored) return null;
	try {
		const session = await verifyDiscordShareSession(shareConfig, stored);
		scheduleEntrypointSync();
		return session;
	} catch (error) {
		scheduleEntrypointSync();
		if (![401, 403].includes(error?.status)) throw error;
		return null;
	}
}

async function openShareFlow() {
	await ensureI18nReady();
	const latest = captureEvents.latest;
	if (!latest?.images?.length) {
		toast("info", label("toast.runFirst", "Run a workflow once before sharing."));
		return;
	}
	try {
		const shareConfig = await config();
		if (!shareConfig.enabled || !shareConfig.relayUrl) {
			openUnavailableDialog();
			return;
		}
		const session = await verifiedSession(shareConfig);
		if (!session) {
			openConnectDialog(shareConfig);
			return;
		}
		await openSharePicker(shareConfig, session, latest);
	} catch (error) {
		toast("error", error.message);
	}
}

async function openConnectionManager() {
	await ensureI18nReady();
	try {
		const shareConfig = await config();
		if (!shareConfig.enabled || !shareConfig.relayUrl) {
			openUnavailableDialog();
			return;
		}
		const session = await verifiedSession(shareConfig);
		if (!session) {
			openConnectDialog(shareConfig, { continueToPicker: false });
			return;
		}
		closeActiveDialog();
		const user = session.user || {};
		const displayName = user.global_name || user.username || label("account.connected", "Connected Discord account");
		const body = el("div", { className: "aa-discord-share-account", children: [
			el("div", { className: "aa-discord-share-account__avatar", text: displayName.slice(0, 1).toUpperCase() }),
			el("div", { className: "aa-discord-share-account__identity", children: [
				el("strong", null, displayName),
				el("span", null, label("account.verified", "Server membership verified")),
			] }),
			badge(label("account.ready", "Ready"), { className: "aa-discord-share-account__ready" }),
		] });
		const footer = el("div");
		footer.append(
			button({
				label: label("actions.disconnect", "Disconnect"),
				variant: "secondary",
				iconName: "logOut",
				onClick: async () => {
					await disconnectDiscordShare(shareConfig, session);
					closeActiveDialog();
					scheduleEntrypointSync();
					toast("info", label("toast.disconnected", "Discord account disconnected."));
				},
			}),
			button({ label: label("actions.done", "Done"), onClick: () => closeActiveDialog() }),
		);
		activeDialog = createDialog({ title: label("account.title", "Discord connection"), body, footer, size: "compact", onClose: () => { activeDialog = null; } });
	} catch (error) {
		toast("error", error.message);
	}
}

function createSettingsControl() {
	const placement = segmentedControl({
		value: currentPlacement(),
		ariaLabel: label("settings.placement", "Share entry location"),
		className: "aa-discord-share-settings__placement",
		options: [
			{ value: "sidebar", label: label("settings.sidebar", "Sidebar") },
			{ value: "topbar", label: label("settings.topbar", "Top bar") },
			{ value: "hidden", label: label("settings.hidden", "Hidden") },
		],
		onChange: setPlacement,
	});
	placementControls.add(placement);
	const manage = button({
		label: label("settings.account", "Manage Discord connection"),
		variant: "secondary",
		iconName: "settings",
		onClick: () => void openConnectionManager(),
	});
	const root = el("div", { className: "aa-discord-share-settings", children: [
		el("div", { className: "aa-discord-share-settings__row", children: [
			el("strong", null, label("settings.placement", "Share entry location")),
			placement,
		] }),
		manage,
	] });
	let mounted = false;
	const observer = new MutationObserver(() => {
		if (root.isConnected) {
			mounted = true;
			return;
		}
		if (!mounted) return;
		placementControls.delete(placement);
		observer.disconnect();
	});
	observer.observe(document.body, { childList: true, subtree: true });
	return root;
}

function registerSettings() {
	if (settingsRegistered) return;
	settingsRegistered = true;
	app.ui.settings.addSetting({
		id: PLACEMENT_SETTING_ID,
		name: label("settings.entry", "Discord Share"),
		category: ["Aaalice Nodes", label("settings.category", "Discord Share")],
		defaultValue: "sidebar",
		type: createSettingsControl,
	});
}

function isCurrentPromptSource(node) {
	const binding = promptSourceBinding();
	const nodeGraphId = node?.graph?.id == null ? "root" : String(node.graph.id);
	return Boolean(binding
		&& String(binding.nodeId) === String(node?.id)
		&& String(binding.graphId) === nodeGraphId);
}

function promptSourceMenu(node) {
	if (nativeOutputNodeClass(node) !== "PreviewAny") return [];
	const selected = isCurrentPromptSource(node);
	return [{
		content: selected
			? label("promptSource.clearMenu", "✈️ Stop using as Discord prompt")
			: label("promptSource.setMenu", "✈️ Use as Discord share prompt"),
		callback: () => {
			try {
				if (selected) {
					clearPromptSource();
					toast("info", label("toast.promptCleared", "Discord prompt source cleared. Save the workflow to keep this change."));
				} else {
					setPromptSource(node);
					toast("success", label("toast.promptSet", "Prompt source set. Save the workflow, then run it before sharing."));
				}
			} catch (error) {
				toast("error", error.message);
			}
		},
	}];
}

app.registerExtension({
	name: EXTENSION_NAME,
	actionBarButtons: [{
		icon: `${TOPBAR_ICON_CLASS} icon-[lucide--send] size-4`,
		get tooltip() { return label("entry.topbar", "Share latest image to Discord"); },
		onClick: () => void openShareFlow(),
	}],
	async setup() {
		await ensureI18nReady();
		registerSettings();
		captureEvents.start();
		observeEntrypoints();
	},
	getNodeMenuItems(node) {
		return promptSourceMenu(node);
	},
});
