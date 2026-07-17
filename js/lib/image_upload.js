/** Shared image file validation, upload, and drag/drop behavior. */

import { api } from "../../../scripts/api.js";
import { bindImagePreview, closeImagePreview } from "./image_preview.js";
import { imageReferenceViewPath, normalizeImageReference } from "./image_reference.js";
import { el, iconButton } from "./ui.js";

const IMAGE_FILE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export class ImageUploadError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "ImageUploadError";
		this.code = code;
	}
}

export function isImageFile(file) {
	if (!file || typeof file !== "object") return false;
	if (String(file.type || "").startsWith("image/")) return true;
	return !file.type && IMAGE_FILE_EXTENSION.test(String(file.name || ""));
}

export async function uploadImageFile(file) {
	if (!isImageFile(file)) throw new ImageUploadError("file-type", "Choose an image file.");
	const body = new FormData();
	body.append("image", file);
	body.append("type", "input");
	const response = await api.fetchApi("/upload/image", { method: "POST", body });
	if (!response.ok) throw new ImageUploadError("request", `HTTP ${response.status}`);
	const reference = normalizeImageReference(await response.json());
	if (!reference) throw new ImageUploadError("response", "The server response did not include an image filename.");
	return reference;
}

export function bindImageDropTarget(target, { onActive = null, onFile } = {}) {
	const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
	const stopFileEvent = (event) => {
		if (!hasFiles(event)) return false;
		event.preventDefault();
		event.stopPropagation();
		return true;
	};
	target.addEventListener("dragenter", (event) => {
		if (stopFileEvent(event)) onActive?.(true);
	});
	target.addEventListener("dragover", (event) => {
		if (!stopFileEvent(event)) return;
		if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
		onActive?.(true);
	});
	target.addEventListener("dragleave", (event) => {
		if (!target.contains(event.relatedTarget)) onActive?.(false);
	});
	target.addEventListener("drop", (event) => {
		if (!stopFileEvent(event)) return;
		onActive?.(false);
		const files = Array.from(event.dataTransfer?.files || []);
		const file = files.find(isImageFile) || files[0];
		if (file) onFile?.(file);
	});
}

export function createImageUploadControl({
	reference: value = null,
	label,
	emptyLabel = "Choose image",
	dropLabel = "Drop image here",
	clearLabel = "Clear selected image",
	className = "",
	onSelected = null,
	onClear = null,
	onError = null,
} = {}) {
	const reference = normalizeImageReference(value);
	const defaultLabel = reference?.filename || emptyLabel;
	const root = el("div", `aa-image-upload-control${className ? ` ${className}` : ""}`);
	const picker = document.createElement("input");
	picker.type = "file"; picker.accept = "image/*"; picker.hidden = true;
	const visibleLabel = el("span", "aa-image-upload-label", defaultLabel);
	const button = el("button", { className: `aa-image-upload-button${reference ? " has-image" : ""}`, attrs: { type: "button", "aria-label": label }, children: [visibleLabel] });
	const path = imageReferenceViewPath(reference);
	if (path) {
		const source = api.apiURL(path);
		const thumbnail = document.createElement("img");
		thumbnail.src = source; thumbnail.alt = ""; thumbnail.loading = "lazy"; thumbnail.decoding = "async";
		button.prepend(thumbnail);
		bindImagePreview(button, source, `${label} · ${reference.filename}`, { immediate: true });
	}
	const upload = async (file) => {
		button.disabled = true; root.classList.add("is-uploading"); root.setAttribute("aria-busy", "true"); closeImagePreview();
		try { onSelected?.(await uploadImageFile(file)); }
		catch (error) { onError?.(error); }
		finally {
			button.disabled = false; root.classList.remove("is-uploading"); root.removeAttribute("aria-busy"); picker.value = "";
		}
	};
	button.addEventListener("click", () => picker.click());
	picker.addEventListener("change", () => { const file = picker.files?.[0]; if (file) void upload(file); });
	bindImageDropTarget(root, {
		onActive: (active) => {
			if (active) closeImagePreview();
			button.classList.toggle("is-drop-target", active);
			visibleLabel.textContent = active ? dropLabel : defaultLabel;
		},
		onFile: (file) => { void upload(file); },
	});
	root.append(button, picker);
	if (reference) root.append(iconButton({
		iconName: "delete", label: clearLabel, variant: "ghost", className: "aa-image-upload-clear",
		onClick: (event) => { event.stopPropagation(); closeImagePreview(); onClear?.(); },
	}));
	return root;
}
