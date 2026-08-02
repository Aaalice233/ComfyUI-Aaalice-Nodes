import test from "node:test";
import assert from "node:assert/strict";

import { mapCanvasWidgetRows } from "../js/lib/canvas_widget_row_mapping.js";

function row(text, attributes = {}) {
	return {
		textContent: text,
		querySelectorAll() {
			return Object.entries(attributes).map(([name, value]) => ({ getAttribute(attribute) { return attribute === name ? value : null; } }));
		},
	};
}

test("ordinary widget rows retain direct positional mapping", () => {
	const widgets = [{ name: "seed" }, { name: "steps" }];
	const rows = [row("随机种子 1"), row("步数 20")];
	const mapped = mapCanvasWidgetRows(rows, widgets);
	assert.equal(mapped.get(widgets[0]), rows[0]);
	assert.equal(mapped.get(widgets[1]), rows[1]);
});

test("special preview widgets do not clear otherwise identifiable promoted rows", () => {
	const widgets = [
		{ name: "image", label: "反推参考图" },
		{ name: "switch", label: "是否切换为提示词助手反推" },
		{ name: "preview_text", label: "预览文本" },
		{ name: "seed", label: "随机种子" },
		{ name: "$$canvas-image-preview" },
		{ name: "Constant", label: "Constant" },
	];
	const rows = [
		row("反推参考图 example.png"),
		row("是否切换为提示词助手反推 已禁用"),
		row("随机种子 968571861061875"),
		row("Constant 【图像】画廊图像"),
	];
	const mapped = mapCanvasWidgetRows(rows, widgets);
	assert.equal(mapped.get(widgets[0]), rows[0]);
	assert.equal(mapped.get(widgets[1]), rows[1]);
	assert.equal(mapped.has(widgets[2]), false);
	assert.equal(mapped.get(widgets[3]), rows[2]);
	assert.equal(mapped.has(widgets[4]), false);
	assert.equal(mapped.get(widgets[5]), rows[3]);
});

test("ambiguous labels remain unmarked instead of guessing the wrong row", () => {
	const widgets = [{ name: "first", label: "模式" }, { name: "second", label: "模式" }, { name: "preview" }];
	const rows = [row("模式 A"), row("模式 B")];
	const mapped = mapCanvasWidgetRows(rows, widgets);
	assert.equal(mapped.size, 0);
});
