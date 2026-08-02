import test from "node:test";
import assert from "node:assert/strict";

import { PAGE_WHEEL_PAGE_INTERVAL, bindDashboardBoundaryPaging, cancelDashboardBoundaryPaging, destroyDashboardBoundaryPaging, grabSpanOffset, selectionFootprint } from "../js/lib/dashboard_interactions.js";
import { applyMarqueeSelection, containedIds, nearestInDirection, nextClickSelection } from "../js/lib/dashboard_selection.js";

function fakeScheduler() {
	let time = 0; let nextId = 1; const jobs = new Map();
	const schedule = (callback, delay) => { const id = nextId++; jobs.set(id, { callback, due: time + Math.max(0, delay) }); return id; };
	const advance = (milliseconds) => {
		const target = time + milliseconds;
		while (true) {
			const next = [...jobs.entries()].filter(([, job]) => job.due <= target).sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
			if (!next) break;
			const [id, job] = next; jobs.delete(id); time = job.due; job.callback();
		}
		time = target;
	};
	return { now: () => time, requestFrame: (callback) => schedule(callback, 16), cancelFrame: (id) => jobs.delete(id), advance, pending: () => jobs.size };
}

function wheelSurface({ scrollHeight = 100, clientHeight = 100, scrollTop = 0 } = {}) {
	const wheelListeners = [];
	const scroller = { scrollHeight, clientHeight, scrollTop, isConnected: true };
	const stage = {
		isConnected: true,
		contains(candidate) { return candidate === scroller || Boolean(candidate?.withinStage); },
		addEventListener(type, listener, options = {}) { if (type === "wheel") wheelListeners.push({ listener, capture: options === true || Boolean(options?.capture) }); },
		removeEventListener(type, listener, options = {}) {
			if (type !== "wheel") return;
			const capture = options === true || Boolean(options?.capture); const index = wheelListeners.findIndex((entry) => entry.listener === listener && entry.capture === capture);
			if (index >= 0) wheelListeners.splice(index, 1);
		},
		wheel(details = {}) {
			let prevented = false; const event = { defaultPrevented: false, ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 100, ...details, preventDefault() { prevented = true; this.defaultPrevented = true; } };
			for (const entry of [...wheelListeners].filter((candidate) => candidate.capture)) entry.listener(event);
			if (!details.stopBeforeBubble) for (const entry of [...wheelListeners].filter((candidate) => !candidate.capture)) entry.listener(event);
			return prevented;
		},
	};
	return { stage, scroller };
}

function pagingHarness({ pageCount = 8, start = 1, autoRender = false } = {}) {
	const scheduler = fakeScheduler(); const state = {}; const pages = Array.from({ length: pageCount }, (_, index) => `page-${index}`); const turns = [];
	let pageIndex = start; let surface = null; let enabled = true;
	const bind = (geometry = {}) => {
		if (surface) { surface.stage.isConnected = false; surface.scroller.isConnected = false; }
		surface = wheelSurface(geometry);
		bindDashboardBoundaryPaging(surface.stage, {
			state, scroller: surface.scroller, isEnabled: () => enabled,
			requestPage: (direction) => {
				const next = pageIndex + direction;
				if (next < 0 || next >= pages.length) return null;
				pageIndex = next; turns.push(pages[next]);
				if (autoRender) scheduler.requestFrame(() => bind());
				return pages[next];
			},
			now: scheduler.now, requestFrame: scheduler.requestFrame, cancelFrame: scheduler.cancelFrame,
		});
		return surface;
	};
	bind();
	return {
		state, scheduler, pages, turns, bind, jump(index, geometry = {}) { pageIndex = index; return bind(geometry); }, setEnabled(value) { enabled = Boolean(value); }, cancel() { cancelDashboardBoundaryPaging(state); },
		get surface() { return surface; }, get pageIndex() { return pageIndex; }, destroy() { destroyDashboardBoundaryPaging(state); },
	};
}

test("one wheel gesture changes one page and never leaves a replay queue", (context) => {
	const paging = pagingHarness({ autoRender: true }); context.after(() => paging.destroy()); const firstStage = paging.surface.stage;
	assert.equal(firstStage.wheel({ wheelDeltaY: -120 }), true);
	for (let index = 0; index < 3; index++) assert.equal(firstStage.wheel({ wheelDeltaY: -120 }), false);
	assert.equal(paging.pageIndex, 2); assert.deepEqual(paging.turns, ["page-2"]);
	paging.scheduler.advance(16); assert.equal(firstStage.isConnected, false); assert.equal(paging.scheduler.pending(), 0);
	paging.scheduler.advance(1000); assert.equal(paging.pageIndex, 2); assert.equal(paging.scheduler.pending(), 0);
	paging.scheduler.advance(PAGE_WHEEL_PAGE_INTERVAL); assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), true); assert.equal(paging.pageIndex, 3);
});

