/** Browser-side image preparation for Discord sharing. */

export const LARGE_IMAGE_NOTICE_BYTES = 20 * 1024 * 1024;
const COMPRESSED_TARGET_BYTES = 18 * 1024 * 1024;
const WEBP_QUALITY_STEPS = Object.freeze([0.9, 0.82, 0.74, 0.66, 0.58]);

export function shouldOfferShareCompression(byteLength) {
	return Number(byteLength) > LARGE_IMAGE_NOTICE_BYTES;
}

export function formatShareBytes(byteLength) {
	const bytes = Math.max(0, Number(byteLength) || 0);
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function compressedShareFilename(filename) {
	const value = String(filename || "image").trim() || "image";
	const stem = value.replace(/\.[^.]+$/, "") || "image";
	return `${stem}-compressed.webp`;
}

async function decodeImage(blob) {
	if (typeof createImageBitmap === "function") {
		const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
		return {
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			destroy: () => bitmap.close?.(),
		};
	}
	const url = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.decoding = "async";
		await new Promise((resolve, reject) => {
			image.onload = resolve;
			image.onerror = () => reject(new Error("The selected image could not be decoded for compression."));
			image.src = url;
		});
		return { source: image, width: image.naturalWidth, height: image.naturalHeight, destroy: () => {} };
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function encodeCanvas(canvas, quality) {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error("The browser could not encode the compressed image."));
		}, "image/webp", quality);
	});
}

function drawImage(canvas, context, source, width, height) {
	canvas.width = width;
	canvas.height = height;
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = "high";
	context.clearRect(0, 0, width, height);
	context.drawImage(source, 0, 0, width, height);
}

export async function compressDiscordShareImage(upload, { targetBytes = COMPRESSED_TARGET_BYTES } = {}) {
	const originalBlob = upload?.blob;
	if (!(originalBlob instanceof Blob)) throw new Error("A source image is required for compression.");
	const decoded = await decodeImage(originalBlob);
	if (!decoded.width || !decoded.height) {
		decoded.destroy();
		throw new Error("The selected image has invalid dimensions.");
	}
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d", { alpha: true });
	if (!context) {
		decoded.destroy();
		throw new Error("The browser could not create an image compression canvas.");
	}
	let width = decoded.width;
	let height = decoded.height;
	let best = null;
	try {
		drawImage(canvas, context, decoded.source, width, height);
		for (const quality of WEBP_QUALITY_STEPS) {
			const candidate = await encodeCanvas(canvas, quality);
			if (!best || candidate.size < best.size) best = candidate;
			if (candidate.size <= targetBytes) break;
		}
		while (best.size > targetBytes && (width > 1 || height > 1)) {
			const scale = Math.min(0.9, Math.sqrt(targetBytes / best.size) * 0.94);
			const nextWidth = Math.max(1, Math.floor(width * scale));
			const nextHeight = Math.max(1, Math.floor(height * scale));
			if (nextWidth === width && nextHeight === height) break;
			width = nextWidth;
			height = nextHeight;
			drawImage(canvas, context, decoded.source, width, height);
			const candidate = await encodeCanvas(canvas, WEBP_QUALITY_STEPS[1]);
			if (candidate.size >= best.size && width === 1 && height === 1) break;
			best = candidate;
		}
	} finally {
		decoded.destroy();
		canvas.width = 1;
		canvas.height = 1;
	}
	if (!best) throw new Error("The browser could not compress the selected image.");
	return {
		...upload,
		blob: best,
		filename: compressedShareFilename(upload.filename),
		width,
		height,
		compressed: true,
		originalBytes: originalBlob.size,
	};
}
