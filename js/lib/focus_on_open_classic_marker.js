const TITLE_BUTTON_NAME = "aaalice-focus-on-open";
const MARKERS = new WeakMap();

function restoreClickHandler(node, marker) {
	if (node.onTitleButtonClick !== marker.clickHandler) return;
	if (marker.ownClickDescriptor) Object.defineProperty(node, "onTitleButtonClick", marker.ownClickDescriptor);
	else delete node.onTitleButtonClick;
}

export function mountClassicFocusMarker(node, onActivate) {
	const existing = MARKERS.get(node);
	if (existing) {
		existing.onActivate = onActivate;
		return existing.button;
	}
	if (typeof node?.addTitleButton !== "function") return null;

	const button = node.addTitleButton({
		name: TITLE_BUTTON_NAME,
		text: "🎯",
		fontSize: 18,
		height: 20,
	});
	const marker = {
		button,
		onActivate,
		originalClickHandler: node.onTitleButtonClick,
		ownClickDescriptor: Object.getOwnPropertyDescriptor(node, "onTitleButtonClick"),
		clickHandler: null,
	};
	marker.clickHandler = function (clickedButton, canvas) {
		if (clickedButton === marker.button) {
			marker.onActivate();
			return;
		}
		return marker.originalClickHandler?.call(this, clickedButton, canvas);
	};
	node.onTitleButtonClick = marker.clickHandler;
	MARKERS.set(node, marker);
	return button;
}

export function unmountClassicFocusMarker(node) {
	const marker = MARKERS.get(node);
	if (!marker) return false;
	MARKERS.delete(node);

	const index = node.title_buttons?.indexOf(marker.button) ?? -1;
	if (index >= 0) node.title_buttons.splice(index, 1);
	restoreClickHandler(node, marker);
	return true;
}

export function hasClassicFocusMarker(node) {
	return MARKERS.has(node);
}
