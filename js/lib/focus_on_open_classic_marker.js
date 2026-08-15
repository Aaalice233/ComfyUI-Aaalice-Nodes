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

export function classicFocusMarkerCanvasRect(node, canvas, titleHeight = 30) {
	const marker = MARKERS.get(node);
	if (!marker || typeof canvas?.convertOffsetToCanvas !== "function") return null;
	const area = marker.button?._last_area;
	const width = Number(area?.[2]);
	const height = Number(area?.[3]);
	const relativeX = Number.isFinite(Number(area?.[0])) && width > 0 ? Number(area[0]) : Number(node.size?.[0]) - 20;
	const relativeY = Number.isFinite(Number(area?.[1])) && height > 0 ? Number(area[1]) : -Number(titleHeight || 30);
	const markerWidth = width > 0 ? width : 20;
	const markerHeight = height > 0 ? height : 20;
	const topLeft = canvas.convertOffsetToCanvas([Number(node.pos?.[0]) + relativeX, Number(node.pos?.[1]) + relativeY]);
	const bottomRight = canvas.convertOffsetToCanvas([Number(node.pos?.[0]) + relativeX + markerWidth, Number(node.pos?.[1]) + relativeY + markerHeight]);
	const values = [...topLeft, ...bottomRight].map(Number);
	if (!values.every(Number.isFinite)) return null;
	return {
		left: Math.min(values[0], values[2]),
		top: Math.min(values[1], values[3]),
		width: Math.abs(values[2] - values[0]),
		height: Math.abs(values[3] - values[1]),
	};
}
