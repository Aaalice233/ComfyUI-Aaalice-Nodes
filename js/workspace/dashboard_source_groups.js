import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { controlProviders } from "../lib/control_providers.js";
import { syncSourceGroup } from "../lib/dashboard_commands.js";
import { SOURCE_SYNC_STATUS, buildSourceSnapshot, inspectSourceGroup } from "../lib/dashboard_source_sync.js";

let runtime = null;
const sourceSyncLocks = new Set();

export function configureDashboardSourceGroups(dependencies) { runtime = dependencies; }

const scheduleStructuralRender = (view = null) => runtime.scheduleStructuralRender(view);

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

export function sourceGroupIdentity(sourceGroup) {
	const source = sourceGroup?.source;
	if (!source?.provider || !source?.hostId) return null;
	return `${source.provider}\u0000${source.hostId}\u0000${source.scopeId || ""}`;
}

function sourceGroupLockKey(pageId, groupId) { return `${pageId}\u0000${groupId}`; }

function inspectDashboardSourceGroup(group, page, nodes = runtime.graphNodes()) {
	if (!group?.source) return { snapshot: { status: SOURCE_SYNC_STATUS.ERROR, controls: [], reason: "Group source is missing" }, status: SOURCE_SYNC_STATUS.ERROR, summary: null };
	const sourceResult = controlProviders.sourceSnapshot(group.source, nodes);
	const snapshot = buildSourceSnapshot(sourceResult.controls, group.source, { status: sourceResult.status, label: sourceResult.label, reason: sourceResult.reason });
	const inspection = inspectSourceGroup(group, page?.items.filter((item) => item.groupId === group.id) || [], snapshot);
	return { snapshot, status: inspection.status, summary: inspection, reason: inspection.reason || snapshot.reason || "" };
}

export function sourceGroupViewState(page, group, nodes = runtime.graphNodes()) {
	const lockKey = sourceGroupLockKey(page.id, group.id);
	if (sourceSyncLocks.has(page.id) || sourceSyncLocks.has(lockKey)) return { status: "syncing", summary: null, snapshot: null, reason: "" };
	return inspectDashboardSourceGroup(group, page, nodes);
}

function sourceSyncSummaryDetail(summary) {
	const parts = [];
	if (summary.added) parts.push(message("aaalice.workspace.group.sync.added", "{count} added", { count: summary.added }));
	if (summary.removed) parts.push(message("aaalice.workspace.group.sync.removed", "{count} removed", { count: summary.removed }));
	if (summary.renamed) parts.push(message("aaalice.workspace.group.sync.renamed", "{count} renamed", { count: summary.renamed }));
	if (summary.reordered) parts.push(t("aaalice.workspace.group.sync.reordered", "order updated"));
	if (summary.updated) parts.push(message("aaalice.workspace.group.sync.updated", "{count} types updated", { count: summary.updated }));
	if (summary.preservedManual) parts.push(message("aaalice.workspace.group.sync.preservedManual", "{count} manual cards preserved", { count: summary.preservedManual }));
	return parts.join(" · ") || t("aaalice.workspace.group.sync.noChanges", "No changes were needed.");
}

function notifySourceSyncFailure(reason) {
	app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.group.sync.failed", "Source group synchronization failed"), detail: String(reason || t("aaalice.workspace.group.sync.unknownError", "The source could not be synchronized.")), life: 5200 });
}

export function syncDashboardSourceGroup(pageId, groupId, { notify = true } = {}) {
	const lockKey = sourceGroupLockKey(pageId, groupId);
	if (sourceSyncLocks.has(pageId) || sourceSyncLocks.has(lockKey)) return { status: "skipped" };
	sourceSyncLocks.add(lockKey); scheduleStructuralRender("dashboard");
	try {
		const model = runtime.dashboard(); const page = model.pages.find((entry) => entry.id === pageId); const group = page?.groups.find((entry) => entry.id === groupId);
		if (!page || !group?.source) return { status: "skipped" };
		const info = inspectDashboardSourceGroup(group, page);
		if (info.status === SOURCE_SYNC_STATUS.SYNCED) return { status: "synced", summary: info.summary };
		if (info.status !== SOURCE_SYNC_STATUS.NEEDS_SYNC) {
			if (notify) notifySourceSyncFailure(info.reason || t("aaalice.workspace.group.sync.unavailable", "The source is unavailable."));
			return { status: "failed", reason: info.reason };
		}
		const result = syncSourceGroup(model, pageId, groupId, info.snapshot);
		runtime.updateDashboard(() => result.next);
		if (notify) app.extensionManager?.toast?.add?.({ severity: "success", summary: t("aaalice.workspace.group.sync.complete", "Source group synchronized"), detail: sourceSyncSummaryDetail(result.summary), life: 4200 });
		return { status: "synced", summary: result.summary };
	} catch (error) {
		if (notify) notifySourceSyncFailure(error?.message || error);
		return { status: "failed", reason: error?.message || String(error) };
	} finally {
		sourceSyncLocks.delete(lockKey); scheduleStructuralRender("dashboard");
	}
}

export function syncCurrentPageSourceGroups(pageId) {
	if (sourceSyncLocks.has(pageId)) return;
	const model = runtime.dashboard(); const page = model.pages.find((entry) => entry.id === pageId);
	const groups = page?.groups.filter((group) => group.source).sort((left, right) => left.id.localeCompare(right.id)) || [];
	if (!groups.length) {
		app.extensionManager?.toast?.add?.({ severity: "info", summary: t("aaalice.workspace.group.sync.title", "Source groups"), detail: t("aaalice.workspace.group.sync.none", "This page has no source groups to synchronize."), life: 3200 });
		return;
	}
	sourceSyncLocks.add(pageId); scheduleStructuralRender("dashboard");
	let next = model; let changed = false; let synced = 0; let skipped = 0; let failed = 0; const failureReasons = []; const totals = { added: 0, removed: 0, renamed: 0, reordered: 0, updated: 0, preservedManual: 0 };
	try {
		for (const group of groups) {
			const currentPage = next.pages.find((entry) => entry.id === pageId); const currentGroup = currentPage?.groups.find((entry) => entry.id === group.id);
			if (!currentPage || !currentGroup) { skipped++; continue; }
			const info = inspectDashboardSourceGroup(currentGroup, currentPage);
			if (info.status === SOURCE_SYNC_STATUS.SYNCED) { skipped++; continue; }
			if (info.status !== SOURCE_SYNC_STATUS.NEEDS_SYNC) { failed++; if (info.reason) failureReasons.push(info.reason); continue; }
			try {
				const result = syncSourceGroup(next, pageId, group.id, info.snapshot); next = result.next; changed = true; synced++;
				for (const key of Object.keys(totals)) totals[key] += result.summary[key] || 0;
			} catch (error) { failed++; failureReasons.push(error?.message || String(error)); }
		}
		if (changed) runtime.updateDashboard(() => next);
		const failureDetail = failureReasons.length ? ` · ${failureReasons[0]}` : "";
		app.extensionManager?.toast?.add?.({ severity: failed ? "warn" : "success", summary: t("aaalice.workspace.group.sync.pageComplete", "Current page source groups"), detail: message("aaalice.workspace.group.sync.pageSummary", "{synced} synchronized · {skipped} unchanged · {failed} failed", { synced, skipped, failed }) + (changed ? ` · ${sourceSyncSummaryDetail(totals)}` : "") + failureDetail, life: 5200 });
	} finally {
		sourceSyncLocks.delete(pageId); scheduleStructuralRender("dashboard");
	}
}
