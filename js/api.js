/** Stable frontend adapter surface for third-party ComfyUI extensions. */

export const CONTROL_ADAPTER_API_VERSION = 1;
export const PARAMETER_OPTION_SOURCE_API_VERSION = 1;

export { registerControlRenderer } from "./lib/controls/registry.js";
export { controlView } from "./lib/controls/contract.js";
export { registerWidgetControlAdapter } from "./lib/widget_control_adapters.js";
export { invalidateControlHost } from "./lib/control_host_events.js";
export { registerParameterOptionSourceAdapter } from "./lib/parameter_option_sources.js";
