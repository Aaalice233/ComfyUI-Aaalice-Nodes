/**
 * ComfyUI 在 document 级监听 paste / copy / cut（usePaste / useCopy），其文本输入豁免
 * 不覆盖 search 等类型，且画布无焦点感知。本包 UI 内的剪贴板事件只属于界面自身：
 * 在事件冒泡到 document 前阻断传播，画布完全不感知；不 preventDefault，
 * 输入框、文本选区的默认剪贴板行为不受影响。
 *
 * 约定：所有本包拥有的挂载边界都必须调用本函数——侧边栏根、共享 Dialog、
 * Popover、Tooltip、body 挂载的浮动编辑器，以及 addLifecycleDOMWidget 的节点内
 * DOM widget 根。新增任何脱离这些边界的挂载面时，必须在同一挂载点补上本调用。
 */
const guardedRoots = new WeakSet();

export function guardClipboardEvents(root) {
	if (typeof root?.addEventListener !== "function" || guardedRoots.has(root)) return;
	guardedRoots.add(root);
	for (const type of ["paste", "copy", "cut"]) root.addEventListener(type, (event) => event.stopPropagation());
}