test("an accelerated wheel event still changes at most one page", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 300, wheelDeltaY: -360 }), true);
	assert.equal(paging.pageIndex, 2); assert.deepEqual(paging.turns, ["page-2"]); assert.equal(paging.scheduler.pending(), 0);
});

test("fast wheel input advances at the page interval without replay after stopping", (context) => {
	const paging = pagingHarness({ autoRender: true }); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); assert.equal(paging.pageIndex, 2);
	for (let index = 0; index < 4; index++) { paging.scheduler.advance(40); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); }
	paging.scheduler.advance(40); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); assert.equal(paging.pageIndex, 3);
	paging.scheduler.advance(1000); assert.equal(paging.pageIndex, 3); assert.equal(paging.scheduler.pending(), 0);
});

test("horizontal-dominant pulses do not trigger or add a page delay", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); paging.bind(); paging.scheduler.advance(100);
	assert.equal(paging.surface.stage.wheel({ deltaX: 8, deltaY: 4 }), false);
	paging.scheduler.advance(PAGE_WHEEL_PAGE_INTERVAL - 101); assert.equal(paging.surface.stage.wheel({ deltaY: 4 }), false);
	paging.scheduler.advance(1); assert.equal(paging.surface.stage.wheel({ deltaY: 4 }), true); assert.equal(paging.pageIndex, 3);
});

test("native scrolling keeps only one boundary check", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false); assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false);
	paging.surface.scroller.scrollTop = 200; paging.scheduler.advance(16);
	assert.equal(paging.pageIndex, 2); assert.deepEqual(paging.turns, ["page-2"]); assert.equal(paging.scheduler.pending(), 0);
	paging.scheduler.advance(1000); assert.equal(paging.pageIndex, 2);
});

test("an immediate boundary event cancels an older native-scroll check", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false);
	paging.surface.scroller.scrollTop = 200;
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), true); paging.scheduler.advance(16);
	assert.deepEqual(paging.turns, ["page-2"]); assert.equal(paging.scheduler.pending(), 0);
});

test("scrollable descendants consume wheel input before the page boundary", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	const inner = { nodeType: 1, scrollHeight: 300, clientHeight: 100, scrollTop: 0, parentElement: paging.surface.scroller };
	assert.equal(paging.surface.stage.wheel({ target: inner, deltaY: 100 }), false); assert.equal(paging.pageIndex, 1);
	inner.scrollTop = 200; assert.equal(paging.surface.stage.wheel({ target: inner, deltaY: 100 }), true); assert.equal(paging.pageIndex, 2);
});

test("default-prevented and isolated controls discard stale boundary checks", (context) => {
	const prevented = pagingHarness(); context.after(() => prevented.destroy()); prevented.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(prevented.surface.stage.wheel({ defaultPrevented: true, deltaY: 100 }), false); prevented.surface.scroller.scrollTop = 200; prevented.scheduler.advance(16); assert.equal(prevented.pageIndex, 1);

	const isolatedPaging = pagingHarness(); context.after(() => isolatedPaging.destroy()); isolatedPaging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	const isolated = { withinStage: true, closest: (selector) => selector === "[data-aa-isolated-events]" ? isolated : null };
	assert.equal(isolatedPaging.surface.stage.wheel({ target: isolated, stopBeforeBubble: true, deltaY: 100 }), false);
	isolatedPaging.surface.scroller.scrollTop = 200; isolatedPaging.scheduler.advance(16); assert.equal(isolatedPaging.pageIndex, 1);
});

test("cancelling a native-scroll check suppresses the rest of the gesture", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false); paging.cancel(); paging.surface.scroller.scrollTop = 200; paging.scheduler.advance(16);
	assert.equal(paging.pageIndex, 1); assert.equal(paging.scheduler.pending(), 0);
});

test("disabled surfaces do not retain wheel work", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.setEnabled(false);
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false); paging.scheduler.advance(1000); assert.equal(paging.pageIndex, 1); assert.equal(paging.scheduler.pending(), 0);
	paging.setEnabled(true); paging.scheduler.advance(PAGE_WHEEL_PAGE_INTERVAL); assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), true); assert.equal(paging.pageIndex, 2);
});

