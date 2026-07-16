# ADR 0002：稳定参数身份与直接输出重绑

Status: Superseded by ADR 0006.

后继决策见 [ADR 0006：业务可变槽使用动态原生槽](0006-dynamic-native-business-slots.md)。

## 背景

用户会频繁新增、删除、重排和重命名参数。如果只按输出 slot 索引对齐，结构变化后下游连线可能在没有提示的情况下指向错误值。

## 决策

每个参数拥有一个隐藏、稳定且作用域限定在 ParameterPanel 内的 **Parameter Id**。完整身份是 `node_id + parameter_id`。

ParameterPanel 固定提供最多 32 个直接输出。`slotMeta` 将每个可见输出映射到 Parameter Id；兼容的结构变化按 Parameter Id 重绑已有连线，而不是按 slot 位置重绑。

删除已连接参数会跨越身份边界。编辑器必须列出受影响连线，并在明确确认后断开。复制参数会创建新身份，不复制连线。

## 结果

- 参数改名和重排不会改变其下游语义。
- 删除和复制不会静默复用旧身份。
- 隐藏协议槽仍需保持稳定，不能通过动态删槽简化实现。
