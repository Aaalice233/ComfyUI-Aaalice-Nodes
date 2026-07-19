import { createContextMenu, el, iconButton } from "../ui.js";

function message(labels, key, fallback, values = {}) {
	let value = labels?.[key] || fallback;
	for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`, String(replacement));
	return value;
}

export function createTagPillList({ tokens = [], editable = false, allowAdd = false, category = "", ariaLabel = "", emptyText = "", addPlaceholder = "", contextMenuItems = null, onSearchTag = null, searchDisabled = false, onMutate = null, labels = {} } = {}) {
	let items = tokens.map((token) => ({ ...token }));
	const root = el("div", {
		className: `aa-ui-tag-pills aa-gallery-tag-pills${editable ? " is-editable" : " is-readonly"}`,
		attrs: { role: "list", "aria-label": ariaLabel },
	});
	const render = () => {
		root.replaceChildren();
		if (!items.length && !allowAdd) {
			root.append(el("p", { className: "aa-ui-tag-pills__empty aa-gallery-tag-pills__empty", text: emptyText }));
			return;
		}
		for (const token of items) {
			const content = el("span", { className: "aa-ui-tag-pill__content aa-gallery-tag-pill__content", children: [
				el("span", { className: "aa-ui-tag-pill__primary aa-gallery-tag-pill__primary", text: token.text }),
				...(token.secondary ? [el("span", { className: "aa-ui-tag-pill__secondary aa-gallery-tag-pill__secondary", text: token.secondary })] : []),
			] });
			const hasContextMenu = editable || typeof contextMenuItems === "function";
			const pill = el("div", {
				className: `aa-ui-tag-pill aa-gallery-tag-pill${hasContextMenu ? " has-context-menu" : ""}`,
				attrs: {
					role: "listitem",
					"data-category": token.category,
					...(hasContextMenu ? { tabindex: "0", title: message(labels, "menuHint", "Right-click for tag actions", { tag: token.raw }) } : {}),
					...(editable ? {
						title: message(labels, "editableMenuHint", "Click to edit · Right-click for tag actions · {tag}", { tag: token.raw }),
						"aria-label": message(labels, "editableMenuHint", "Click to edit · Right-click for tag actions · {tag}", { tag: token.raw }),
					} : {}),
				},
				children: [content],
			});
			const applyMutation = (mutation) => {
				const next = onMutate?.(mutation);
				if (!Array.isArray(next)) return false;
				items = next.map((item) => ({ ...item }));
				render();
				return true;
			};
			const beginEdit = () => {
				if ((!editable && typeof onMutate !== "function") || pill.classList.contains("is-editing")) return;
				pill.classList.add("is-editing");
				const input = document.createElement("input");
				input.type = "text";
				input.className = "aa-ui-tag-pill__input aa-gallery-tag-pill__input";
				input.value = token.raw;
				input.spellcheck = false;
				input.autocomplete = "off";
				input.setAttribute("aria-label", message(labels, "editValue", "Edit tag value"));
				let composing = false;
				let settled = false;
				const cancel = () => { if (settled) return; settled = true; pill.classList.remove("is-editing"); input.replaceWith(content); pill.focus({ preventScroll: true }); };
				const commit = () => {
					if (settled || composing) return;
					const value = input.value.trim();
					if (!value) { input.setAttribute("aria-invalid", "true"); input.focus({ preventScroll: true }); return; }
					settled = true;
					if (!applyMutation({ type: "rename", category: token.category, raw: token.raw, value })) {
						settled = false;
						input.setAttribute("aria-invalid", "true");
					}
				};
				input.addEventListener("compositionstart", () => { composing = true; });
				input.addEventListener("compositionend", () => { composing = false; });
				input.addEventListener("keydown", (event) => {
					if (event.key === "Escape") { event.preventDefault(); cancel(); }
					else if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); commit(); }
				});
				input.addEventListener("blur", commit);
				content.replaceWith(input);
				input.focus({ preventScroll: true });
				input.select();
			};
			const openMenu = (x, y) => {
				const defaults = editable ? [
					{ label: message(labels, "edit", "Edit tag"), iconName: "edit", onSelect: beginEdit },
					...(onSearchTag ? [{ label: message(labels, "addToSearch", "Add to search"), iconName: "search", disabled: searchDisabled, onSelect: () => onSearchTag(token.raw) }] : []),
					{ label: message(labels, "remove", "Remove {tag}", { tag: token.raw }), iconName: "delete", danger: true, onSelect: () => applyMutation({ type: "remove", category: token.category, raw: token.raw }) },
				] : [];
				const actions = contextMenuItems?.(token, { edit: beginEdit, applyMutation }) || defaults;
				if (!actions.length) return;
				createContextMenu({ x, y, ariaLabel: message(labels, "menu", "Tag actions"), items: actions });
			};
			if (editable) pill.addEventListener("click", beginEdit);
			if (hasContextMenu) {
				pill.addEventListener("contextmenu", (event) => { event.preventDefault(); openMenu(event.clientX, event.clientY); });
				pill.addEventListener("keydown", (event) => {
					if (editable && event.key === "Enter") { event.preventDefault(); beginEdit(); return; }
					if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
					event.preventDefault(); const rect = pill.getBoundingClientRect(); openMenu(rect.left + 10, rect.bottom + 4);
				});
			}
			root.append(pill);
		}
		if (editable && allowAdd) {
			const add = iconButton({
				className: "aa-ui-tag-pills__add-trigger aa-gallery-tag-pills__add-trigger",
				iconName: "add",
				label: addPlaceholder,
				variant: "ghost",
				onClick: () => {
					const input = document.createElement("input");
					input.type = "text";
					input.className = "aa-ui-tag-pills__add aa-gallery-tag-pills__add";
					input.placeholder = addPlaceholder;
					input.autocomplete = "off";
					input.spellcheck = false;
					input.setAttribute("aria-label", addPlaceholder);
					input.addEventListener("keydown", (event) => {
						if (event.key === "Escape") { event.preventDefault(); render(); return; }
						if (event.key !== "Enter" || event.isComposing) return;
						event.preventDefault();
						const additions = [...new Set(input.value.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))];
						if (!additions.length) return;
						const next = onMutate?.({ type: "add", category, values: additions });
						if (!Array.isArray(next)) return;
						items = next.map((item) => ({ ...item }));
						render();
					});
					input.addEventListener("blur", () => { if (!input.value.trim()) render(); });
					add.replaceWith(input);
					input.focus({ preventScroll: true });
				},
			});
			root.append(add);
		}
	};
	root.setTokens = (next) => { items = next.map((token) => ({ ...token })); render(); };
	root.value = () => items.map((token) => ({ ...token }));
	render();
	return root;
}
