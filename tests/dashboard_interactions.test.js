import test from "node:test";
import assert from "node:assert/strict";

import { PAGE_PHYSICAL_STEP_DELAY, PAGE_PRECISION_GESTURE_GAP, bindDashboardBoundaryPaging, cancelDashboardBoundaryPaging, destroyDashboardBoundaryPaging, grabSpanOffset, selectionFootprint } from "../js/lib/dashboard_interactions.js";
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
	return { now: () => time, setTimer: schedule, clearTimer: (id) => jobs.delete(id), requestFrame: (callback) => schedule(callback, 16), cancelFrame: (id) => jobs.delete(id), advance, pending: () => jobs.size };
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
			let prevented = false; const event = { defaultPrevented: false, ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 100, deltaMode: 0, ...details, preventDefault() { prevented = true; this.defaultPrevented = true; } };
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
			state, scroller: surface.scroller, pageId: pages[pageIndex], isEnabled: () => enabled,
			requestPage: (direction) => {
				const next = pageIndex + direction;
				if (next < 0 || next >= pages.length) return null;
				pageIndex = next; turns.push(pages[next]);
				if (autoRender) scheduler.requestFrame(() => bind());
				return pages[next];
			},
			now: scheduler.now, setTimer: scheduler.setTimer, clearTimer: scheduler.clearTimer, requestFrame: scheduler.requestFrame, cancelFrame: scheduler.cancelFrame,
		});
		return surface;
	};
	bind();
	return {
		state, scheduler, pages, turns, bind, jump(index, geometry = {}) { pageIndex = index; return bind(geometry); }, setEnabled(value) { enabled = Boolean(value); }, cancel() { cancelDashboardBoundaryPaging(state); },
		get surface() { return surface; }, get pageIndex() { return pageIndex; }, destroy() { destroyDashboardBoundaryPaging(state); },
	};
}

test("fast physical-wheel bursts drain through real render frames without another event", (context) => {
	const paging = pagingHarness({ autoRender: true }); context.after(() => paging.destroy()); const firstStage = paging.surface.stage;
	for (let index = 0; index < 4; index++) assert.equal(firstStage.wheel({ wheelDeltaY: -120 }), true);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 3);
	paging.scheduler.advance(16); assert.equal(firstStage.isConnected, false); assert.equal(firstStage.wheel({ wheelDeltaY: -120 }), false);
	for (const expectedIndex of [3, 4, 5]) {
		paging.scheduler.advance(163); assert.equal(paging.pageIndex, expectedIndex - 1);
		paging.scheduler.advance(1); assert.equal(paging.pageIndex, expectedIndex);
		paging.scheduler.advance(16);
	}
	assert.deepEqual(paging.turns, ["page-2", "page-3", "page-4", "page-5"]); assert.equal(paging.state.pendingSteps, 0);
});

test("one accelerated wheel event never guesses several future pages from its delta", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 300, wheelDeltaY: -360 }), true);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0); assert.deepEqual(paging.turns, ["page-2"]);
});

test("precision-wheel inertia stays on one page until the gesture becomes quiet", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); paging.bind();
	for (let index = 0; index < 6; index++) { paging.scheduler.advance(40); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); }
	assert.equal(paging.pageIndex, 2);
	paging.scheduler.advance(PAGE_PRECISION_GESTURE_GAP - 1); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false);
	paging.scheduler.advance(PAGE_PRECISION_GESTURE_GAP); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); assert.equal(paging.pageIndex, 3);
});

test("horizontal-dominant precision pulses keep one diagonal gesture alive", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ deltaY: 8 }); paging.bind(); paging.scheduler.advance(200);
	assert.equal(paging.surface.stage.wheel({ deltaX: 8, deltaY: 4 }), false);
	paging.scheduler.advance(100); assert.equal(paging.surface.stage.wheel({ deltaY: 4 }), false); assert.equal(paging.pageIndex, 2);
});

test("pure horizontal precision pulses keep one diagonal gesture alive", (context) => {
	const paging = pagingHarness({ start: 1, count: 5 }); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); paging.bind();
	paging.scheduler.advance(200); assert.equal(paging.surface.stage.wheel({ deltaX: 8, deltaY: 0 }), false);
	paging.scheduler.advance(100); assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); assert.equal(paging.pageIndex, 2);
});

test("ambiguous high-resolution pulses stay one precision gesture", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 40, wheelDeltaY: -40 }), true); paging.bind();
	paging.scheduler.advance(5); assert.equal(paging.surface.stage.wheel({ deltaY: 40, wheelDeltaY: -40 }), false);
	assert.equal(paging.pageIndex, 2); assert.equal(Number(paging.state.pendingSteps) || 0, 0);
});

