import { t } from "../i18n.js";
import { el, toggleSwitch } from "./ui.js";
import { quickGroupManagerSnapshot } from "./quick_group_manager_runtime.js";
import { planProfileGroups, setProfileGroupEnabled } from "./value_profile_groups.js";

export function createProfileGroupEditor(resolved, draft, onError) {
	const root = el("div", "aa-profile-group-editor aa-quick-group-control__list");
	const rows = new Map();
	const issues = el("details", "aa-profile-editor__advanced");
	const update = () => {
		const payload = draft.getValue();
		const snapshot = quickGroupManagerSnapshot(resolved.node);
		const plan = planProfileGroups(payload, snapshot.groups, null, snapshot.visibleGroups);
		const visibleIds = new Set(snapshot.visibleGroups.map((group) => String(group.id)));
		const matches = snapshot.visibleGroups.flatMap((group) => plan.matches.filter((match) => String(match.group?.id) === String(group.id)));
		const keys = new Set(matches.map((match) => String(match.saved.id)));
		for (const [key, row] of rows) if (!keys.has(key)) { row.element.remove(); rows.delete(key); }
		for (const match of matches) {
			const key = String(match.saved.id);
			let row = rows.get(key);
			if (!row) {
				const name = el("strong"); const status = el("span", "aa-profile-group-editor__status");
				const toggle = toggleSwitch({ checked: false, label: key, onChange: (enabled) => {
					try { draft.commit(setProfileGroupEnabled(draft.getValue(), row.match.saved.id, row.match.group, enabled)); }
					catch (error) { onError(error); update(); }
				} });
				const element = el("div", { className: "aa-quick-group-control__row", children: [el("div", { className: "aa-quick-group-control__copy", children: [name, status] }), toggle] });
				row = { element, name, status, toggle }; rows.set(key, row); root.append(element);
			}
			row.match = match;
			root.append(row.element);
			const title = match.group?.title || match.saved.title || `#${key}`;
			const values = match.saved.nodes.map((member) => payload.version === 1 ? Number(member.mode) === 0 : member.enabled);
			const enabled = match.saved.enabled ?? (values.length > 0 && values.every(Boolean));
			const mixed = match.saved.enabled == null && values.some(Boolean) && !values.every(Boolean);
			row.name.textContent = title; row.toggle.setLabel(title); row.toggle.setChecked(enabled);
			row.toggle.setAttribute("aria-checked", mixed ? "mixed" : String(enabled));
			row.element.classList.toggle("is-enabled", enabled); row.element.classList.toggle("is-mixed", mixed);
			row.status.hidden = match.status === "ready";
			row.status.textContent = t(`aaalice.workspace.valueProfiles.editor.groupStatus.${match.status}`, match.status);
		}
		const excluded = plan.matches.filter((match) => !visibleIds.has(String(match.group?.id)));
		issues.replaceChildren(el("summary", null, t("aaalice.workspace.valueProfiles.editor.excludedGroups", "{count} groups not on this manager").replace("{count}", String(excluded.length))),
			...excluded.map((match) => el("div", { className: "aa-profile-group-editor__status", text: `${match.saved.title || `#${match.saved.id}`}: ${t(`aaalice.workspace.valueProfiles.editor.groupStatus.${match.status}`, match.status)}` })));
		issues.hidden = !excluded.length; root.append(issues);
	};
	update();
	const unsubscribe = draft.subscribe(update);
	return { root, update, destroy: unsubscribe };
}
