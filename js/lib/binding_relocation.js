/** Pure orphaned-binding relocation used by the provider registry. No ComfyUI runtime dependencies. */

/**
 * hostId 找不到宿主时的最后手段：绑定持久化后节点可能被替换（删除原节点、粘贴副本被修复重发
 * hostId 等），此时用剩余身份（provider + controlId）在全图候选中重定位。controlId 对
 * promoted 子图控件携带内部节点身份，不同子图定义间唯一；同名普通控件或多个同定义实例
 * 会产生多个候选，保持 missing 绝不猜测。命中唯一候选时在结果上标记 relocatedHostId，
 * 供上层按需把绑定迁移到新宿主。
 */
export function relocateOrphanedBinding({ provider, binding, nodes, hostIdOf }) {
	const candidates = nodes instanceof Map ? [...nodes.values()] : (nodes || []);
	let match = null;
	for (const candidate of candidates) {
		if (!hostIdOf(candidate) || !provider?.supportsNode?.(candidate)) continue;
		let resolved = null;
		try { resolved = provider.resolve(candidate, binding); } catch { continue; }
		if (resolved?.status !== "ok") continue;
		if (match) return { status: "missing" };
		match = resolved;
	}
	if (!match) return { status: "missing" };
	return { ...match, relocatedHostId: hostIdOf(match.node) || null };
}