test("queued wheel steps stop when the next page has native scroll room", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), true);
	assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), true); assert.equal(paging.state.pendingSteps, 1);
	paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 }); paging.scheduler.advance(180);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0);
});

test("native scrolling discards a previous page queue before its boundary frame", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	for (let index = 0; index < 3; index++) paging.surface.stage.wheel({ wheelDeltaY: -120 });
	const scrollingPage = paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(scrollingPage.stage.wheel({ wheelDeltaY: -120 }), false); assert.equal(paging.state.pendingSteps, 0);
	scrollingPage.scroller.scrollTop = 200; paging.scheduler.advance(16);
	assert.deepEqual(paging.turns, [paging.pages[2]]); assert.equal(paging.state.pendingSteps, 1);
	paging.scheduler.advance(PAGE_PHYSICAL_STEP_DELAY - 16); assert.deepEqual(paging.turns, [paging.pages[2], paging.pages[3]]);
	paging.bind(); paging.scheduler.advance(PAGE_PHYSICAL_STEP_DELAY * 2); assert.equal(paging.pageIndex, 3);
});

test("default-prevented controls discard an older page queue", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	for (let index = 0; index < 3; index++) paging.surface.stage.wheel({ wheelDeltaY: -120 });
	const current = paging.bind();
	assert.equal(current.stage.wheel({ defaultPrevented: true, wheelDeltaY: -120 }), false);
	assert.equal(paging.state.pendingSteps, 0); assert.equal(paging.scheduler.pending(), 0);
	paging.scheduler.advance(PAGE_PHYSICAL_STEP_DELAY * 2); assert.equal(paging.pageIndex, 2);
});

test("isolated controls clear an older queue before stopping wheel propagation", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	for (let index = 0; index < 3; index++) paging.surface.stage.wheel({ wheelDeltaY: -120 });
	const current = paging.bind();
	const isolated = { withinStage: true, closest: (selector) => selector === "[data-aa-isolated-events]" ? isolated : null };
	assert.equal(current.stage.wheel({ target: isolated, stopBeforeBubble: true, wheelDeltaY: -120 }), false);
	assert.equal(paging.state.pendingSteps, 0); paging.scheduler.advance(PAGE_PHYSICAL_STEP_DELAY * 2); assert.equal(paging.pageIndex, 2);
});

test("post-scroll boundary checks consume native scrolling instead of replaying its burst", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), false); assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), false);
	paging.surface.scroller.scrollTop = 200; paging.scheduler.advance(16);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0);
	paging.destroy(); paging.scheduler.advance(1000); assert.equal(paging.scheduler.pending(), 0);
});

test("an immediate boundary event cancels an older post-scroll frame", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), false);
	paging.surface.scroller.scrollTop = 200;
	assert.equal(paging.surface.stage.wheel({ wheelDeltaY: -120 }), true); assert.equal(paging.pageIndex, 2);
	paging.scheduler.advance(16); assert.equal(paging.state.pendingSteps, 0); assert.deepEqual(paging.turns, ["page-2"]);
});

test("scrollable controls consume wheel input before page boundaries", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	const inner = { nodeType: 1, scrollHeight: 300, clientHeight: 100, scrollTop: 0, parentElement: paging.surface.scroller };
	assert.equal(paging.surface.stage.wheel({ target: inner, wheelDeltaY: -120 }), false); assert.equal(paging.pageIndex, 1);
	inner.scrollTop = 200;
	assert.equal(paging.surface.stage.wheel({ target: inner, wheelDeltaY: -120 }), true); assert.equal(paging.pageIndex, 2);
});

test("nested scrolling cancels older queues and post-scroll frames", (context) => {
	const queued = pagingHarness(); context.after(() => queued.destroy());
	queued.surface.stage.wheel({ wheelDeltaY: -120 }); queued.surface.stage.wheel({ wheelDeltaY: -120 }); queued.bind();
	const inner = { nodeType: 1, scrollHeight: 300, clientHeight: 100, scrollTop: 0, parentElement: queued.surface.scroller };
	queued.surface.stage.wheel({ target: inner, wheelDeltaY: -120 }); queued.scheduler.advance(180);
	assert.equal(queued.pageIndex, 2); assert.equal(queued.state.pendingSteps, 0);

	const framed = pagingHarness(); context.after(() => framed.destroy()); framed.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	framed.surface.stage.wheel({ wheelDeltaY: -120 }); framed.surface.scroller.scrollTop = 200;
	const framedInner = { nodeType: 1, scrollHeight: 300, clientHeight: 100, scrollTop: 0, parentElement: framed.surface.scroller };
	framed.surface.stage.wheel({ target: framedInner, wheelDeltaY: -120 }); framed.scheduler.advance(16);
	assert.equal(framed.pageIndex, 1);
});

