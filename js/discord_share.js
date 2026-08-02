/** Discord sharing entry points, membership flow and latest-run image picker. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	beginDiscordShareAuthentication,
	disconnectDiscordShare,
	loadDiscordShareConfig,
	loadDiscordSharePromptFilePreference,
	loadDiscordShareSession,
	loadDiscordShareTargets,
	loadDiscordShareTargetSelection,
	saveDiscordSharePromptFilePreference,
	saveDiscordShareTargetSelection,
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
	createAnchoredPopover,
	createContextMenu,
	createDialog,
	createTooltip,
	el,
	emptyState,
	icon,
	iconButton,
	multiSelectControl,
	segmentedControl,
	toggleSwitch,
} from "./lib/ui.js";

const EXTENSION_NAME = "ComfyUI.Aaalice.DiscordShare";
const PLACEMENT_SETTING_ID = "Aaalice.DiscordShare.Placement";
const TOPBAR_ICON_CLASS = "aaalice-discord-share-topbar-icon";
const WORKSPACE_FOOTER_SELECTOR = "[data-aa-workspace-footer-actions]";
const REPOSITORY_URL = "https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes";
const DEFAULT_COMMUNITY_URL = "https://discord.gg/R48n6GwXzD";
const entryButtons = new Set();
const placementControls = new Set();
const topbarBindings = new WeakSet();
let publicConfig = null;
let configPromise = null;
let entryObserver = null;
let syncFrame = 0;
let activeDialog = null;
let settingsRegistered = false;
let shareFlowInFlight = false;

function label(key, fallback, params = null) {
	return t(`aaalice.discordShare.${key}`, fallback, params);
}

function toast(severity, detail, summary = label("title", "Discord Share")) {
	app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 4500 });
}

function shareErrorMessage(error) {
	const messages = {
		rate_limited: label("error.rateLimited", "Share limit reached for this Discord account. Wait about 60 seconds, then try again."),
		rate_limiter_unavailable: label("error.rateLimiterUnavailable", "The sharing service could not check its rate limit. Try again shortly."),
		relay_misconfigured: label("error.relayMisconfigured", "The sharing service is not fully configured. Contact the server administrator."),
		image_too_large: label("error.imageTooLarge", "The selected image exceeds the 20 MB sharing limit. Choose a smaller image or compress it, then try again."),
		image_unavailable: label("error.imageUnavailable", "ComfyUI could not read the selected image. Confirm that the output file still exists, then try again."),
		webhook_failed: label("error.webhookFailed", "Discord did not accept this share. Try again; if it continues, contact the server administrator."),
		prompt_too_long: label("error.promptTooLong", "The positive prompt exceeds the safe ten-message split limit. Enable long-prompt file mode or shorten it, then try again."),
		prompt_file_too_large: label("error.promptFileTooLarge", "The positive prompt exceeds the TXT attachment limit. Shorten it, then try again."),
		invalid_targets: label("error.invalidTargets", "One or more selected Discord channels are no longer available. Refresh the share window and try again."),
		no_targets: label("error.noTargets", "No Discord share channels are currently available."),
		internal_error: label("error.serviceFailed", "The sharing service encountered an internal error. Try again shortly."),
	};
	const message = messages[error?.code] || error?.message || label("error.unknown", "Discord sharing failed. Try again.");
	const failedLabels = error?.code === "webhook_failed"
		? (error?.detail?.failed_targets || []).map((target) => target?.label).filter(Boolean)
		: [];
	return failedLabels.length ? `${message} ${failedLabels.join("、")}` : message;
}

function createShareTargetPicker(targets, initialValues, onChange) {
	let selected = [...initialValues];
	let popover = null;
	let choices = null;
	const trigger = button({
		label: "",
		iconName: "discord",
		variant: "secondary",
		className: "aa-discord-share-target-trigger",
	});
	trigger.setAttribute("aria-haspopup", "dialog");
	const syncTrigger = () => {
		const selectedTargets = targets.filter((target) => selected.includes(target.id));
		const text = selectedTargets.length === 0
			? label("targets.choose", "Choose channels")
			: selectedTargets.length === 1
				? selectedTargets[0].label
				: `${label("targets.multiple", "Channels")} · ${selectedTargets.length}`;
		trigger.querySelector(".aa-ui-button__label").textContent = text;
		trigger.title = selectedTargets.length
			? selectedTargets.map((target) => target.label).join("、")
			: label("targets.none", "Choose at least one channel");
		trigger.setAttribute("aria-label", `${label("targets.aria", "Discord share channels")}: ${trigger.title}`);
	};
	const setValues = (values, { emit = true } = {}) => {
		const available = new Set(targets.map((target) => target.id));
		const next = [...new Set((values || []).map(String).filter((id) => available.has(id)))];
		if (!next.length) {
			choices?.setValues(selected);
			return;
		}
		selected = next;
		choices?.setValues(selected);
		syncTrigger();
		if (emit) onChange?.([...selected]);
	};
	const close = () => popover?.close();
	const open = () => {
		if (popover) return;
		trigger.setAttribute("aria-expanded", "true");
		popover = createAnchoredPopover({
			anchor: trigger,
			ariaLabel: label("targets.aria", "Discord share channels"),
			className: "aa-discord-share-target-popover",
			width: 280,
			onClose: () => {
				popover = null;
				choices = null;
				trigger.setAttribute("aria-expanded", "false");
			},
		});
		choices = multiSelectControl({
			options: targets.map((target) => ({ value: target.id, label: target.label, iconName: "discord" })),
			values: selected,
			ariaLabel: label("targets.aria", "Discord share channels"),
			className: "aa-discord-share-target-list",
			onChange: (values) => setValues(values),
		});
		popover.root.append(
			el("strong", "aa-discord-share-target-popover__title", label("targets.title", "Send to")),
			choices,
		);
	};
	trigger.addEventListener("click", () => { if (popover) close(); else open(); });
	trigger.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" && !popover) {
			event.preventDefault();
			open();
		}
	});
	trigger.setAttribute("aria-expanded", "false");
	syncTrigger();
	return {
		root: trigger,
		values: () => [...selected],
		setValues,
		destroy: () => close(),
	};
}

function createLongPromptFileControl(initialValue, onChange) {
	let enabled = Boolean(initialValue);
	let recommended = false;
	const tooltip = createTooltip({ delay: 140 });
	const notice = el("div", {
		className: "aa-discord-share-prompt-file-notice",
		attrs: { role: "status" },
		children: [
			el("span", { className: "aa-discord-share-prompt-file-notice__icon", children: [icon("info")] }),
			el("span", null, label("promptFile.channelRecommendation", "To avoid flooding the chat, long prompts are recommended as files for this channel. Regular prompts are unaffected.")),
		],
	});
	const syncNotice = () => { notice.hidden = !recommended; };
	const setChecked = (next, { emit = true } = {}) => {
		enabled = Boolean(next);
		toggle.setChecked(enabled);
		if (emit) onChange?.(enabled);
	};
	const toggle = toggleSwitch({
		checked: enabled,
		label: label("promptFile.label", "Send long prompts as a file"),
		className: "aa-discord-share-prompt-file-toggle",
		onChange: (next) => setChecked(next),
	});
	const option = el("div", {
		className: "aa-discord-share-prompt-file-option",
		children: [
			el("div", { className: "aa-discord-share-prompt-file-option__copy", children: [
				el("span", { className: "aa-discord-share-prompt-file-option__icon", children: [icon("fileText")] }),
				el("strong", null, label("promptFile.label", "Send long prompts as a file")),
			] }),
			toggle,
		],
	});
	const tooltipContent = () => el("div", {
		className: "aa-discord-share-prompt-file-tooltip",
		children: [
			el("strong", null, label("promptFile.tooltipTitle", "Why send long prompts as files?")),
			el("span", null, label("promptFile.limits", "Discord allows up to 4,096 characters in one embed description and 6,000 embed text characters in one message.")),
				el("span", null, label("promptFile.recommended", "When enabled, prompts longer than 1,500 characters become a TXT attachment. When disabled, long prompts are split into consecutive messages with the image in the final message.")),
		],
	});
	const showTooltip = () => tooltip.show(toggle, tooltipContent, { className: "aa-discord-share-prompt-file-help" });
	option.addEventListener("mouseenter", showTooltip);
	option.addEventListener("mouseleave", tooltip.hide);
	toggle.addEventListener("focus", showTooltip);
	toggle.addEventListener("blur", tooltip.hide);
	const root = el("div", { className: "aa-discord-share-prompt-file", children: [notice, option] });
	syncNotice();
	return {
		root,
		value: () => enabled,
		setChecked,
		setRecommended: (next) => {
			recommended = Boolean(next);
			syncNotice();
		},
		destroy: () => tooltip.destroy(),
	};
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
	buttonElement.dataset.flowState = shareFlowInFlight ? "busy" : "idle";
	buttonElement.setAttribute("aria-busy", String(shareFlowInFlight));
	buttonElement.disabled = shareFlowInFlight;
	buttonElement.setAttribute("aria-label", shareFlowInFlight
		? label("entry.busy", "Preparing Discord share…")
		: state === "connected"
			? label("entry.connected", "Share latest image to Discord · connected")
			: label("entry.unverified", "Share latest image to Discord · verification required"));
	buttonElement.title = buttonElement.getAttribute("aria-label");
}

function setShareFlowBusy(busy) {
	shareFlowInFlight = busy;
	for (const entry of entryButtons) syncEntryState(entry);
}

function ensureEntryActivityIcons(buttonElement, sendIcon) {
	sendIcon.classList.add("aa-discord-share-entry__icon", "aa-discord-share-entry__icon--send");
	if (!buttonElement.querySelector(".aa-discord-share-entry__icon--loading")) {
		buttonElement.append(icon("loading", {
			className: "aa-discord-share-entry__icon aa-discord-share-entry__icon--loading",
		}));
	}
}

async function confirmHideEntry() {
	const title = label("menu.hideConfirmTitle", "Hide Discord share?");
	const message = label("menu.hideConfirmBody", "You can restore the share entry later in Settings > Aaalice Nodes > Discord Share.");
	if (app.extensionManager?.dialog?.confirm) {
		return Boolean(await app.extensionManager.dialog.confirm({ title, message }));
	}
	return Boolean(globalThis.confirm(message));
}

async function hideEntry() {
	if (await confirmHideEntry()) setPlacement("hidden");
}

function showEntryContextMenu(event, surface) {
	event.preventDefault();
	event.stopPropagation();
	const items = surface === "topbar"
		? [
			{ label: label("menu.toSidebar", "Move back to sidebar footer"), iconName: "move", onSelect: () => setPlacement("sidebar") },
			{ label: label("menu.hide", "Hide share entry"), iconName: "close", onSelect: () => void hideEntry() },
		]
		: [
			{ label: label("menu.toTopbar", "Pin to canvas top bar"), iconName: "pin", onSelect: () => setPlacement("topbar") },
			{ label: label("menu.hide", "Hide share entry"), iconName: "close", onSelect: () => void hideEntry() },
		];
	createContextMenu({
		x: event.clientX,
		y: event.clientY,
		ownerElement: event.currentTarget,
		ariaLabel: label("menu.label", "Discord share entry"),
		items,
	});
}

function createSidebarEntry() {
	const entry = iconButton({
		iconName: "send",
		label: label("entry.unverified", "Share latest image to Discord · verification required"),
		variant: "ghost",
		className: "aa-discord-share-entry",
		onClick: () => void openShareFlow(),
	});
	ensureEntryActivityIcons(entry, entry.querySelector(".aa-ui-icon"));
	entry.append(el("span", { className: "aa-discord-share-entry__status", attrs: { "aria-hidden": "true" } }));
	entry.addEventListener("contextmenu", (event) => showEntryContextMenu(event, "sidebar"));
	syncEntryState(entry);
	entryButtons.add(entry);
	return entry;
}

function openExternal(url) {
	window.open(url, "_blank", "noopener,noreferrer");
}

function createWorkspaceFooterDock() {
	const dock = el("div", {
		className: "aa-discord-share-dock",
		attrs: { role: "toolbar", "aria-label": label("dock.label", "Aaalice community") },
	});
	const repository = iconButton({
		iconName: "github",
		label: label("dock.repository", "Open the Aaalice Nodes repository"),
		variant: "ghost",
		className: "aa-discord-share-dock__link",
		onClick: () => openExternal(REPOSITORY_URL),
	});
	const community = iconButton({
		iconName: "discord",
		label: label("dock.community", "Join the Aaalice Discord server"),
		variant: "ghost",
		className: "aa-discord-share-dock__link",
		onClick: () => openExternal(publicConfig?.communityUrl || DEFAULT_COMMUNITY_URL),
	});
	dock.append(repository, community, createSidebarEntry());
	return dock;
}

function attachSidebarEntry() {
	const host = document.querySelector(WORKSPACE_FOOTER_SELECTOR);
	if (!host) return;
	let dock = host.querySelector(":scope > .aa-discord-share-dock");
	if (!dock) {
		dock = createWorkspaceFooterDock();
		host.append(dock);
	}
	const entry = dock.querySelector(".aa-discord-share-entry");
	entry.hidden = currentPlacement() !== "sidebar";
	entry.style.display = entry.hidden ? "none" : "";
	syncEntryState(entry);
}

function bindTopbarButton(buttonElement, iconElement) {
	buttonElement.classList.add("aa-discord-share-entry", "aa-discord-share-entry--topbar");
	let shareIcon = iconElement;
	if (!shareIcon.matches("svg.aa-ui-icon")) {
		shareIcon = icon("send", { className: TOPBAR_ICON_CLASS });
		iconElement.replaceWith(shareIcon);
	}
	ensureEntryActivityIcons(buttonElement, shareIcon);
	if (!buttonElement.querySelector(".aa-discord-share-entry__status")) {
		buttonElement.append(el("span", { className: "aa-discord-share-entry__status", attrs: { "aria-hidden": "true" } }));
	}
	if (topbarBindings.has(buttonElement)) return;
	topbarBindings.add(buttonElement);
	buttonElement.addEventListener("contextmenu", (event) => showEntryContextMenu(event, "topbar"));
}

function syncTopbarEntries() {
	for (const iconElement of document.querySelectorAll(`.${TOPBAR_ICON_CLASS}`)) {
		const buttonElement = iconElement.closest("button");
		if (!buttonElement) continue;
		bindTopbarButton(buttonElement, iconElement);
		entryButtons.add(buttonElement);
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
	const communityUrl = String(error?.detail?.community_url || shareConfig.communityUrl || "");
	const body = el("div", { className: "aa-discord-share-state", children: [
		el("div", { className: "aa-discord-share-state__mark is-warning", children: [icon("statusWarning")] }),
		el("strong", null, label("membership.title", "Server membership required")),
		el("p", null, label("membership.body", "Join the Aaalice Discord server, then return here and verify again.")),
	] });
	const footer = el("div", "aa-discord-share-picker__footer");
	footer.append(
		button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => closeActiveDialog() }),
		button({
			label: label("actions.verifyAgain", "Verify again"),
			iconName: "refresh",
			variant: "secondary",
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
					if (nextError?.code === "not_member") openMembershipRequiredDialog(nextError, shareConfig);
					else if (nextError?.code !== "cancelled") toast("error", nextError.message);
				}
			},
		}),
	);
	if (communityUrl) {
		footer.append(button({
			label: label("actions.join", "Join server"),
			iconName: "link",
			defaultAction: true,
			onClick: () => window.open(communityUrl, "_blank", "noopener,noreferrer"),
		}));
	}
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
					else if (error?.code !== "cancelled") toast("error", shareErrorMessage(error));
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

function compactImageMeta(image) {
	return image.width && image.height
		? `${image.width}×${image.height}`
		: "…";
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

function createShareImageViewer(viewport, image) {
	const MIN_SCALE = 1;
	const MAX_SCALE = 8;
	const BUTTON_STEP = 1.35;
	let scale = MIN_SCALE;
	let offsetX = 0;
	let offsetY = 0;
	let activePointer = null;
	let dragX = 0;
	let dragY = 0;
	let zoomOut = null;
	let zoomIn = null;

	const zoomValue = el("output", {
		className: "aa-discord-share-picker__zoom-value",
		attrs: { "aria-live": "polite" },
	}, "100%");

	function clampOffsets() {
		if (!viewport.clientWidth || !viewport.clientHeight || !image.naturalWidth || !image.naturalHeight || scale <= MIN_SCALE) {
			offsetX = 0;
			offsetY = 0;
			return;
		}
		const fittedScale = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
		const maxX = Math.max(0, (image.naturalWidth * fittedScale * scale - viewport.clientWidth) / 2);
		const maxY = Math.max(0, (image.naturalHeight * fittedScale * scale - viewport.clientHeight) / 2);
		offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
		offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
	}

	function render() {
		clampOffsets();
		image.style.setProperty("--aa-discord-share-zoom", String(scale));
		image.style.setProperty("--aa-discord-share-pan-x", `${offsetX}px`);
		image.style.setProperty("--aa-discord-share-pan-y", `${offsetY}px`);
		viewport.classList.toggle("is-zoomed", scale > MIN_SCALE);
		zoomValue.value = `${Math.round(scale * 100)}%`;
		zoomValue.textContent = zoomValue.value;
		if (zoomOut) zoomOut.disabled = scale <= MIN_SCALE;
		if (zoomIn) zoomIn.disabled = scale >= MAX_SCALE;
	}

	function setScale(nextScale, clientX = null, clientY = null) {
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
		if (next === scale) return;
		const rect = viewport.getBoundingClientRect();
		const pointerX = (clientX ?? (rect.left + rect.width / 2)) - rect.left - rect.width / 2;
		const pointerY = (clientY ?? (rect.top + rect.height / 2)) - rect.top - rect.height / 2;
		const ratio = next / scale;
		offsetX = pointerX - (pointerX - offsetX) * ratio;
		offsetY = pointerY - (pointerY - offsetY) * ratio;
		scale = next;
		render();
	}

	function reset() {
		scale = MIN_SCALE;
		offsetX = 0;
		offsetY = 0;
		render();
	}

	zoomOut = iconButton({
		iconName: "zoomOut",
		label: label("picker.zoomOut", "Zoom out"),
		variant: "ghost",
		onClick: () => setScale(scale / BUTTON_STEP),
	});
	const fit = iconButton({
		iconName: "fit",
		label: label("picker.resetView", "Fit to screen"),
		variant: "ghost",
		onClick: reset,
	});
	zoomIn = iconButton({
		iconName: "zoomIn",
		label: label("picker.zoomIn", "Zoom in"),
		variant: "ghost",
		onClick: () => setScale(scale * BUTTON_STEP),
	});
	const controls = el("div", {
		className: "aa-discord-share-picker__viewer-controls",
		attrs: { role: "group", "aria-label": label("picker.viewerControls", "Image view controls") },
		children: [zoomOut, zoomValue, fit, zoomIn],
	});
	viewport.append(controls);

	viewport.addEventListener("wheel", (event) => {
		event.preventDefault();
		setScale(scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
	}, { passive: false });
	viewport.addEventListener("pointerdown", (event) => {
		viewport.focus({ preventScroll: true });
		if (event.button !== 0 || scale <= MIN_SCALE || event.target.closest?.(".aa-discord-share-picker__viewer-controls")) return;
		event.preventDefault();
		activePointer = event.pointerId;
		dragX = event.clientX - offsetX;
		dragY = event.clientY - offsetY;
		viewport.setPointerCapture(event.pointerId);
		viewport.classList.add("is-dragging");
	});
	viewport.addEventListener("pointermove", (event) => {
		if (event.pointerId !== activePointer) return;
		offsetX = event.clientX - dragX;
		offsetY = event.clientY - dragY;
		render();
	});
	const endDrag = (event) => {
		if (event.pointerId !== activePointer) return;
		activePointer = null;
		viewport.classList.remove("is-dragging");
		if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
	};
	viewport.addEventListener("pointerup", endDrag);
	viewport.addEventListener("pointercancel", endDrag);
	viewport.addEventListener("dblclick", reset);
	viewport.addEventListener("keydown", (event) => {
		if (event.target !== viewport) return;
		if (["+", "="].includes(event.key)) {
			event.preventDefault();
			setScale(scale * BUTTON_STEP);
			return;
		}
		if (event.key === "-") {
			event.preventDefault();
			setScale(scale / BUTTON_STEP);
			return;
		}
		if (event.key === "0") {
			event.preventDefault();
			reset();
			return;
		}
		const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
		if (!movement || scale <= MIN_SCALE) return;
		event.preventDefault();
		offsetX += movement[0];
		offsetY += movement[1];
		render();
	});
	image.addEventListener("load", render);
	image.draggable = false;
	const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(render) : null;
	resizeObserver?.observe(viewport);
	render();

	return {
		reset,
		destroy() {
			resizeObserver?.disconnect();
			if (activePointer !== null && viewport.hasPointerCapture(activePointer)) viewport.releasePointerCapture(activePointer);
			activePointer = null;
		},
	};
}

async function openSharePicker(shareConfig, session, snapshot, targets) {
	closeActiveDialog();
	const images = snapshot.images.map((image) => ({ ...image, url: imageUrl(image), width: 0, height: 0 }));
	let selectedIndex = 0;
	const body = el("div", "aa-discord-share-picker");
	const stageImage = el("img", { className: "aa-discord-share-picker__image", attrs: { alt: "" } });
	const viewport = el("div", {
		className: "aa-discord-share-picker__viewport",
		attrs: {
			tabindex: "0",
			role: "group",
			"aria-label": label("picker.viewer", "Image viewer. Scroll to zoom, drag enlarged images to move, and double-click to reset."),
		},
		children: [stageImage],
	});
	const imageViewer = createShareImageViewer(viewport, stageImage);
	const filename = el("strong", "aa-discord-share-picker__filename");
	const dimensions = el("span", "aa-discord-share-picker__dimensions");
	const counter = badge("", { className: "aa-discord-share-picker__counter" });
	const stage = el("div", { className: "aa-discord-share-picker__stage", children: [
		viewport,
		el("div", { className: "aa-discord-share-picker__stage-meta", children: [counter, filename, dimensions] }),
	] });
	const filmstrip = el("div", { className: "aa-discord-share-filmstrip", attrs: { role: "listbox", "aria-label": label("picker.images", "Latest run images"), tabindex: 0 } });
	const media = el("section", { className: "aa-discord-share-picker__media", attrs: { "aria-label": label("picker.images", "Latest run images") }, children: [stage, filmstrip] });
	const prompt = el("pre", "aa-discord-share-picker__prompt");
	const promptState = el("div", "aa-discord-share-picker__prompt-state");
	const footer = el("div");
	const hasPrompt = Boolean(snapshot.prompt);
	let selectedTargetIds = loadDiscordShareTargetSelection(targets);
	let longPromptPreference = loadDiscordSharePromptFilePreference();
	let longPromptAsFile = longPromptPreference;
	let targetPicker;
	let promptFileControl;
	const sendFeedbackText = el("span", "aa-discord-share-picker__send-feedback-text");
		const sendFeedback = el("div", {
			className: "aa-discord-share-picker__send-feedback",
			attrs: { role: "alert", "aria-live": "assertive", hidden: true },
			children: [
				el("span", { className: "aa-discord-share-picker__send-feedback-icon", children: [icon("statusError")] }),
				sendFeedbackText,
		],
	});
	const clearSendFeedback = () => {
		sendFeedback.hidden = true;
		sendFeedback.classList.remove("is-warning");
		sendFeedbackText.textContent = "";
	};
	const showSendFeedback = (message, { warning = false } = {}) => {
		sendFeedbackText.textContent = message;
		sendFeedback.classList.toggle("is-warning", warning);
		sendFeedback.hidden = false;
	};
	const syncSendAvailability = () => {
		send.disabled = !hasPrompt || selectedTargetIds.length === 0;
	};
	const resetSendState = () => {
		syncSendAvailability();
		send.classList.remove("is-loading");
		send.querySelector(".aa-ui-button__label").textContent = label("actions.send", "Send to Discord");
	};
	const send = button({
		label: label("actions.send", "Send to Discord"),
		iconName: "send",
		defaultAction: true,
		onClick: async () => {
			const selected = images[selectedIndex];
			if (!selected || !snapshot.prompt) return;
			clearSendFeedback();
			send.disabled = true;
			send.classList.add("is-loading");
			send.querySelector(".aa-ui-button__label").textContent = label("actions.sending", "Sending…");
			try {
				const result = await sendDiscordShare(shareConfig, session, {
					image: selected,
					prompt: snapshot.prompt,
					targetIds: selectedTargetIds,
					longPromptAsFile,
				});
				if (result?.ok) {
					closeActiveDialog();
					const deliveredLabels = (result.delivered_targets || []).map((target) => target.label).filter(Boolean);
					const destination = deliveredLabels.length ? ` (${deliveredLabels.join("、")})` : "";
					toast("success", `${label("toast.sent", "Image and prompt sent to Discord.")}${destination}`);
					return;
				}
				if (result?.code === "partial_delivery") {
					const failedIds = (result.failed_targets || []).map((target) => target.id).filter(Boolean);
				const failedLabels = (result.failed_targets || []).map((target) => target.label).filter(Boolean);
				targetPicker.setValues(failedIds);
				resetSendState();
				const message = `${label("toast.partial", "Sent to some channels. Retry the channels that failed.")} ${failedLabels.join("、")}`;
				showSendFeedback(message, { warning: true });
				toast("warn", message);
				return;
				}
				throw new Error(result?.message || label("error.unknown", "Discord sharing failed. Try again."));
			} catch (error) {
				resetSendState();
				if (error?.code === "not_member") {
					closeActiveDialog();
					scheduleEntrypointSync();
					openMembershipRequiredDialog(error, shareConfig);
				} else if ([401, 403].includes(error?.status)) {
					closeActiveDialog();
					scheduleEntrypointSync();
					openConnectDialog(shareConfig);
			} else {
				const message = shareErrorMessage(error);
				showSendFeedback(message);
				toast("error", message);
			}
			}
		},
	});

	const thumbnails = images.map((image, index) => {
		const meta = el("span", "aa-discord-share-filmstrip__meta", compactImageMeta(image));
		const item = el("button", {
			className: "aa-discord-share-filmstrip__item",
			attrs: {
				type: "button",
				role: "option",
				"aria-selected": "false",
				"aria-label": `${image.filename} · ${imageMeta(image)}`,
				title: image.filename,
			},
			children: [
				el("img", { attrs: { src: image.url, alt: "" } }),
				meta,
			],
		});
		item.addEventListener("click", () => select(index, { focus: false }));
		hydrateImageDimensions(image, () => {
			meta.textContent = compactImageMeta(image);
			item.setAttribute("aria-label", `${image.filename} · ${imageMeta(image)}`);
			if (selectedIndex === index) dimensions.textContent = imageMeta(image);
		});
		filmstrip.append(item);
		return item;
	});

	function select(index, { focus = true } = {}) {
		selectedIndex = (index + images.length) % images.length;
		const selected = images[selectedIndex];
		imageViewer.reset();
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
	filmstrip.addEventListener("wheel", (event) => {
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		event.preventDefault();
		filmstrip.scrollLeft += event.deltaY;
	}, { passive: false });
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
	promptFileControl = createLongPromptFileControl(longPromptAsFile, (value) => {
		longPromptPreference = saveDiscordSharePromptFilePreference(value);
		longPromptAsFile = longPromptPreference;
	});
	const selectedTargetsPreferPromptFile = () => targets.some((target) => (
		selectedTargetIds.includes(target.id) && target.preferPromptFile
	));
	const syncPromptFileTargetPolicy = () => {
		const recommended = selectedTargetsPreferPromptFile();
		promptFileControl.setRecommended(recommended);
		longPromptAsFile = recommended ? true : longPromptPreference;
		promptFileControl.setChecked(longPromptAsFile, { emit: false });
	};
	syncPromptFileTargetPolicy();
	targetPicker = createShareTargetPicker(targets, selectedTargetIds, (values) => {
		selectedTargetIds = saveDiscordShareTargetSelection(values, targets);
		syncPromptFileTargetPolicy();
		syncSendAvailability();
	});
	syncSendAvailability();
	body.append(
		media,
		el("section", {
			className: "aa-discord-share-picker__prompt-panel",
			attrs: { "aria-label": label("picker.prompt", "Positive prompt") },
			children: [promptState, prompt, promptFileControl.root],
		}),
	);
	footer.append(
		sendFeedback,
		targetPicker.root,
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
		onClose: () => {
			imageViewer.destroy();
			targetPicker.destroy();
			promptFileControl.destroy();
			activeDialog = null;
		},
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
		if (error?.code === "not_member") throw error;
		if (![401, 403].includes(error?.status)) throw error;
		return null;
	}
}

async function openShareFlow() {
	if (shareFlowInFlight) return;
	await ensureI18nReady();
	setShareFlowBusy(true);
	let shareConfig = null;
	try {
		shareConfig = await config();
		if (!shareConfig.enabled || !shareConfig.relayUrl) {
			openUnavailableDialog();
			return;
		}
		let session = await verifiedSession(shareConfig);
		if (!session) {
			session = await beginDiscordShareAuthentication(shareConfig);
			scheduleEntrypointSync();
		}
		const latest = captureEvents.latest;
		if (!latest?.images?.length) {
			toast("info", label("toast.verifiedRunFirst", "Discord membership verified. Run a workflow once before sharing."));
			return;
		}
		const targets = await loadDiscordShareTargets(shareConfig, session);
		await openSharePicker(shareConfig, session, latest, targets);
	} catch (error) {
		if (error?.code === "not_member" && shareConfig) {
			openMembershipRequiredDialog(error, shareConfig);
		} else if (error?.code !== "cancelled") {
			toast("error", shareErrorMessage(error));
		}
	} finally {
		setShareFlowBusy(false);
		scheduleEntrypointSync();
	}
}

async function openConnectionManager() {
	await ensureI18nReady();
	let shareConfig = null;
	try {
		shareConfig = await config();
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
		if (error?.code === "not_member" && shareConfig) openMembershipRequiredDialog(error, shareConfig);
		else toast("error", shareErrorMessage(error));
	}
}

function createSettingsControl() {
	const placement = segmentedControl({
		value: currentPlacement(),
		ariaLabel: label("settings.placement", "Share entry location"),
		className: "aa-discord-share-settings__placement",
		options: [
			{ value: "sidebar", label: label("settings.sidebar", "Sidebar footer") },
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
				toast("error", shareErrorMessage(error));
			}
		},
	}];
}

app.registerExtension({
	name: EXTENSION_NAME,
	actionBarButtons: [{
		icon: TOPBAR_ICON_CLASS,
		get tooltip() { return label("entry.topbar", "Share latest image to Discord"); },
		onClick: () => void openShareFlow(),
	}],
	async setup() {
		await ensureI18nReady();
		registerSettings();
		captureEvents.start();
		try { await config(); }
		catch (error) { console.warn("[Aaalice] Discord share configuration could not be loaded.", error); }
		observeEntrypoints();
	},
	getNodeMenuItems(node) {
		return promptSourceMenu(node);
	},
});
