/** Shared image-reference control renderer. */

import { createImageUploadControl } from "../image_upload.js";
import { controlView } from "./contract.js";

export function renderImageControl(spec, port) {
	const root = createImageUploadControl({
		reference: spec.value,
		label: spec.label,
		emptyLabel: spec.labels.none || "Choose image",
		dropLabel: spec.labels.drop || "Drop image here",
		clearLabel: spec.labels.clear || "Clear selected image",
		className: "aa-control-image",
		onSelected: (next) => { port.commit(next); port.onSuccess(next); },
		onClear: () => port.commit(null),
		onError: port.onError,
	});
	root.classList.add("aa-control");
	return controlView({ root, kind: "image" });
}