test("nested precision scrolling keeps the current inertia gesture consumed", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ deltaY: 8 }); paging.bind();
	const inner = { nodeType: 1, scrollHeight: 300, clientHeight: 100, scrollTop: 0, parentElement: paging.surface.scroller };
	paging.scheduler.advance(200); paging.surface.stage.wheel({ target: inner, deltaY: 8 });
	inner.scrollTop = 200; paging.scheduler.advance(100);
	assert.equal(paging.surface.stage.wheel({ target: inner, deltaY: 8 }), false); assert.equal(paging.pageIndex, 2);
});

test("rebinding cancels a post-scroll frame owned by the old stage", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.bind(); paging.scheduler.advance(16);
	assert.equal(paging.pageIndex, 1); assert.equal(paging.scheduler.pending(), 0);
});

test("opposite precision input replaces an awaiting physical burst", (context) => {
	const paging = pagingHarness({ start: 3 }); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 });
	assert.equal(paging.pageIndex, 4); assert.equal(paging.state.pendingSteps, 1);
	assert.equal(paging.surface.stage.wheel({ deltaY: -8, wheelDeltaY: -8 }), true); assert.equal(paging.state.pendingSteps, -1);
	paging.bind(); paging.scheduler.advance(180);
	assert.equal(paging.pageIndex, 3); assert.equal(paging.state.pendingSteps, 0); assert.deepEqual(paging.turns, ["page-4", "page-3"]);
});

test("opposite physical input replaces the queued direction", (context) => {
	const paging = pagingHarness({ start: 3 }); context.after(() => paging.destroy());
	for (let index = 0; index < 3; index++) paging.surface.stage.wheel({ wheelDeltaY: -120 });
	assert.equal(paging.pageIndex, 4); assert.equal(paging.state.pendingSteps, 2);
	paging.surface.stage.wheel({ deltaY: -100, wheelDeltaY: 120 }); assert.equal(paging.state.pendingSteps, -1);
	paging.bind(); paging.scheduler.advance(180); assert.equal(paging.pageIndex, 3);
});

test("consumed precision reversal still cancels a physical queue", (context) => {
	const paging = pagingHarness({ start: 2 }); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true);
	const next = paging.bind(); assert.equal(next.stage.wheel({ wheelDeltaY: -120 }), true); assert.equal(paging.state.pendingSteps, 1);
	assert.equal(next.stage.wheel({ deltaY: -8 }), false); assert.equal(paging.state.pendingSteps, 0);
	paging.scheduler.advance(PAGE_PHYSICAL_STEP_DELAY * 2); assert.equal(paging.pageIndex, 3);
});

test("manual page selection cancels queued wheel steps and keeps precision inertia consumed", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ deltaY: 8 }); assert.equal(paging.pageIndex, 2);
	paging.jump(5); paging.scheduler.advance(40);
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); assert.equal(paging.pageIndex, 5); assert.equal(paging.state.pendingSteps, 0);
});

test("explicit physical detents override a recent precision gesture", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ deltaY: 8 }); paging.bind(); paging.scheduler.advance(100);
	assert.equal(paging.surface.stage.wheel({ deltaY: 100, wheelDeltaY: -120 }), true); assert.equal(paging.state.pendingSteps, 1);
	paging.scheduler.advance(80); assert.equal(paging.pageIndex, 3);
});

test("page edges clear queued bursts and allow immediate reversal", (context) => {
	const paging = pagingHarness({ pageCount: 4, start: 2 }); context.after(() => paging.destroy());
	for (let index = 0; index < 5; index++) paging.surface.stage.wheel({ wheelDeltaY: -120 });
	assert.equal(paging.pageIndex, 3); assert.equal(paging.state.pendingSteps, 4);
	paging.bind(); paging.scheduler.advance(180); assert.equal(paging.state.pendingSteps, 0);
	assert.equal(paging.surface.stage.wheel({ deltaY: -100, wheelDeltaY: 120 }), true); assert.equal(paging.pageIndex, 2);
});

test("manual page selection also cancels queued physical intents", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 });
	assert.equal(paging.state.pendingSteps, 1); paging.jump(5); paging.scheduler.advance(1000);
	assert.equal(paging.pageIndex, 5); assert.equal(paging.state.pendingSteps, 0); assert.deepEqual(paging.turns, ["page-2"]);
});

test("cancelling native precision scrolling suppresses the remaining inertia", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy()); paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 });
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); paging.cancel(); paging.bind(); paging.scheduler.advance(40);
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); assert.equal(paging.pageIndex, 1);
});

test("a disabled mounted surface drops its physical timer without an explicit cancel", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.bind(); paging.setEnabled(false);
	paging.scheduler.advance(180); assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0);
});

