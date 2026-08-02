/** ComfyUI widget family. */

import { renderBooleanControl } from "./boolean.js";
import { renderChoiceControl } from "./choice.js";
import { renderNumericControl } from "./numeric.js";
import { renderTextControl } from "./text.js";
import { renderImageChoiceControl } from "./image_choice.js";
import { renderMarkdownControl } from "./markdown.js";
import { renderImageCompareControl } from "./image_compare.js";
import { renderImageOutputControl } from "./image_output.js";
import { renderTextOutputControl } from "./text_output.js";
import { renderQuickGroupManagerControl } from "./quick_group_manager.js";

export const COMFY_CONTROL_RENDERERS = Object.freeze({
	numeric: (spec, port) => renderNumericControl(spec, port),
	seed: (spec, port) => renderNumericControl(spec, port),
	boolean: (spec, port) => renderBooleanControl({ ...spec, presentation: { ...spec.presentation, compact: true, headerOnly: true } }, port),
	choice: (spec, port) => renderChoiceControl({ ...spec, presentation: { ...spec.presentation, segmented: false } }, port),
	text: (spec, port) => renderTextControl(spec, port),
	"image-choice": (spec, port) => renderImageChoiceControl(spec, port),
	markdown: (spec, port) => renderMarkdownControl(spec, port),
	"image-compare": (spec) => renderImageCompareControl(spec),
	"image-output": (spec) => renderImageOutputControl(spec),
	"text-output": (spec) => renderTextOutputControl(spec),
	"quick-group-manager": (spec, port) => renderQuickGroupManagerControl(spec, port),
});
