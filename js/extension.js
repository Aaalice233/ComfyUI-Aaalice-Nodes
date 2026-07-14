/**
 * ComfyUI-Aaalice-Nodes frontend entry.
 * Comfy auto-loads every JavaScript file under WEB_DIRECTORY; this file also pulls
 * panel modules and injects theme CSS.
 */
import { app } from "../../scripts/app.js";
import { ensureI18nReady } from "./i18n.js";

// Explicit imports (modules also self-register when Comfy loads them directly).
import "./parameter_panel.js";
import "./parameter_sidebar.js";
import "./parameter_break.js";

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