test("destroy removes wheel listeners and boundary frames", () => {
	const paging = pagingHarness(); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	const stage = paging.surface.stage; assert.equal(stage.wheel({ deltaY: 100 }), false); assert.ok(paging.scheduler.pending() > 0); paging.destroy();
	assert.equal(stage.wheel({ deltaY: 100 }), false); paging.scheduler.advance(1000); assert.equal(paging.scheduler.pending(), 0); assert.equal(paging.pageIndex, 1);
});

test("a disconnected stage drops its boundary check", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false); paging.surface.stage.isConnected = false; paging.scheduler.advance(16);
	assert.equal(paging.pageIndex, 1); assert.equal(paging.scheduler.pending(), 0);
});

test("paging state stays isolated across mounted roots", (context) => {
	const first = pagingHarness({ start: 1 }); const second = pagingHarness({ start: 4 }); context.after(() => { first.destroy(); second.destroy(); });
	assert.equal(first.surface.stage.wheel({ deltaY: 100 }), true); assert.equal(first.surface.stage.wheel({ deltaY: 100 }), false);
	assert.equal(second.surface.stage.wheel({ deltaY: -100 }), true);
	assert.equal(first.pageIndex, 2); assert.equal(second.pageIndex, 3);
});

test("manual page selection keeps the current wheel gesture consumed", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), true); paging.jump(5); paging.scheduler.advance(40);
	assert.equal(paging.surface.stage.wheel({ deltaY: 100 }), false); assert.equal(paging.pageIndex, 5);
});

test("drag grab offset preserves the pointer anchor across grid spans", () => {
	assert.equal(grabSpanOffset(150, 0, 300, 6), 3);
	assert.equal(grabSpanOffset(20, 0, 100, 10), 2);
});

test("drag grab offset clamps pointer positions to the grabbed footprint", () => {
	assert.equal(grabSpanOffset(-20, 0, 300, 6), 0);
	assert.equal(grabSpanOffset(320, 0, 300, 6), 5);
	assert.equal(grabSpanOffset(150, 0, 300, 1), 0);
});

test("multi-selection drag uses one stable bounding footprint", () => {
	assert.deepEqual(selectionFootprint([
		{ row: 2, column: 3, rowSpan: 6, columnSpan: 3 },
		{ row: 10, column: 7, rowSpan: 4, columnSpan: 5 },
	]), { row: 2, column: 3, rowSpan: 12, columnSpan: 9 });
});

test("marquee application supports additive and subtractive modes", () => {
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b", "c"], "add")].sort(), ["a", "b", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a", "b", "c"], ["b"], "subtract")].sort(), ["a", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b"], "subtract")], ["a"]);
});

test("contained ids only include frames fully covered by the rectangle", () => {
	const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
	const frames = [
		{ id: "covered", rect: rect(20, 20, 60, 60) },
		{ id: "partial", rect: rect(80, 20, 140, 60) },
		{ id: "outside", rect: rect(200, 20, 260, 60) },
	];
	assert.deepEqual([...containedIds(frames, rect(10, 10, 100, 80))], ["covered"]);
	assert.deepEqual([...containedIds(frames, rect(0, 0, 300, 100))].sort(), ["covered", "outside", "partial"]);
	assert.deepEqual([...containedIds(frames, rect(0, 0, 30, 30))], []);
});

test("click selection replaces, toggles, or subtracts without guessing", () => {
	assert.deepEqual([...nextClickSelection(["a", "b"], "c")], ["c"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a")], ["a", "b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a", { additive: true })], ["b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "c", { additive: true })].sort(), ["a", "b", "c"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a", { subtract: true })], ["b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "c", { subtract: true })].sort(), ["a", "b"]);
});

test("keyboard navigation picks the nearest card in the requested direction", () => {
	const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
	const grid = [
		{ id: "origin", rect: rect(100, 100, 160, 140) },
		{ id: "right", rect: rect(200, 104, 260, 136) },
		{ id: "right-far", rect: rect(300, 100, 360, 140) },
		{ id: "below", rect: rect(104, 200, 156, 240) },
		{ id: "left", rect: rect(10, 100, 60, 140) },
	];
	assert.equal(nearestInDirection(grid, "origin", "right"), "right");
	assert.equal(nearestInDirection(grid, "origin", "down"), "below");
	assert.equal(nearestInDirection(grid, "origin", "left"), "left");
	assert.equal(nearestInDirection(grid, "origin", "up"), null);
	assert.equal(nearestInDirection(grid, "right", "right"), "right-far");
	assert.equal(nearestInDirection(grid, "missing", "right"), null);
});
