import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStyleEntry } from "./helpers/style_source.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readLib = (path) => readFileSync(join(ROOT, "js", "lib", ...path.split("/")), "utf8");
const workspace = ["workspace.js", "workspace/dashboard_view.js"]
	.map((path) => readFileSync(join(ROOT, "js", ...path.split("/")), "utf8")).join("\n");
const providers = readLib("control_providers.js");
const workspaceControls = readLib("workspace_controls.js");
const numericControl = readLib("controls/numeric.js");
const dashboardModel = readLib("dashboard_model.js");
const dashboardComponents = readLib("dashboard_components.js");
const workspaceComponents = readLib("workspace_components.js");
const dashboardInteractions = readLib("dashboard_interactions.js");
const dashboardLayout = readLib("dashboard_layout.js");
const dashboardSizing = readLib("dashboard_sizing.js");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

test("Dashboard footprints use bounded integer spans rather than a discrete size catalog", () => {
	assert.match(dashboardModel, /export const DASHBOARD_VERSION = 4/);
	assert.match(providers, /recommendedControlRowSpan/);
	assert.match(dashboardSizing, /DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN = DASHBOARD_DEFAULT_CONTROL_ROW_SPAN/);
	assert.doesNotMatch(dashboardSizing, /DASHBOARD_SIZE_CATALOG|DASHBOARD_CONTROL_(?:COLUMN|ROW)_SPANS|dashboardSizeToken/);
	assert.match(dashboardSizing, /function boundedInteger/);
	assert.match(dashboardSizing, /normalizeDashboardColumnSpan/);
	assert.match(dashboardSizing, /normalizeDashboardRowSpan/);
	assert.match(dashboardSizing, /if \(options\.multiline\) return DASHBOARD_STANDARD_CONTROL_ROW_SPAN/);
	assert.match(dashboardSizing, /export function dashboardCardHeight/);
	assert.match(dashboardSizing, /export function recommendedControlRowSpan/);
	assert.match(dashboardSizing, /export function recommendedGroupRowSpan/);
	assert.doesNotMatch(dashboardSizing, /document|getComputedStyle|ResizeObserver/);
	assert.match(dashboardLayout, /layout\.row \+ layout\.rowSpan/);
	assert.match(dashboardComponents, /function markProjectedAxes/);
	assert.match(theme, /data-dashboard-auto-row-span[^}]*cursor: ew-resize/);
	assert.match(theme, /data-dashboard-auto-column-span[^}]*cursor: ns-resize/);
	assert.match(theme, /data-dashboard-auto-row-span\]\[data-dashboard-auto-column-span[^}]*display: none/);
});

test("dashboard cards expose equal visual gutters without changing fine row geometry", () => {
	assert.match(theme, /--aa-dashboard-card-gap:\s*6px/);
	assert.match(theme, /--aa-dashboard-track-gap:\s*2px/);
	assert.match(theme, /grid-auto-rows:\s*4px/);
	assert.match(theme, /column-gap:\s*var\(--aa-dashboard-card-gap\)/);
	assert.match(theme, /row-gap:\s*var\(--aa-dashboard-track-gap\)/);
	assert.match(theme, /height:\s*calc\(100% - var\(--aa-dashboard-card-gap\) \+ var\(--aa-dashboard-track-gap\)\)/);
	assert.doesNotMatch(theme, /margin-bottom:\s*calc\(var\(--aa-dashboard-card-gap\) - var\(--aa-dashboard-track-gap\)\)/);
});

