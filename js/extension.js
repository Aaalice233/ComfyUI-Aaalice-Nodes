/** Package frontend entry: imports business registrations and injects shared CSS. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady } from "./i18n.js";

import "./parameter_panel.js";
import "./operation_panel.js";

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
		console.log("[Aaalice] extension setup complete");
	},
});
