import { app } from "../../../scripts/app.js";

let runtime = null;
const dashboardScrollPositions = new WeakMap();

export function configureDashboardScroll(dependencies) { runtime = dependencies; }

function captureDashboardPageSnapshot(host) {
	const source = host.querySelector(".aa-dashboard-scroll:not(.is-page-leaving)");
	if (!source) return null;
	const snapshot = source.cloneNode(true);
	const sourceFields = source.querySelectorAll("input, textarea, select");
	const snapshotFields = snapshot.querySelectorAll("input, textarea, select");
	for (let index = 0; index < sourceFields.length; index++) {
		const sourceField = sourceFields[index]; const snapshotField = snapshotFields[index];
		if (!snapshotField) continue;
		if (snapshotField.type !== "file" && "value" in snapshotField) snapshotField.value = sourceField.value;
		if ("checked" in snapshotField) snapshotField.checked = sourceField.checked;
	}
	snapshot.classList.remove("is-page-entering", "is-page-entering-forward", "is-page-entering-backward");
	snapshot.setAttribute("aria-hidden", "true"); snapshot.inert = true;
	snapshot._aaaliceSnapshotScrollTop = source.scrollTop;
	return snapshot;
}

export function captureDashboardPageSnapshots() {
	const snapshots = new WeakMap();
	for (const root of runtime.mounted) {
		if (!runtime.ownsWorkspaceRoot(root) || !runtime.isWorkspaceRootInteractive(root)) continue;
		const snapshot = captureDashboardPageSnapshot(root);
		if (snapshot) snapshots.set(root, snapshot);
	}
	return snapshots;
}

export function setScrollTopImmediately(element, top) {
	const previousBehavior = element.style.scrollBehavior;
	element.style.scrollBehavior = "auto";
	element.scrollTop = Math.max(0, Number(top) || 0);
	element.style.scrollBehavior = previousBehavior;
}

export function dashboardScrollState(root) {
	let state = dashboardScrollPositions.get(root);
	if (!state || state.graph !== app.graph) {
		state = { graph: app.graph, pages: new Map(), searchTop: 0 };
		dashboardScrollPositions.set(root, state);
	}
	return state;
}

export function rememberDashboardScroll(root) {
	const scroll = runtime.workspaceOwnedTrees.get(root)?.querySelector?.(".aa-dashboard-scroll:not(.is-page-leaving)");
	if (!scroll) return;
	const state = dashboardScrollState(root);
	if (scroll.dataset.dashboardSearchOpen === "true") state.searchTop = scroll.scrollTop;
	else if (scroll.dataset.dashboardPageId) state.pages.set(scroll.dataset.dashboardPageId, scroll.scrollTop);
}

export function dashboardScrollTop(root, pageId) { return dashboardScrollState(root).pages.get(pageId) || 0; }
export function deleteDashboardScrollState(root) { dashboardScrollPositions.delete(root); }
export function resetDashboardScrollStates() { for (const root of runtime.mounted) dashboardScrollPositions.delete(root); }
