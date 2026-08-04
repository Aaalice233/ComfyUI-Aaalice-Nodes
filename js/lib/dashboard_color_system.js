/** Shared Dashboard tone palette, validation, persistence codec, and CSS value resolver. */

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const DASHBOARD_TONES = Object.freeze([
	"neutral", "slate", "blue", "sky", "cyan", "teal", "green", "lime", "yellow",
	"amber", "orange", "red", "rose", "pink", "purple", "violet", "indigo",
]);

// Kept as a domain alias for group APIs while all Dashboard surfaces share one palette.
export const DASHBOARD_GROUP_TONES = DASHBOARD_TONES;

const DASHBOARD_TONE_CSS_VALUES = Object.freeze({
	neutral: "var(--aa-ui-muted)",
	slate: "var(--p-slate-400, var(--aa-ui-muted))",
	blue: "var(--p-blue-400, var(--aa-ui-accent))",
	sky: "var(--p-sky-400, var(--p-blue-300, var(--aa-ui-accent)))",
	cyan: "var(--p-cyan-400, var(--aa-ui-accent))",
	teal: "var(--p-teal-400, var(--p-green-400, var(--aa-ui-accent)))",
	green: "var(--p-green-400, #62b881)",
	lime: "var(--p-lime-400, var(--p-green-300, #8ccf62))",
	yellow: "var(--p-yellow-400, var(--aa-ui-warning))",
	amber: "var(--p-amber-400, var(--aa-ui-warning))",
	orange: "var(--p-orange-400, var(--p-amber-400, var(--aa-ui-warning)))",
	red: "var(--p-red-400, var(--aa-ui-danger))",
	rose: "var(--p-rose-400, var(--p-red-300, var(--aa-ui-danger)))",
	pink: "var(--p-pink-400, var(--p-rose-400, var(--aa-ui-danger)))",
	purple: "var(--p-purple-400, #9b85d8)",
	violet: "var(--p-violet-400, var(--p-purple-400, #9b85d8))",
	indigo: "var(--p-indigo-400, var(--p-blue-400, var(--aa-ui-accent)))",
});

export function normalizeHexColor(value) {
	if (typeof value !== "string") return null;
	const candidate = value.trim().toLowerCase();
	if (!HEX_COLOR_PATTERN.test(candidate)) return null;
	if (candidate.length === 4) return `#${[...candidate.slice(1)].map((digit) => `${digit}${digit}`).join("")}`;
	return candidate;
}

export function isCustomDashboardTone(value) { return Boolean(normalizeHexColor(value)); }

export function normalizeDashboardTone(value) {
	if (DASHBOARD_TONES.includes(value)) return value;
	return normalizeHexColor(value) || "neutral";
}

export function dashboardToneClass(value) {
	const tone = normalizeDashboardTone(value);
	return isCustomDashboardTone(tone) ? "custom" : tone;
}

export function dashboardToneCssValue(value) {
	const tone = normalizeDashboardTone(value);
	return isCustomDashboardTone(tone) ? tone : DASHBOARD_TONE_CSS_VALUES[tone] || DASHBOARD_TONE_CSS_VALUES.neutral;
}

// Domain aliases keep the existing group model readable without duplicating the codec.
export const isCustomGroupTone = isCustomDashboardTone;
export const normalizeGroupTone = normalizeDashboardTone;
export const groupToneClass = dashboardToneClass;
export const groupToneCssValue = dashboardToneCssValue;
