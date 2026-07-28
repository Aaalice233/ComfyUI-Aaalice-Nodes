/** Package frontend entry: imports business registrations and injects shared CSS. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady } from "./i18n.js";

import "./parameter_panel.js";
import "./parameter_receiver.js";
import "./enum_switch.js";
import "./group_is_enabled.js";
import "./simple_notify.js";
import "./prompt_cleaning_maid.js";
import "./prompt_selector.js";
import "./character_feature_swap.js";
import "./booru_gallery.js";
import "./resolution_preset.js";
import "./fetch_from_krita.js";
import "./workspace.js";

function injectStyles() {
	for (const filename of ["ui.css", "theme.css"]) {
		const id = `aaalice-${filename.replace(".css", "")}-css`;
		if (document.getElementById(id)) continue;
		const link = document.createElement("link");
		link.id = id;
		link.rel = "stylesheet";
		try {
			link.href = new URL(`./lib/${filename}`, import.meta.url).href;
		} catch {
			link.href = `extensions/ComfyUI-Aaalice-Nodes/lib/${filename}`;
		}
		document.head.appendChild(link);
	}
}

app.registerExtension({
	name: "ComfyUI.Aaalice.Nodes",

	async setup() {
		injectStyles();
		await ensureI18nReady();
	},
});
