/** Latest-run media picker and send flow for Discord sharing. */
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
	loadDiscordSharePromptFilePreference,
	loadDiscordShareTargetSelection,
	saveDiscordSharePromptFilePreference,
	saveDiscordShareTargetSelection,
	sendDiscordShare,
} from "./discord_share_client.js";
import { badge, button, createDialog, el, icon } from "./ui.js";
import { createShareImageViewer } from "./discord_share_image_viewer.js";
import { createLongPromptFileControl } from "./discord_share_prompt_file.js";
import { createShareTargetPicker } from "./discord_share_target_picker.js";

function imageUrl(reference) {
	const query = new URLSearchParams({
		filename: reference.filename,
		subfolder: reference.subfolder || "",
		type: reference.type || "output",
	});
	return api.apiURL(`/view?${query}${app.getRandParam?.() || ""}`);
}

export function createDiscordSharePicker({
	closeActiveDialog,
	label,
	openConnectDialog,
	openMembershipRequiredDialog,
	scheduleEntrypointSync,
	setActiveDialog,
	shareErrorMessage,
	toast,
}) {
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

	return async function openSharePicker(shareConfig, session, snapshot, targets) {
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
		const imageViewer = createShareImageViewer(viewport, stageImage, { label });
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
		}, { label });
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
		}, { label });
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
		const dialog = createDialog({
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
				setActiveDialog(null);
			},
		});
		setActiveDialog(dialog);
		select(0, { focus: false });
	};
}
