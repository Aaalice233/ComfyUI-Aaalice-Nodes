/** Image-file combo renderer for ComfyUI image upload widgets. */

import { api } from "../../../../scripts/api.js";
import { bindImagePreview, closeImagePreview } from "../image_preview.js";
import { imageComboReference, imageReferenceComboValue, imageReferenceViewPath } from "../image_reference.js";
import { bindImageDropTarget, uploadImageFile } from "../image_upload.js";
import { button as uiButton, createAnchoredPopover, el, icon, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

export function renderImageChoiceControl(spec, port) {
	const values = Array.isArray(spec.options.values) ? spec.options.values.map(String) : [];
	const imageFolder = String(spec.options.image_folder || "input").toLowerCase();
	let current = String(spec.value ?? "");
	const root = el("div", "aa-control aa-control-image-choice");
	const picker = document.createElement("input");
	picker.type = "file"; picker.accept = "image/*"; picker.hidden = true;
	const thumbnail = document.createElement("img");
	thumbnail.className = "aa-control-image-choice__thumb"; thumbnail.alt = ""; thumbnail.loading = "lazy"; thumbnail.decoding = "async";
	const name = el("span", "aa-control-image-choice__name");
	const button = el("button", { className: "aa-control-image-choice__button", attrs: { type: "button", "aria-label": spec.label, "aria-haspopup": "dialog", "aria-expanded": "false" }, children: [thumbnail, name, icon("moveDown", { className: "aa-control-image-choice__arrow" })] });
	const clear = iconButton({
		iconName: "delete",
		label: spec.labels.clear || "Clear selected image",
		variant: "ghost",
		className: "aa-control-image-choice__clear",
		onClick: (event) => {
			event.stopPropagation();
			closeImagePreview();
			popover?.close();
			port.commit("");
		},
	});
	const viewSource = () => {
		const reference = imageComboReference(current, imageFolder);
		return reference.filename ? { source: api.apiURL(imageReferenceViewPath(reference)), title: `${spec.label} · ${reference.filename}` } : null;
	};
	const sync = (value) => {
		current = String(value ?? "");
		const reference = imageComboReference(current, imageFolder);
		name.textContent = reference.filename || current || spec.labels.none || "Choose image";
		button.classList.toggle("has-image", Boolean(reference.filename));
		clear.hidden = !reference.filename;
		const view = viewSource();
		if (view) thumbnail.src = view.source; else thumbnail.removeAttribute("src");
	};
	sync(current);
	bindImagePreview(button, "", "", { immediate: true, resolve: viewSource });
	let popover = null;
	let uploading = false;
	const upload = async (file) => {
		if (uploading) return;
		uploading = true;
		button.disabled = true; clear.disabled = true;
		root.classList.add("is-uploading"); root.setAttribute("aria-busy", "true");
		closeImagePreview();
		try {
			const reference = await uploadImageFile(file);
			const value = imageReferenceComboValue(reference, imageFolder);
			popover?.close();
			port.commit(value);
			port.onSuccess(reference);
		} catch (error) {
			port.onError(error);
		} finally {
			uploading = false;
			button.disabled = false; clear.disabled = false;
			root.classList.remove("is-uploading"); root.removeAttribute("aria-busy"); picker.value = "";
		}
	};
	const openMenu = () => {
		if (popover) return;
		button.setAttribute("aria-expanded", "true");
		const rows = [];
		const list = el("div", { className: "aa-control-image-choice__menu", attrs: { role: "listbox", "aria-label": spec.label } });
		for (const value of values) {
			const reference = imageComboReference(value, imageFolder);
			const active = value === current;
			const thumb = document.createElement("img");
			thumb.className = "aa-control-image-choice__option-thumb"; thumb.alt = ""; thumb.loading = "lazy"; thumb.decoding = "async";
			if (reference.filename) thumb.src = api.apiURL(imageReferenceViewPath(reference));
			const row = el("button", {
				className: `aa-control-image-choice__option${active ? " is-active" : ""}`,
				attrs: { type: "button", role: "option", "aria-selected": String(active) },
				children: [thumb, el("span", "aa-control-image-choice__option-name", reference.filename || value), ...(active ? [icon("statusCheck", { className: "aa-control-image-choice__check" })] : [])],
			});
			row.addEventListener("click", () => { popover?.close(); if (!active) port.commit(value); });
			rows.push(row); list.append(row);
		}
		list.addEventListener("keydown", (event) => {
			if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const index = rows.indexOf(document.activeElement);
			const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, index) + (event.key === "ArrowDown" ? 1 : -1);
			rows[(next + rows.length) % rows.length]?.focus();
		});
		popover = createAnchoredPopover({
			anchor: button, ariaLabel: spec.label, className: "aa-control-image-choice__popover", width: 280,
			onClose: () => { popover = null; button.setAttribute("aria-expanded", "false"); },
		});
		popover.root.append(
			uiButton({
				label: spec.labels.upload || "Upload from device",
				iconName: "upload",
				variant: "secondary",
				size: "sm",
				className: "aa-control-image-choice__upload",
				onClick: () => picker.click(),
			}),
			list,
		);
	};
	button.addEventListener("click", openMenu);
	picker.addEventListener("change", () => { const file = picker.files?.[0]; if (file) void upload(file); });
	bindImageDropTarget(root, {
		onActive: (active) => {
			if (active) closeImagePreview();
			button.classList.toggle("is-drop-target", active);
			if (active) name.textContent = spec.labels.drop || "Drop image here"; else sync(current);
		},
		onFile: (file) => { void upload(file); },
	});
	root.append(button, clear, picker);
	return controlView({ root, kind: "image-choice", update: (next) => sync(next.value) });
}
