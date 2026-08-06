/** Shared prompt-entry copy action: clipboard write plus consistent feedback. */

// 复制成功时给按钮一个短暂确认动画；重复点击会先移除类再强制重排重播。
export function flashCopied(control) {
	if (typeof Element === "undefined" || !(control instanceof Element)) return;
	control.classList.remove("is-copy-acknowledged");
	void control.offsetWidth;
	control.classList.add("is-copy-acknowledged");
}

export async function copyEntryPromptText({ text, title, app, copiedLabel, failedLabel = null }) {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
		} else {
			const input = document.createElement("textarea");
			input.value = text;
			input.setAttribute("readonly", "");
			input.style.position = "fixed";
			input.style.opacity = "0";
			document.body.append(input);
			input.select();
			const copied = document.execCommand("copy");
			input.remove();
			if (!copied) throw new Error(failedLabel || "The clipboard rejected the copy operation.");
		}
		app.extensionManager?.toast?.add?.({ severity: "success", summary: title, detail: copiedLabel, life: 3200 });
		return true;
	} catch (error) {
		app.extensionManager?.toast?.add?.({ severity: "error", summary: title, detail: error.message || String(error), life: 5000 });
		return false;
	}
}
