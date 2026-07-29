/** ComfyUI widget family. Policies stay separate from Aaalice parameter controls. */

import { renderBooleanControl } from "./boolean.js";
import { renderChoiceControl } from "./choice.js";
import { renderNumericControl } from "./numeric.js";
import { renderTextControl } from "./text.js";
import { renderImageChoiceControl } from "./image_choice.js";
import { renderMarkdownControl } from "./markdown.js";
import { renderImageCompareControl } from "./image_compare.js";

export const COMFY_CONTROL_RENDERERS = Object.freeze({
	numeric: (spec, port) => renderNumericControl(spec, port),
	seed: (spec, port) => renderNumericControl(spec, port),
	boolean: (spec, port) => renderBooleanControl({ ...spec, presentation: { ...spec.presentation, compact: true, headerOnly: true } }, port),
	choice: (spec, port) => renderChoiceControl({ ...spec, presentation: { ...spec.presentation, segmented: false } }, port),
	text: (spec, port) => renderTextControl(spec, port),
	"image-choice": (spec, port) => renderImageChoiceControl(spec, port),
	markdown: (spec, port) => renderMarkdownControl(spec, port),
	"image-compare": (spec) => renderImageCompareControl(spec),
});
