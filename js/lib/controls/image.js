/** Shared image-reference control renderer. */

import { createImageAssetControl } from "../image_asset_control.js";
import { controlView } from "./contract.js";

export function renderImageControl(spec, port) {
	const control = createImageAssetControl({
		reference: spec.value,
		label: spec.label,
		labels: spec.labels,
		onChange: (next) => port.commit(next),
		onUploaded: (next) => port.onSuccess(next),
		onError: port.onError,
	});
	const { root } = control;
	root.classList.add("aa-control-image");
	root.classList.add("aa-control");
	return controlView({ root, kind: "image", update: (next) => control.update(next.value), destroy: control.destroy });
}