test("search or layout gestures cancel a waiting physical queue even when brief", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.bind();
	paging.cancel(); paging.setEnabled(false); paging.scheduler.advance(90); paging.setEnabled(true); paging.scheduler.advance(90);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0);
});

test("disabled precision pulses extend the consumed inertia gesture", (context) => {
	const paging = pagingHarness({ start: 2 }); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); const current = paging.bind();
	paging.setEnabled(false); paging.scheduler.advance(200); assert.equal(current.stage.wheel({ deltaY: 6 }), false);
	paging.setEnabled(true); paging.scheduler.advance(100); assert.equal(current.stage.wheel({ deltaY: 4 }), false);
	assert.equal(paging.pageIndex, 3);
});

test("disabled horizontal precision pulses keep the consumed gesture armed", (context) => {
	const paging = pagingHarness({ start: 1, count: 5 }); context.after(() => paging.destroy());
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), true); paging.bind();
	paging.scheduler.advance(300); paging.setEnabled(false);
	assert.equal(paging.surface.stage.wheel({ deltaX: 8, deltaY: 0 }), false);
	paging.scheduler.advance(100); paging.setEnabled(true);
	assert.equal(paging.surface.stage.wheel({ deltaY: 8 }), false); assert.equal(paging.pageIndex, 2);
});

test("destroy removes listeners, timers, queued intents, and post-scroll frames", () => {
	const paging = pagingHarness();
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.bind();
	const stage = paging.surface.stage; assert.ok(paging.scheduler.pending() > 0); paging.destroy();
	assert.equal(stage.wheel({ wheelDeltaY: -120 }), false); assert.equal(paging.scheduler.pending(), 0); assert.equal(paging.state.pendingSteps, 0);
	paging.bind({ scrollHeight: 300, clientHeight: 100, scrollTop: 0 }); paging.surface.stage.wheel({ wheelDeltaY: -120 });
	assert.ok(paging.scheduler.pending() > 0); paging.destroy(); assert.equal(paging.scheduler.pending(), 0);
});

test("a disconnected paging stage drops its remaining physical queue", (context) => {
	const paging = pagingHarness(); context.after(() => paging.destroy());
	paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.surface.stage.wheel({ wheelDeltaY: -120 }); paging.bind();
	paging.surface.stage.isConnected = false; paging.scheduler.advance(180);
	assert.equal(paging.pageIndex, 2); assert.equal(paging.state.pendingSteps, 0);
});

test("same-frame requests from shared roots reconcile without awaiting deadlock", (context) => {
	const scheduler = fakeScheduler(); const pages = ["page-0", "page-1"]; let activePageId = pages[0];
	const firstState = {}; const secondState = {}; const first = wheelSurface(); const second = wheelSurface();
	const bind = (surface, state) => bindDashboardBoundaryPaging(surface.stage, {
		state, scroller: surface.scroller, pageId: activePageId,
		requestPage: (direction) => { const index = pages.indexOf(activePageId); const target = pages[index + direction]; if (!target) return null; activePageId = target; return target; },
		now: scheduler.now, setTimer: scheduler.setTimer, clearTimer: scheduler.clearTimer, requestFrame: scheduler.requestFrame, cancelFrame: scheduler.cancelFrame,
	});
	bind(first, firstState); bind(second, secondState);
	first.stage.wheel({ wheelDeltaY: -120 }); first.stage.wheel({ wheelDeltaY: -120 });
	second.stage.wheel({ deltaY: -100, wheelDeltaY: 120 }); assert.equal(activePageId, "page-0");
	bind(first, firstState); bind(second, secondState);
	assert.equal(firstState.awaitingPageId, null); assert.equal(secondState.awaitingPageId, null); assert.equal(firstState.pendingSteps, 0);
	assert.equal(first.stage.wheel({ wheelDeltaY: -120 }), true); assert.equal(activePageId, "page-1");
	destroyDashboardBoundaryPaging(firstState); destroyDashboardBoundaryPaging(secondState);
});

test("paging controller state stays isolated across mounted roots", (context) => {
	const first = pagingHarness({ start: 1 }); const second = pagingHarness({ start: 4 }); context.after(() => { first.destroy(); second.destroy(); });
	first.surface.stage.wheel({ wheelDeltaY: -120 }); first.surface.stage.wheel({ wheelDeltaY: -120 });
	second.surface.stage.wheel({ deltaY: -100, wheelDeltaY: 120 });
	assert.equal(first.pageIndex, 2); assert.equal(first.state.pendingSteps, 1);
	assert.equal(second.pageIndex, 3); assert.equal(Number(second.state.pendingSteps) || 0, 0);
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
