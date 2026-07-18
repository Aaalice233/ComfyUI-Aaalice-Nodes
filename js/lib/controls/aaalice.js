/** Aaalice parameter-control family shared by the node and sidebar. */

import { renderBooleanControl } from "./boolean.js";
import { renderChoiceControl } from "./choice.js";
import { renderImageControl } from "./image.js";
import { renderNumericControl } from "./numeric.js";
import { renderTagListControl } from "./taglist.js";
import { renderTextControl } from "./text.js";

export const AAALICE_CONTROL_RENDERERS = Object.freeze({
	numeric: renderNumericControl,
	seed: renderNumericControl,
	boolean: renderBooleanControl,
	choice: renderChoiceControl,
	text: renderTextControl,
	taglist: renderTagListControl,
	image: renderImageControl,
});
