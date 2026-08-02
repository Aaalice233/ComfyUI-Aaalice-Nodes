/** Stable public entry point for Aaalice shared UI helpers. */

export * from "./ui/primitives.js";
export {
	bindScrollInteractionGuard,
	closeTooltipWithin,
	createTooltip,
	isScrollInteractionActive,
} from "./ui/transient_surfaces.js";
export * from "./ui/overlays.js";
export * from "./ui/controls.js";