test("dashboard control contents stay within their declared grid footprints", () => {
	assert.match(theme, /\.aa-control-card-header \{[^}]*min-height:\s*16px;[^}]*line-height:\s*16px;/);
	assert.match(theme, /\.aa-control-card-title \{[^}]*font-size:\s*12px;[^}]*font-weight:\s*650;/);
	assert.match(theme, /\.aa-control-card-title::before \{[^}]*background: var\(--aa-control-kind-tone, transparent\)/);
	assert.match(theme, /\.aa-control-card \{[^}]*--aa-control-kind-tone: var\(--aa-ui-accent\)/);
	for (const kind of ["numeric", "seed", "boolean", "choice", "text", "taglist", "image-choice", "markdown", "image-compare", "image-output", "text-output", "quick-group-manager"]) {
		assert.match(theme, new RegExp(`data-control-kind="${kind}"[^}]*\\{ --aa-control-kind-tone`));
	}
	assert.match(theme, /\.aa-control-card\.is-missing \{ --aa-control-kind-tone: var\(--aa-ui-warning\); \}/);
	assert.match(theme, /\.aa-workspace-control-input \{[^}]*width: 100%;[^}]*margin-top: 5px;[^}]*\}/);
	assert.doesNotMatch(theme, /\.aa-workspace-control-input \{[^}]*opacity:/);
	assert.doesNotMatch(theme, /\.aa-control-card:(?:hover|focus-within) \.aa-workspace-control-input/);
	assert.doesNotMatch(theme, /:has\(\.aa-control-card:hover\).*\.aa-workspace-control-input/);
	assert.match(theme, /\.aa-control-card\[data-control-kind="text"\] > input\.aa-workspace-control-input \{[^}]*min-height:\s*34px;[^}]*padding-block:\s*6px;/);
	assert.match(theme, /\.aa-control-card\[data-control-kind="text"\] > textarea\.aa-workspace-control-input \{[^}]*min-height:\s*58px;[^}]*padding-block:\s*7px;/);
	assert.match(theme, /\.aa-control-card\.has-multiline-control \{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*flex-direction:\s*column;/);
	assert.match(theme, /\.aa-control-card\.has-multiline-control > \.aa-control-card-header \{[^}]*flex:\s*0 0 auto;/);
	assert.match(theme, /\.aa-control-card\.has-multiline-control > \.aa-control-text\.is-multiline \{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*56px;[^}]*height:\s*auto;/);
	assert.match(workspaceComponents, /hasMultilineControl/);
	assert.match(workspaceComponents, /has-multiline-control/);
	assert.match(theme, /\.aa-control-choice-select \.aa-ui-select__native \{[^}]*height:\s*32px;[^}]*min-height:\s*32px;/);
	assert.match(theme, /data-control-kind="taglist"[^}]*aa-taglist-control[^}]*height:\s*32px;[^}]*min-height:\s*32px;/);
	assert.match(workspaceControls, /control\.dataset\.headerOnly = "true"; control\.headerAccessories = \[accessory\];/);
	assert.match(theme, /\.aa-dashboard-group \{[^}]*padding:\s*7px 7px 7px 8px;/);
	assert.match(theme, /\.aa-dashboard-group \{[^}]*border-left:/);
	assert.match(theme, /\.aa-dashboard-group-header \{[^}]*min-height:\s*24px;/);
	assert.doesNotMatch(dashboardComponents, /aa-dashboard-group-count/);
	assert.match(dashboardComponents, /icon\("drag", \{ className: "aa-dashboard-group-grip" \}\)/);
	assert.doesNotMatch(theme, /aa-dashboard-group-count/);
	assert.doesNotMatch(dashboardComponents, /aa-dashboard-group-marker/);
	assert.doesNotMatch(theme, /aa-dashboard-group-marker/);
	assert.match(dashboardComponents, /aa-dashboard-group-header-spacer/);
	assert.match(theme, /\.aa-dashboard-group-header h3 \{[^}]*border-radius:\s*999px;/);
	assert.match(theme, /\.aa-dashboard-group-header h3 \{[^}]*background:\s*color-mix\(in srgb, var\(--aa-dashboard-group-tone\)/);
	assert.match(theme, /\.aa-dashboard-group-header-spacer \{[^}]*flex:\s*1 1 auto;/);
	assert.doesNotMatch(theme, /\.aa-dashboard-group:hover \{[^}]*translateY\(-1px\)/);
	assert.match(theme, /\.aa-dashboard-group-resize-handle/);
	assert.match(dashboardComponents, /data-dashboard-group-resize-handle/);
	assert.match(dashboardInteractions, /onResizeGroup\?\./);
	assert.match(workspace, /onResizeGroup: \(groupId, size\) => updateDashboard/);
	assert.match(theme, /\.aa-control-numeric-value\.is-committed \{ animation: aa-control-commit-flash/);
	assert.match(numericControl, /classList\.add\("is-committed"\)/);
	assert.doesNotMatch(numericControl, /document\.querySelector\(`\[data-aaalice-value-field/);
});
