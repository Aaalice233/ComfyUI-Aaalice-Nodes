/** Plans overrides against the selected base snapshot, never the currently visible sidebar. */
import { bindingKey, controlItemBindings } from "./dashboard_model.js";
import { normalizeDashboardSnapshot } from "./dashboard_presets.js";
import { planDashboardPresetApplication } from "./dashboard_preset_runtime.js";
import { resolveControlBindingSet } from "./control_binding_set.js";
import { matchValueProfileRules } from "./value_profiles.js";
import { quickGroupManagerSnapshot } from "./quick_group_manager_runtime.js";
import { planProfileGroups } from "./value_profile_groups.js";

export function collectValueProfileCandidates(model, resolve, controlTitle) {
	const seen = new Map();
	for (const page of model.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		const key = bindingKey(item.binding);
		if (seen.has(key)) continue;
		let resolved;
		try { resolved = resolve(item.binding) || { status: "missing" }; }
		catch (error) { resolved = { status: "error", error }; }
		seen.set(key, { item, binding: item.binding, key, valueType: item.binding.valueType,
			label: controlTitle(item, resolved), hostLabel: String(resolved?.node?.getTitle?.() || resolved?.node?.title || ""),
			pageName: page.name, resolved });
	}
	return [...seen.values()];
}

function cardSnapshot(item, values) {
	return { dashboard: { version: 4, pages: [{ id: "override", name: "", gridColumns: 12, groups: [], items: [{ ...item, groupId: null }] }] }, values };
}

export function planValueProfileCopy(base, rules, resolve, controlTitle) {
	const snapshot = normalizeDashboardSnapshot(base);
	const resolver = resolve; const resolvedBindings = new Map();
	resolve = (binding) => {
		const key = bindingKey(binding);
		if (!resolvedBindings.has(key)) {
			try { resolvedBindings.set(key, resolver(binding)); }
			catch (error) { resolvedBindings.set(key, { status: "error", error }); }
		}
		return resolvedBindings.get(key);
	};
	const candidates = collectValueProfileCandidates(snapshot.dashboard, resolve, controlTitle);
	const matches = matchValueProfileRules(rules, candidates);
	const targetKeys = new Set(candidates.flatMap(({ item }) => controlItemBindings(item).map(bindingKey)));
	for (const key of Object.keys(snapshot.values)) if (!targetKeys.has(key)) delete snapshot.values[key];
	for (const match of matches) {
		if (match.status !== "ready") continue;
		const item = match.candidate.item;
		const resolved = resolveControlBindingSet(item, resolve);
		if (resolved.status !== "ok" || resolved.bindingSet.issues.length || (resolved.availability?.state && resolved.availability.state !== "ready")) {
			match.status = resolved.status === "ok" ? "unavailable" : resolved.status;
			continue;
		}
		let payload = match.rule.payload;
		if (resolved.kind === "quick-group-manager") {
			try {
				const manager = quickGroupManagerSnapshot(resolved.node);
				const groupPlan = planProfileGroups(payload, manager.groups, snapshot.values[match.candidate.key]?.payload, manager.visibleGroups);
				match.groupIssues = groupPlan.matches.filter((group) => group.status !== "ready").map((group) => ({ title: group.saved.title || group.saved.id, status: group.status }));
				if (!groupPlan.applied) { match.status = "invalid"; match.reason = "no-matching-groups"; continue; }
				payload = groupPlan.payload;
			} catch (error) { match.status = "invalid"; match.reason = error.message; continue; }
		}
		const values = Object.fromEntries(controlItemBindings(item).map((binding) => [bindingKey(binding), { valueType: match.rule.valueType, payload: structuredClone(payload) }]));
		const plan = planDashboardPresetApplication(cardSnapshot(item, values), resolve);
		// Unlike sidebar switching, overrides must not force a missing/ambiguous model into a valid workflow.
		if (plan.entries.some((entry) => !["ready", "model-path-match"].includes(entry.status))) {
			match.status = "invalid";
			match.reason = plan.issues[0]?.reason;
			continue;
		}
		match.values = Object.fromEntries(plan.ready.map((entry) => [entry.key, entry.saved]));
	}
	// Different cards can share linked targets. Conflicting rules are all skipped, regardless of order.
	const owners = new Map();
	for (const match of matches) if (match.status === "ready") for (const [key, value] of Object.entries(match.values)) {
		const entries = owners.get(key) || [];
		entries.push({ match, value }); owners.set(key, entries);
	}
	for (const entries of owners.values()) if (entries.some(({ value }) => JSON.stringify(value) !== JSON.stringify(entries[0].value))) {
		for (const { match } of entries) match.status = "ambiguous";
	}
	for (const match of matches) if (match.status === "ready") Object.assign(snapshot.values, match.values);
	const application = planDashboardPresetApplication(snapshot, resolve);
	// An unavailable member blocks the whole card, including restoration of the base values.
	const blocked = new Set();
	for (const candidate of candidates) {
		const resolved = resolveControlBindingSet(candidate.item, resolve);
		const keys = controlItemBindings(candidate.item).map(bindingKey);
		if (resolved.status !== "ok" || resolved.bindingSet.issues.length
			|| application.entries.some((entry) => keys.includes(entry.key) && !["ready", "model-path-match", "layout-only"].includes(entry.status))) keys.forEach((key) => blocked.add(key));
	}
	// A shared target cannot let a blocked card be partially written by a neighboring card.
	let expanded = true;
	while (expanded) {
		expanded = false;
		for (const { item } of candidates) {
			const keys = controlItemBindings(item).map(bindingKey);
			if (!keys.some((key) => blocked.has(key))) continue;
			for (const key of keys) if (!blocked.has(key)) { blocked.add(key); expanded = true; }
		}
	}
	application.ready = application.ready.filter((entry) => !blocked.has(entry.key));
	for (const key of blocked) {
		if (Object.hasOwn(base.values || {}, key)) snapshot.values[key] = structuredClone(base.values[key]);
		else delete snapshot.values[key];
	}
	for (const match of matches) if (match.status === "ready" && Object.keys(match.values).some((key) => blocked.has(key))) match.status = "unavailable";
	const applied = matches.filter((match) => match.status === "ready").length;
	return { snapshot, application, matches, applied, skipped: matches.length - applied };
}
