import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { DASHBOARD_TONES } from "../lib/dashboard_model.js";

export function workspaceLabels() {
	return {
		pages: t("aaalice.workspace.page.pages", "Dashboard pages"), reorderPage: t("aaalice.workspace.page.reorder", "Drag to reorder pages"), duplicatePage: t("aaalice.workspace.page.duplicate", "Duplicate page"),
		switchPage: t("aaalice.workspace.page.switch", "Switch page"),
		pageTone: t("aaalice.workspace.page.tone", "Page color"), toneDefault: t("aaalice.workspace.page.toneDefault", "Default"),
		tones: Object.fromEntries(DASHBOARD_TONES.map((value) => [value, t(`aaalice.workspace.group.tones.${value}`, value)])),
		renamePage: t("aaalice.workspace.page.rename", "Rename page"), deletePage: t("aaalice.workspace.page.delete", "Delete page"),
		groupMenu: t("aaalice.workspace.group.menu", "Layout group menu"),
		groupSync: {
			synced: t("aaalice.workspace.group.sync.synced", "Synchronized"),
			needsSync: t("aaalice.workspace.group.sync.needsSync", "Group changes pending; synchronize from source"),
			syncing: t("aaalice.workspace.group.sync.syncing", "Synchronizing source group"),
			missingSource: t("aaalice.workspace.group.sync.missingSource", "Source is unavailable"),
			error: t("aaalice.workspace.group.sync.error", "Source description is invalid"),
		},
		renameHint: t("aaalice.workspace.renameHint", "Double-click to rename"),
		resizeCard: t("aaalice.workspace.card.resize", "Resize card; arrow keys adjust by one grid unit"),
		resizeGroup: t("aaalice.workspace.group.resize", "Resize layout group; left and right arrows adjust width"),
		seedMode: {
			header: t("aaalice.pcp.seedMode.header", "After each workflow run, update the seed using:"),
			fixed: { label: t("aaalice.pcp.seedMode.fixed", "Fixed value"), description: t("aaalice.pcp.seedMode.fixedDescription", "Keep the current seed unchanged") },
			increment: { label: t("aaalice.pcp.seedMode.increment", "Increment"), description: t("aaalice.pcp.seedMode.incrementDescription", "Add 1 after each workflow run") },
			decrement: { label: t("aaalice.pcp.seedMode.decrement", "Decrement"), description: t("aaalice.pcp.seedMode.decrementDescription", "Subtract 1 after each workflow run") },
			randomize: { label: t("aaalice.pcp.seedMode.randomize", "Randomize"), description: t("aaalice.pcp.seedMode.randomizeDescription", "Choose a new random seed after each workflow run") },
		},
			imageNone: t("aaalice.pcp.image.none", "Choose image"), imageUpload: t("aaalice.pcp.image.upload", "Upload from device"), imageDrop: t("aaalice.pcp.image.drop", "Drop image here"), imageClear: t("aaalice.pcp.image.clear", "Clear selected image"),
			imageAssets: {
				all: t("aaalice.pcp.image.all", "All"), imported: t("aaalice.pcp.image.imported", "Imported"), generated: t("aaalice.pcp.image.generated", "Generated"),
				filter: t("aaalice.pcp.image.filter", "Filter image sources"), search: t("aaalice.pcp.image.search", "Search images"),
				sort: t("aaalice.pcp.image.sort", "Sort images"), sortUnsorted: t("aaalice.pcp.image.sortUnsorted", "Unsorted"), sortAlphabetical: t("aaalice.pcp.image.sortAlphabetical", "A–Z"),
				view: t("aaalice.pcp.image.view", "Image view"), list: t("aaalice.pcp.image.list", "List view"), grid: t("aaalice.pcp.image.grid", "Grid view"),
				loading: t("aaalice.pcp.image.loading", "Loading images…"), empty: t("aaalice.pcp.image.empty", "No images found"),
				loadFailed: t("aaalice.pcp.image.loadFailed", "Some images could not be loaded."),
			},
			markdownEmpty: t("aaalice.workspace.markdown.empty", "Empty note"),
			imageOutput: {
				empty: t("aaalice.workspace.imageOutput.empty", "Run the workflow to preview images"),
				previous: t("aaalice.workspace.imageOutput.previous", "Previous image"), next: t("aaalice.workspace.imageOutput.next", "Next image"),
				open: t("aaalice.workspace.imageOutput.open", "Open full-screen image preview"), title: t("aaalice.workspace.imageOutput.title", "Image preview"),
				viewer: t("aaalice.workspace.imageOutput.viewer", "Full-screen image preview. Scroll to zoom, drag enlarged images to move, and double-click to reset."),
				close: t("aaalice.workspace.imageOutput.close", "Close full-screen image preview"),
				zoomIn: t("aaalice.workspace.imageOutput.zoomIn", "Zoom in"), zoomOut: t("aaalice.workspace.imageOutput.zoomOut", "Zoom out"), fit: t("aaalice.workspace.imageOutput.fit", "Fit to screen"),
			},
			textOutput: {
				empty: t("aaalice.workspace.textOutput.empty", "Run the workflow to preview a value"),
				plain: t("aaalice.workspace.textOutput.plain", "Plain text"), markdown: t("aaalice.workspace.textOutput.markdown", "Markdown"),
				content: t("aaalice.workspace.textOutput.content", "Previewed value"),
			},
			imageCompare: {
			empty: t("aaalice.workspace.imageCompare.empty", "Run the workflow to compare images"),
			before: t("aaalice.workspace.imageCompare.before", "Image A"), after: t("aaalice.workspace.imageCompare.after", "Image B"),
			previousBefore: t("aaalice.workspace.imageCompare.previousBefore", "Previous Image A"), nextBefore: t("aaalice.workspace.imageCompare.nextBefore", "Next Image A"),
			previousAfter: t("aaalice.workspace.imageCompare.previousAfter", "Previous Image B"), nextAfter: t("aaalice.workspace.imageCompare.nextAfter", "Next Image B"),
			slider: t("aaalice.workspace.imageCompare.slider", "Comparison position"),
			open: t("aaalice.workspace.imageCompare.open", "Open full-screen comparison"), title: t("aaalice.workspace.imageCompare.title", "Image comparison"),
			viewer: t("aaalice.workspace.imageCompare.viewer", "Full-screen image comparison. Move the pointer to compare, scroll to zoom, drag enlarged images to move, and double-click to reset."), close: t("aaalice.workspace.imageCompare.close", "Close full-screen comparison"),
			zoomIn: t("aaalice.workspace.imageCompare.zoomIn", "Zoom in"), zoomOut: t("aaalice.workspace.imageCompare.zoomOut", "Zoom out"), fit: t("aaalice.workspace.imageCompare.fit", "Fit to screen"),
		},
		enabled: t("aaalice.common.enabled", "Enabled"), disabled: t("aaalice.common.disabled", "Disabled"),
		quickGroupManager: {
			title: t("aaalice.quickGroup.title", "Quick Group Manager"), groups: t("aaalice.quickGroup.groups", "groups"),
			mute: t("aaalice.quickGroup.mode.mute", "Mute"), bypass: t("aaalice.quickGroup.mode.bypass", "Bypass"), modeAria: t("aaalice.quickGroup.mode.aria", "Disabled group mode"),
			refresh: t("aaalice.quickGroup.refresh", "Refresh groups"), toggle: t("aaalice.quickGroup.toggle", "Toggle {group}"), untitled: t("aaalice.quickGroup.untitled", "Untitled group"), empty: t("aaalice.quickGroup.noGroups", "No visual groups are available in this graph."), emptyGroup: t("aaalice.quickGroup.emptyGroup", "This group has no nodes"),
			error: t("aaalice.quickGroup.error.unavailable", "Quick Group Manager is unavailable"),
			onError: (result) => app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.quickGroup.title", "Quick Group Manager"), detail: result?.message || t("aaalice.quickGroup.error.generic", "The manager could not be updated.") }),
		},
		selectOption: t("aaalice.workspace.binding.selectOption", "Select an option"),
		availability: {
			noOptions: t("aaalice.workspace.binding.noOptions", "No options available"), unset: t("aaalice.workspace.binding.unset", "No value available"),
			unavailable: t("aaalice.workspace.binding.unavailable", "Control is temporarily unavailable"), error: t("aaalice.workspace.binding.error", "Control unavailable due to an error"),
		},
		taglist: {
			placeholder: t("aaalice.pcp.taglist.placeholder", "Enter tags and press Enter"),
			append: t("aaalice.pcp.taglist.append", "+ Add tag"),
			empty: t("aaalice.pcp.taglist.empty", "Press Enter to add tags"),
			input: t("aaalice.pcp.taglist.input", "Add tags"),
			enable: t("aaalice.pcp.taglist.enable", "Enable {tag}"),
			disable: t("aaalice.pcp.taglist.disable", "Disable {tag}"),
			remove: t("aaalice.pcp.taglist.remove", "Remove {tag}"),
		},
		missing: t("aaalice.workspace.binding.missing", "Missing binding"), incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible control"),
		linkedParameters: t("aaalice.workspace.binding.linkedParameters", "Controls {count} parameters"), mixedValues: t("aaalice.workspace.binding.mixedValues", "Values differ"),
			viewNote: t("aaalice.workspace.componentNote.view", "View parameter note"),
	};
}
