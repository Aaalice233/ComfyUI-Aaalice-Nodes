/** Shared read-only surface for structurally valid controls that are temporarily unavailable. */

import { el } from "../ui.js";
import { controlView } from "./contract.js";

function availabilityMessage(spec) {
	const availability = spec.availability || {};
	if (availability.message) return availability.message;
	if (availability.reason === "no-options") return spec.labels.noOptions || "No options available";
	if (availability.state === "unset") return spec.labels.unset || "No value available";
	if (availability.state === "error") return spec.labels.error || "Control unavailable due to an error";
	return spec.labels.unavailable || "Control is temporarily unavailable";
}

export function renderControlAvailability(spec) {
	const message = availabilityMessage(spec);
	const root = el("div", {
		className: `aa-control aa-control-availability is-${spec.availability.state}`,
		attrs: { role: "status", "aria-disabled": "true", title: message },
		children: [el("span", { className: "aa-control-availability__indicator", attrs: { "aria-hidden": "true" } }), el("span", "aa-control-availability__label", message)],
	});
	return controlView({ root, kind: spec.kind });
}
