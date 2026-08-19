/** Pure normalization for the image asset picker. */

import { imageComboReference, normalizeImageReference } from "./image_reference.js";

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const VALID_TYPES = new Set(["input", "output", "temp"]);

function normalizedType(value, fallback = "input") {
	const type = String(value || fallback).toLowerCase();
	return VALID_TYPES.has(type) ? type : fallback;
}

export function imageAssetKey(value) {
	const reference = normalizeImageReference(value);
	if (!reference) return "";
	return `${normalizedType(reference.type)}\0${reference.subfolder}\0${reference.filename}`;
}

function imageReference(value, defaultType) {
	if (typeof value === "string") return imageComboReference(value, defaultType);
	return normalizeImageReference(value);
}

function historyImages(history) {
	const jobs = Array.isArray(history) ? history : Object.values(history || {});
	return jobs.flatMap((job) => {
		const outputs = job?.outputs && typeof job.outputs === "object" ? Object.values(job.outputs) : [];
		const nodeImages = outputs.flatMap((output) => Array.isArray(output?.images) ? output.images : []);
		const previews = Array.isArray(job?.preview_output) ? job.preview_output : (job?.preview_output ? [job.preview_output] : []);
		return [...previews, ...nodeImages];
	});
}

/**
 * Merge widget values, uploaded inputs, generated history and a possibly stale current value.
 * The first occurrence wins while insertion order stays deterministic.
 */
export function collectImageAssetCandidates({
	values = [],
	inputFiles = [],
	history = {},
	current = null,
	defaultType = "input",
} = {}) {
	const assets = new Map();
	const add = (value, fallbackType, source) => {
		const reference = imageReference(value, fallbackType);
		if (!reference?.filename || (!IMAGE_EXTENSION.test(reference.filename) && !reference.filename.startsWith("blake3:"))) return;
		reference.type = normalizedType(reference.type, fallbackType);
		const key = imageAssetKey(reference);
		if (!key || assets.has(key)) return;
		assets.set(key, { key, reference, source, label: reference.filename });
	};

	for (const value of values) {
		const type = normalizedType(imageReference(value, defaultType)?.type, defaultType);
		add(value, defaultType, type === "input" ? "inputs" : "outputs");
	}
	for (const value of inputFiles) add(value, "input", "inputs");
	for (const value of historyImages(history)) add(value, "output", "outputs");
	add(current, defaultType, normalizedType(imageReference(current, defaultType)?.type, defaultType) === "input" ? "inputs" : "outputs");
	return [...assets.values()];
}
