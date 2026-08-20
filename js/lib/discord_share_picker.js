/** Latest-run media picker and send flow for Discord sharing. */
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
	loadDiscordShareImage,
	loadDiscordSharePromptFilePreference,
	loadDiscordShareTargetSelection,
	saveDiscordSharePromptFilePreference,
	saveDiscordShareTargetSelection,
	sendDiscordShare,
} from "./discord_share_client.js";
import { badge, button, createDialog, el, icon } from "./ui.js";
import { createShareImageViewer } from "./discord_share_image_viewer.js";
import {
	compressDiscordShareImage,
	formatShareBytes,
	shouldOfferShareCompression,
} from "./discord_share_image_prepare.js";
import { createLongPromptFileControl } from "./discord_share_prompt_file.js";
import { createShareTargetPicker } from "./discord_share_target_picker.js";
import { normalizeSharePrompt, preferredShareImageIndex } from "./discord_share_model.js";

function imageUrl(reference) {
	const query = new URLSearchParams({
		filename: reference.filename,
		subfolder: reference.subfolder || "",
		type: reference.type || "output",
	});
	return api.apiURL(`/view?${query}${app.getRandParam?.() || ""}`);
}

function chooseLargeImageUpload({ filename, byteLength, label }) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (choice) => {
			if (settled) return;
			settled = true;
			dialog.close(choice);
			resolve(choice);
		};
		const body = el("div", {
			className: "aa-discord-share-large-image",
			children: [
				el("div", { className: "aa-discord-share-large-image__icon", children: [icon("image")] }),
				el("strong", { className: "aa-discord-share-large-image__filename", text: filename }),
				badge(formatShareBytes(byteLength), { className: "aa-discord-share-large-image__size" }),
				el("p", null, label("largeImage.body", "This image is larger than 20 MB. Compressing an upload copy can make sharing faster without changing the ComfyUI output.")),
			],
		});
		const footer = el("div", { children: [
			button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => finish(null) }),
			button({ label: label("largeImage.original", "Send original"), variant: "secondary", onClick: () => finish("original") }),
			button({ label: label("largeImage.compress", "Compress and send"), iconName: "sparkles", defaultAction: true, onClick: () => finish("compress") }),
		] });
		const dialog = createDialog({
			title: label("largeImage.title", "Large image: compress before sending?"),
			body,
			footer,
			size: "compact",
			className: "aa-discord-share-large-image-dialog",
			returnFocus: document.activeElement,
			onClose: () => {
				if (!settled) {
					settled = true;
					resolve(null);
				}
			},
		});
	});
}

