/** Long-prompt attachment preference and target recommendation UI. */
import { createTooltip, el, icon, toggleSwitch } from "./ui.js";

export function createLongPromptFileControl(initialValue, onChange, { label }) {
	let enabled = Boolean(initialValue);
	let recommended = false;
	const tooltip = createTooltip({ delay: 140 });
	const notice = el("div", {
		className: "aa-discord-share-prompt-file-notice",
		attrs: { role: "status" },
		children: [
			el("span", { className: "aa-discord-share-prompt-file-notice__icon", children: [icon("info")] }),
			el("span", null, label("promptFile.channelRecommendation", "To avoid flooding the chat, long prompts are recommended as files for this channel. Regular prompts are unaffected.")),
		],
	});
	const syncNotice = () => { notice.hidden = !recommended; };
	const setChecked = (next, { emit = true } = {}) => {
		enabled = Boolean(next);
		toggle.setChecked(enabled);
		if (emit) onChange?.(enabled);
	};
	const toggle = toggleSwitch({
		checked: enabled,
		label: label("promptFile.label", "Send long prompts as a file"),
		className: "aa-discord-share-prompt-file-toggle",
		onChange: (next) => setChecked(next),
	});
	const option = el("div", {
		className: "aa-discord-share-prompt-file-option",
		children: [
			el("div", { className: "aa-discord-share-prompt-file-option__copy", children: [
				el("span", { className: "aa-discord-share-prompt-file-option__icon", children: [icon("fileText")] }),
				el("strong", null, label("promptFile.label", "Send long prompts as a file")),
			] }),
			toggle,
		],
	});
	const tooltipContent = () => el("div", {
		className: "aa-discord-share-prompt-file-tooltip",
		children: [
			el("strong", null, label("promptFile.tooltipTitle", "Why send long prompts as files?")),
			el("span", null, label("promptFile.limits", "Discord allows up to 4,096 characters in one embed description and 6,000 embed text characters in one message.")),
			el("span", null, label("promptFile.recommended", "When enabled, prompts longer than 1,500 characters become a TXT attachment. When disabled, long prompts are split into consecutive messages with the image in the final message.")),
		],
	});
	const showTooltip = () => tooltip.show(toggle, tooltipContent, { className: "aa-discord-share-prompt-file-help" });
	option.addEventListener("mouseenter", showTooltip);
	option.addEventListener("mouseleave", tooltip.hide);
	toggle.addEventListener("focus", showTooltip);
	toggle.addEventListener("blur", tooltip.hide);
	const root = el("div", { className: "aa-discord-share-prompt-file", children: [notice, option] });
	syncNotice();
	return {
		root,
		value: () => enabled,
		setChecked,
		setRecommended: (next) => {
			recommended = Boolean(next);
			syncNotice();
		},
		destroy: () => tooltip.destroy(),
	};
}
