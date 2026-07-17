/** Pure workflow-owned dashboard layout model. */

export const DASHBOARD_VERSION = 1;

export function stableId(prefix) {
	return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
}

export function emptyDashboard() { return { version: DASHBOARD_VERSION, pages: [] }; }

function normalizeBinding(binding) {
	if (!binding || typeof binding !== "object") return null;
	for (const field of ["provider", "hostId", "controlId", "valueType"]) if (typeof binding[field] !== "string" || !binding[field]) return null;
	return { provider: binding.provider, hostId: binding.hostId, controlId: binding.controlId, valueType: binding.valueType };
}

export function normalizeDashboard(raw) {
	const result = emptyDashboard();
	for (const sourcePage of Array.isArray(raw?.pages) ? raw.pages : []) {
		const page = { id: sourcePage?.id || stableId("page"), name: String(sourcePage?.name || "Page"), sections: [] };
		for (const sourceSection of Array.isArray(sourcePage?.sections) ? sourcePage.sections : []) {
			const section = { id: sourceSection?.id || stableId("section"), title: String(sourceSection?.title || "Section"), collapsed: Boolean(sourceSection?.collapsed), items: [] };
			for (const sourceItem of Array.isArray(sourceSection?.items) ? sourceSection.items : []) {
				const kind = ["control", "separator", "spacer"].includes(sourceItem?.kind) ? sourceItem.kind : "control";
				const binding = kind === "control" ? normalizeBinding(sourceItem.binding) : null;
				if (kind === "control" && !binding) continue;
				section.items.push({ id: sourceItem?.id || stableId("item"), kind, binding, label: String(sourceItem?.label || ""), span: sourceItem?.span === 2 ? 2 : 1, compact: Boolean(sourceItem?.compact) });
			}
			page.sections.push(section);
		}
		result.pages.push(page);
	}
	return result;
}

export function createPage(name = "Page") { return { id: stableId("page"), name, sections: [] }; }
export function createSection(title = "Section") { return { id: stableId("section"), title, collapsed: false, items: [] }; }
export function createControlItem(binding, label = "") { return { id: stableId("item"), kind: "control", binding: normalizeBinding(binding), label, span: 1, compact: false }; }

export function findSection(model, pageId, sectionId) {
	const page = model.pages.find((item) => item.id === pageId);
	return { page, section: page?.sections.find((item) => item.id === sectionId) };
}

export function addControls(model, pageId, sectionId, controls) {
	const next = normalizeDashboard(model);
	const { section } = findSection(next, pageId, sectionId);
	if (!section) throw new Error("Dashboard target section is missing");
	for (const control of controls) section.items.push(createControlItem(control.binding, control.label));
	return next;
}

export function moveItem(model, itemId, targetPageId, targetSectionId, targetIndex) {
	const next = normalizeDashboard(model);
	let item = null;
	for (const page of next.pages) for (const section of page.sections) {
		const index = section.items.findIndex((entry) => entry.id === itemId);
		if (index >= 0) [item] = section.items.splice(index, 1);
	}
	const { section } = findSection(next, targetPageId, targetSectionId);
	if (!item || !section) return next;
	const index = Number.isInteger(targetIndex) ? targetIndex : section.items.length;
	section.items.splice(Math.max(0, Math.min(section.items.length, index)), 0, item);
	return next;
}

export function bindingKey(binding) { return `${binding.provider}:${binding.hostId}:${binding.controlId}`; }

export function exportDashboardPreset(model, resolveValue) {
	const dashboard = normalizeDashboard(model);
	const values = {};
	for (const page of dashboard.pages) for (const section of page.sections) for (const item of section.items) {
		if (item.kind !== "control") continue;
		const resolved = resolveValue?.(item.binding);
		if (resolved?.status === "ok") values[bindingKey(item.binding)] = { valueType: item.binding.valueType, value: resolved.value };
	}
	return { format: "aaalice-dashboard-preset", version: DASHBOARD_VERSION, dashboard, values };
}

export function preflightDashboardPreset(preset, resolveBinding) {
	if (preset?.format !== "aaalice-dashboard-preset" || preset?.version !== DASHBOARD_VERSION) throw new Error("Unsupported dashboard preset");
	const dashboard = normalizeDashboard(preset.dashboard);
	const bindings = [];
	for (const page of dashboard.pages) for (const section of page.sections) for (const item of section.items) {
		if (item.kind !== "control") continue;
		const resolved = resolveBinding(item.binding);
		const saved = preset.values?.[bindingKey(item.binding)];
		let status = resolved?.status || "missing";
		if (status === "ok" && saved && saved.valueType !== item.binding.valueType) status = "incompatible";
		bindings.push({ itemId: item.id, binding: item.binding, status, saved });
	}
	return { dashboard, bindings };
}
