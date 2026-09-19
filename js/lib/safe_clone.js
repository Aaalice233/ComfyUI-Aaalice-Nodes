/**
 * ComfyUI 0.36 起 node.properties / graph.extra 等宿主对象是 Vue 响应式对象，
 * 从它们身上读取嵌套值会得到 **响应式 Proxy**，而 structuredClone 拒绝克隆 Proxy
 * （抛 DataCloneError: #<Object> could not be cloned）。
 *
 * 这类值必须先用本工具克隆：优先解出 __v_raw 再走原生 structuredClone，
 * 万一仍不可克隆则退化为 JSON 往返，保证不抛异常。
 */
export function cloneStateValue(value) {
	if (value === null || typeof value !== "object") return value;
	const raw = value.__v_raw ?? value;
	try {
		return structuredClone(raw);
	} catch {
		try {
			return JSON.parse(JSON.stringify(raw));
		} catch {
			return raw;
		}
	}
}
