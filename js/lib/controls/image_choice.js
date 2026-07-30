/** Image-file combo renderer for ComfyUI image upload widgets. */

import { createImageAssetControl } from "../image_asset_control.js";
import { imageComboReference, imageReferenceComboValue } from "../image_reference.js";
import { controlView } from "./contract.js";

export function renderImageChoiceControl(spec, port) {
	const values = Array.isArray(spec.options.values) ? spec.options.values.map(String) : [];
	const imageFolder = String(spec.options.image_folder || "input").toLowerCase();
	const control = createImageAssetControl({
		reference: imageComboReference(spec.value, imageFolder),
		values,
		defaultType: imageFolder,
		uploadType: imageFolder,
		uploadSubfolder: spec.options.upload_subfolder || "",
		label: spec.label,
		labels: spec.labels,
		onChange: (reference) => port.commit(imageReferenceComboValue(reference, imageFolder)),
		onUploaded: (reference) => port.onSuccess(reference),
		onError: port.onError,
	});
	control.root.classList.add("aa-control", "aa-control-image-choice");
	return controlView({
		root: control.root,
		kind: "image-choice",
		update: (next) => control.update(imageComboReference(next.value, imageFolder)),
		destroy: control.destroy,
	});
}
