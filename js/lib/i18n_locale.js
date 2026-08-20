export function resolveLocale(raw) {
	if (typeof raw !== "string" || !raw) return "en";
	const locale = raw.toLowerCase().replace(/_/g, "-");
	const matches = (tag) => locale === tag || locale.startsWith(`${tag}-`);
	if (["zh-tw", "zh-hant", "zh-hk", "zh-mo"].some(matches)) return "zh-TW";
	if (["zh", "zh-cn", "zh-hans"].some(matches)) return "zh";
	if (matches("en")) return "en";
	return "en";
}

export function localeFallbackChain(locale) {
	if (locale === "zh-TW") return ["zh-TW", "zh", "en"];
	if (locale === "zh") return ["zh", "en"];
	return ["en"];
}
