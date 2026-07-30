/** Shared image file validation, upload, and drag/drop behavior. */

import { api } from "../../../scripts/api.js";
import { normalizeImageReference } from "./image_reference.js";

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

export async function uploadImageFile(file, { type = "input", subfolder = "" } = {}) {
	if (!isImageFile(file)) throw new ImageUploadError("file-type", "Choose an image file.");
	const uploadType = ["input", "output", "temp"].includes(String(type).toLowerCase()) ? String(type).toLowerCase() : "input";
	const body = new FormData();
	body.append("image", file);
	body.append("type", uploadType);
	if (subfolder) body.append("subfolder", String(subfolder));
	const response = await api.fetchApi("/upload/image", { method: "POST", body });
	if (!response.ok) throw new ImageUploadError("request", `HTTP ${response.status}`);
	const reference = normalizeImageReference({ ...(await response.json()), type: uploadType });
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