export function createDiscordSharePicker({
	closeActiveDialog,
	label,
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
		if (image.width && image.height) return Promise.resolve();
		return new Promise((resolve) => {
			const probe = new Image();
			probe.onload = () => {
				image.width = probe.naturalWidth;
				image.height = probe.naturalHeight;
				onChange?.();
				resolve();
			};
			probe.onerror = resolve;
			probe.src = image.url;
		});
	}

	return async function openSharePicker(shareConfig, session, snapshot, targets) {
		closeActiveDialog();
		const images = snapshot.images.map((image) => ({ ...image, url: imageUrl(image), width: 0, height: 0 }));
		let selectedIndex = preferredShareImageIndex(images);
		let selectionTouched = false;
		let pickerActive = true;
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
		const promptEditor = el("textarea", {
			className: "aa-discord-share-picker__prompt-editor",
			attrs: {
				hidden: true,
				spellcheck: "false",
				"aria-label": label("picker.promptEditor", "Edit positive prompt"),
			},
		});
		const promptEditError = el("div", {
			className: "aa-discord-share-picker__prompt-edit-error",
			attrs: { role: "alert", hidden: true },
		});
		const promptEditCount = el("span", "aa-discord-share-picker__prompt-edit-count");
		const promptEditHint = el("span", "aa-discord-share-picker__prompt-edit-hint", label("picker.promptLocalOnly", "Changes apply to this share only; the workflow stays unchanged."));
		const promptEditMeta = el("div", {
			className: "aa-discord-share-picker__prompt-edit-meta",
			attrs: { hidden: true, "aria-live": "polite" },
			children: [promptEditHint, promptEditCount],
		});
		const promptState = el("div", "aa-discord-share-picker__prompt-state");
		const promptActions = el("div", { className: "aa-discord-share-picker__prompt-actions" });
		const promptHeader = el("div", { className: "aa-discord-share-picker__prompt-header", children: [promptState, promptActions] });
		const promptContent = el("div", {
			className: "aa-discord-share-picker__prompt-content",
			children: [prompt, promptEditor, promptEditError, promptEditMeta],
		});
		const footer = el("div");
		const initialPrompt = normalizeSharePrompt(snapshot.prompt);
		let promptValue = initialPrompt;
		let promptEditing = false;
		let promptWasEdited = false;
		const hasPrompt = Boolean(initialPrompt);
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
		const renderPromptState = () => {
			const missing = !promptValue;
			const stateIcon = missing ? "statusWarning" : promptEditing ? "edit" : "statusCheck";
			const stateClass = missing ? "aa-discord-share-picker__prompt-warning" : promptEditing ? "aa-discord-share-picker__prompt-editing" : "aa-discord-share-picker__prompt-ok";
			const stateLabel = missing
				? label("picker.promptUnavailable", "Prompt unavailable")
				: promptEditing
					? label("picker.promptEditing", "Editing prompt")
					: promptWasEdited
						? label("picker.promptEdited", "Edited prompt")
						: snapshot.promptBinding?.label || label("picker.prompt", "Positive prompt");
			promptState.replaceChildren(
				el("span", { className: stateClass, children: [icon(stateIcon)] }),
				el("strong", null, stateLabel),
			);
		};
		const syncPromptEditor = () => {
			prompt.textContent = promptValue || label("picker.promptMissing", "Right-click a Preview Any node and set it as the Discord prompt source, then run the workflow again.");
			prompt.classList.toggle("is-missing", !promptValue);
			promptEditor.value = promptEditing ? promptEditor.value : promptValue;
			prompt.hidden = promptEditing;
			promptEditor.hidden = !promptEditing;
			promptEditMeta.hidden = !promptEditing;
			promptEditCount.textContent = label("picker.promptCharacters", "{count} characters").replace("{count}", String(promptEditor.value.length));
			promptEditError.hidden = true;
			promptEditError.textContent = "";
			editPromptButton.hidden = !hasPrompt || promptEditing;
			savePromptButton.hidden = !promptEditing;
			discardPromptButton.hidden = !promptEditing;
			renderPromptState();
		};
		const syncSendAvailability = () => {
			send.disabled = promptEditing || !normalizeSharePrompt(promptValue) || selectedTargetIds.length === 0;
		};
		const resetSendState = () => {
			syncSendAvailability();
			send.classList.remove("is-loading");
			send.querySelector(".aa-ui-button__label").textContent = label("actions.send", "Send to Discord");
		};
		const beginPromptEdit = () => {
			if (!hasPrompt || promptEditing) return;
			promptEditing = true;
			promptEditor.value = promptValue;
			syncPromptEditor();
			syncSendAvailability();
			promptEditor.focus();
			promptEditor.setSelectionRange(promptEditor.value.length, promptEditor.value.length);
		};
		const savePromptEdit = () => {
			const nextPrompt = normalizeSharePrompt(promptEditor.value);
			if (!nextPrompt) {
				promptEditError.textContent = label("picker.promptEmpty", "Enter a prompt before sending.");
				promptEditError.hidden = false;
				promptEditor.focus();
				return false;
			}
			promptValue = nextPrompt;
			promptWasEdited = promptValue !== initialPrompt;
			promptEditing = false;
			syncPromptEditor();
			syncSendAvailability();
			return true;
		};
		const discardPromptEdit = () => {
			if (!promptEditing) return;
			promptEditing = false;
			syncPromptEditor();
			syncSendAvailability();
		};
		const editPromptButton = button({
			label: label("picker.editPrompt", "Edit prompt"),
			iconName: "edit",
			variant: "ghost",
			className: "aa-discord-share-picker__prompt-edit-button",
			onClick: beginPromptEdit,
		});
		const savePromptButton = button({
			label: label("picker.savePrompt", "Use edited prompt"),
			iconName: "statusCheck",
			variant: "secondary",
			className: "aa-discord-share-picker__prompt-save-button",
			onClick: savePromptEdit,
		});
		const discardPromptButton = button({
			label: label("picker.discardPrompt", "Discard edits"),
			variant: "ghost",
			className: "aa-discord-share-picker__prompt-discard-button",
			onClick: discardPromptEdit,
		});
		promptActions.append(editPromptButton, savePromptButton, discardPromptButton);
		promptEditor.addEventListener("input", () => {
			promptEditCount.textContent = label("picker.promptCharacters", "{count} characters").replace("{count}", String(promptEditor.value.length));
			promptEditError.hidden = true;
			promptEditError.textContent = "";
			clearSendFeedback();
		});
		promptEditor.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				discardPromptEdit();
			} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				savePromptEdit();
			}
		});
		const sendInBackground = async ({ selected, upload, sharePrompt, targetIds, promptAsFile }) => {
			try {
				const result = await sendDiscordShare(shareConfig, session, {
					image: selected,
					upload,
					prompt: sharePrompt,
					targetIds,
					longPromptAsFile: promptAsFile,
				});
				if (result?.ok) {
					const deliveredLabels = (result.delivered_targets || []).map((target) => target.label).filter(Boolean);
					const destination = deliveredLabels.length ? ` (${deliveredLabels.join(" · ")})` : "";
					toast("success", `${label("toast.sent", "Image and prompt sent to Discord.")}${destination}`);
					return;
				}
				if (result?.code === "partial_delivery") {
					const failedIds = (result.failed_targets || []).map((target) => target.id).filter(Boolean);
					const failedLabels = (result.failed_targets || []).map((target) => target.label).filter(Boolean);
					saveDiscordShareTargetSelection(failedIds, targets);
					const suffix = failedLabels.length ? ` ${failedLabels.join(" · ")}` : "";
					toast("warn", `${label("toast.partial", "Some channels succeeded. Failed channels remain selected for retry:")}${suffix}`);
					return;
				}
				throw new Error(result?.message || label("error.unknown", "Discord sharing failed. Try again."));
			} catch (error) {
				if (error?.code === "not_member" || [401, 403].includes(error?.status)) scheduleEntrypointSync();
				toast("error", shareErrorMessage(error));
			}
		};
		const send = button({
			label: label("actions.send", "Send to Discord"),
			iconName: "send",
			defaultAction: true,
			onClick: async () => {
				const sharePrompt = normalizeSharePrompt(promptValue);
				if (!sharePrompt || promptEditing) return;
				clearSendFeedback();
				send.disabled = true;
				send.classList.add("is-loading");
				send.querySelector(".aa-ui-button__label").textContent = label("actions.preparing", "Preparing…");
				try {
					await dimensionsReady;
					if (!pickerActive) return;
					const selected = images[selectedIndex];
					if (!selected) return;
					let upload = await loadDiscordShareImage(selected);
					if (!pickerActive) return;
					if (shouldOfferShareCompression(upload.blob.size)) {
						const choice = await chooseLargeImageUpload({ filename: upload.filename, byteLength: upload.blob.size, label });
						if (!pickerActive) return;
						if (!choice) {
							resetSendState();
							return;
						}
						if (choice === "compress") {
							send.querySelector(".aa-ui-button__label").textContent = label("actions.compressing", "Compressing…");
							try {
								upload = await compressDiscordShareImage(upload);
								if (!pickerActive) return;
							} catch (cause) {
								const error = new Error("The browser could not compress the selected image.", { cause });
								error.code = "image_compression_failed";
								throw error;
							}
						}
					}
					const backgroundRequest = {
						selected: { ...selected },
						upload,
						sharePrompt,
						targetIds: [...selectedTargetIds],
						promptAsFile: longPromptAsFile,
					};
					closeActiveDialog();
					void sendInBackground(backgroundRequest);
				} catch (error) {
					if (!pickerActive) return;
					resetSendState();
					showSendFeedback(shareErrorMessage(error));
				}
			},
		});

		const dimensionPromises = [];
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
			item.addEventListener("click", () => {
				selectionTouched = true;
				select(index, { focus: false });
			});
			dimensionPromises.push(hydrateImageDimensions(image, () => {
				meta.textContent = compactImageMeta(image);
				item.setAttribute("aria-label", `${image.filename} · ${imageMeta(image)}`);
				if (selectionTouched && selectedIndex === index) dimensions.textContent = imageMeta(image);
			}));
			filmstrip.append(item);
			return item;
		});
		const dimensionsReady = Promise.all(dimensionPromises).then(() => {
			if (!selectionTouched) select(preferredShareImageIndex(images), { focus: false });
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
			selectionTouched = true;
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
		syncPromptEditor();
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
				children: [promptHeader, promptContent, promptFileControl.root],
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
				pickerActive = false;
				imageViewer.destroy();
				targetPicker.destroy();
				promptFileControl.destroy();
				setActiveDialog(null);
			},
		});
		setActiveDialog(dialog);
		select(preferredShareImageIndex(images), { focus: false });
	};
}
