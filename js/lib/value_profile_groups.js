/** Profile-only group intent. Dashboard snapshots retain their exact-member codec. */
const nameKey = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
const enabledMember = (member, version) => Number(version) === 1 ? Number(member.mode) === 0 : member.enabled;

export function validateProfileGroups(payload) {
	if (![1, 2, 3].includes(Number(payload?.version)) || !Array.isArray(payload?.groups)) return "invalid-manager-state";
	const ids = new Set();
	for (const group of payload.groups) {
		if (group?.id == null || ids.has(String(group.id)) || !Array.isArray(group.nodes)) return "invalid-manager-state";
		ids.add(String(group.id));
		if (group.enabled != null && typeof group.enabled !== "boolean") return "invalid-manager-state";
		if (group.nodes.some((member) => member?.id == null || (Number(payload.version) === 1
			? ![0, 2, 4].includes(Number(member.mode)) : typeof member.enabled !== "boolean"))) return "invalid-manager-state";
	}
	return true;
}

export function captureProfileGroups(payload, groups) {
	const current = new Map(groups.map((group) => [String(group.id), group]));
	return { version: 3, groups: payload.groups.filter((group) => current.has(String(group.id))).map((group) => {
		const nodes = group.nodes.map((member) => ({ id: String(member.id), enabled: enabledMember(member, payload.version) }));
		const title = current.get(String(group.id))?.title || group.title || "";
		return { id: String(group.id), title, nodes,
			...(nodes.length && nodes.every((member) => member.enabled === nodes[0].enabled) ? { enabled: nodes[0].enabled } : {}),
		};
	}) };
}

export function planProfileGroups(payload, groups, basePayload = null, visibleGroups = groups) {
	const validation = validateProfileGroups(payload);
	if (validation !== true) throw new TypeError(validation);
	const byId = new Map(groups.map((group) => [String(group.id), group]));
	const scope = new Set(visibleGroups.map((group) => String(group.id)));
	const matches = payload.groups.map((saved) => {
		let group = byId.get(String(saved.id));
		let recovered = false;
		if (!group && nameKey(saved.title)) {
			const candidates = groups.filter((entry) => nameKey(entry.title) === nameKey(saved.title));
			if (candidates.length > 1) return { saved, status: "ambiguous", group: null, nodes: [] };
			group = candidates[0]; recovered = Boolean(group);
		}
		if (!group) return { saved, status: "missing", group: null, nodes: [] };
		if (!scope.has(String(group.id))) return { saved, status: "outOfScope", group, nodes: [] };
		const members = new Map((group.nodes || []).map((member) => [String(member.id), member]));
		const wholeGroup = Number(payload.version) === 3 && typeof saved.enabled === "boolean";
		const nodes = wholeGroup ? [...members.keys()].map((id) => ({ id, enabled: saved.enabled }))
			: saved.nodes.filter((member) => members.has(String(member.id))).map((member) => ({ id: String(member.id), enabled: enabledMember(member, payload.version) }));
		return { saved, group, nodes, recovered, status: !nodes.length ? "missing" : !wholeGroup && nodes.length < saved.nodes.length ? "partial" : "ready" };
	});
	const owners = new Map();
	for (const match of matches) if (match.group) {
		const key = String(match.group.id); const list = owners.get(key) || [];
		list.push(match); owners.set(key, list);
	}
	for (const list of owners.values()) if (list.length > 1) {
		const exact = list.filter((match) => !match.recovered);
		for (const match of list) if (exact.length !== 1 || match !== exact[0]) { match.status = "ambiguous"; match.nodes = []; }
	}
	const memberOwners = new Map();
	for (const match of matches.filter((entry) => ["ready", "partial"].includes(entry.status))) for (const member of match.nodes) {
		const entries = memberOwners.get(member.id) || []; entries.push({ match, enabled: member.enabled }); memberOwners.set(member.id, entries);
	}
	for (const entries of memberOwners.values()) if (entries.some((entry) => entry.enabled !== entries[0].enabled)) {
		for (const { match } of entries) match.status = "conflict";
	}
	const usable = matches.filter((match) => ["ready", "partial"].includes(match.status));
	const modes = new Map();
	for (const group of basePayload?.groups || []) for (const member of group.nodes || []) modes.set(String(member.id), enabledMember(member, basePayload.version));
	for (const match of usable) for (const member of match.nodes) modes.set(member.id, member.enabled);
	// Rebuild overlapping groups from one node-state map; no last-group-wins writes.
	const result = { version: 2, groups: groups.map((group) => ({ id: String(group.id), nodes: (group.nodes || [])
		.filter((member) => modes.has(String(member.id))).map((member) => ({ id: String(member.id), enabled: modes.get(String(member.id)) })) })) };
	return { payload: result, matches, applied: usable.length, skipped: matches.length - usable.length };
}

export function setProfileGroupEnabled(payload, savedId, group, enabled) {
	const next = { version: 3, groups: payload.groups.map((saved) => ({ ...saved,
		nodes: saved.nodes.map((member) => ({ id: String(member.id), enabled: enabledMember(member, payload.version) })),
	})) };
	const target = next.groups.find((saved) => String(saved.id) === String(savedId));
	if (!target) throw new TypeError("Missing profile group");
	Object.assign(target, { id: String(group?.id ?? target.id), title: group?.title || target.title || "", enabled,
		nodes: group ? (group.nodes || []).map((member) => ({ id: String(member.id), enabled })) : target.nodes.map((member) => ({ ...member, enabled })),
	});
	return next;
}
