/**
 * ComfyUI-Aaalice-Nodes frontend entry.
 * Comfy auto-loads every JavaScript file under WEB_DIRECTORY; this file also pulls
 * panel modules and injects theme CSS.
 */
import { app } from "../../scripts/app.js";
import { ensureI18nReady } from "./i18n.js";

// Explicit imports (modules also self-register when Comfy loads them directly).
import "./parameter_control_panel.js";
import "./parameter_sidebar.js";
import "./parameter_break.js";

function injectTheme() {
	const id = "aaalice-theme-css";
	if (document.getElementById(id)) return;
	// Prefer link; fallback path without import.meta (older embeds)
	const link = document.createElement("link");
	link.id = id;
	link.rel = "stylesheet";
	try {
		link.href = new URL("./lib/theme.css", import.meta.url).href;
	} catch {
		link.href = "extensions/ComfyUI-Aaalice-Nodes/lib/theme.css";
	}
	document.head.appendChild(link);
}

app.registerExtension({
	name: "ComfyUI.Aaalice.Nodes",

	async setup() {
		injectTheme();
		await ensureI18nReady();
		console.log("[Aaalice] extension setup complete");
	},
});
