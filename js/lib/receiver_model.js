/** Pure state and diff model for ParameterReceiver bindings. */

export const MAX_RECEIVER_SLOTS = 32;
export const RECEIVER_BINDING_VERSION = 1;

export function emptyReceiverBinding() {
	return { version: RECEIVER_BINDING_VERSION, panelNodeId: null, panelTitle: "", slots: [] };
}

export function normalizeReceiverBinding(value) {
	if (!value || typeof value !== "object") return emptyReceiverBinding();
	return {
		version: RECEIVER_BINDING_VERSION,
		panelNodeId: value.panelNodeId ?? null,
		panelTitle: String(value.panelTitle || ""),
		slots: Array.isArray(value.slots) ? value.slots.slice(0, MAX_RECEIVER_SLOTS).map((slot) => ({
			parameterId: String(slot?.parameterId || ""),
			name: String(slot?.name || ""),
			paramType: String(slot?.paramType || "*"),
			setName: String(slot?.setName || ""),
			getNodeId: slot?.getNodeId ?? null,
		})).filter((slot) => slot.parameterId) : [],
	};
}

export function reconcileReceiverSlots(currentSlots, panelMeta, setNameFor) {
	const previous = new Map(normalizeReceiverBinding({ slots: currentSlots }).slots.map((slot) => [slot.parameterId, slot]));
	const ordered = (panelMeta || []).slice(0, MAX_RECEIVER_SLOTS).map((parameter) => {
		const retained = previous.get(String(parameter.id));
		previous.delete(String(parameter.id));
		return {
			parameterId: String(parameter.id),
			name: String(parameter.name || parameter.id),
			paramType: String(parameter.param_type || "*"),
			setName: String(setNameFor?.(parameter) || retained?.setName || ""),
			getNodeId: retained?.getNodeId ?? null,
		};
	});
	return {
		ordered,
		added: ordered.filter((slot) => !(currentSlots || []).some((item) => String(item?.parameterId) === slot.parameterId)),
		removed: [...previous.values()],
	};
}

export function receiverStructureDiff(bindingValue, panelMeta) {
	const binding = normalizeReceiverBinding(bindingValue);
	const expected = (panelMeta || []).slice(0, MAX_RECEIVER_SLOTS).map((item) => String(item.id));
	const actual = binding.slots.map((item) => item.parameterId);
	const added = expected.filter((id) => !actual.includes(id));
	const removed = actual.filter((id) => !expected.includes(id));
	const reordered = !added.length && !removed.length && expected.some((id, index) => actual[index] !== id);
	return { added, removed, reordered, changed: Boolean(added.length || removed.length || reordered) };
}

export function disambiguatePanelLabels(panels) {
	const titles = (panels || []).map((panel) => String(panel?.title || "ParameterPanel"));
	const counts = new Map(titles.map((title) => [title, titles.filter((item) => item === title).length]));
	return (panels || []).map((panel, index) => counts.get(titles[index]) > 1
		? `${titles[index]} (#${panel.id})`
		: titles[index]);
}
