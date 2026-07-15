# Architecture Decision Records

ADR 只记录难逆、令人意外且存在真实方案取舍的决策。状态使用：

- `Accepted`：当前有效。
- `Superseded by ADR NNNN`：历史决策，已被后继 ADR 替代。
- `Rejected`：评估后未采用。

## 当前有效

- [ADR 0002：稳定参数身份与直接输出重绑](0002-parameter-stable-id-direct-output-rebind.md)
- [ADR 0003：工作流序列化是参数状态真源](0003-workflow-serialization-source-of-truth.md)
- [ADR 0005：单 ParameterPanel 与分页 Operation Panel](0005-single-parameter-panel-and-operation-pages.md)

## 历史决策

- [ADR 0001：节点值面与常驻侧栏编辑器](0001-dual-surface-parameter-ui.md) → 被 ADR 0004 替代
- [ADR 0004：节点内结构编辑与通用 Operation Panel](0004-node-authoring-and-operation-panel.md) → 被 ADR 0005 替代

不要删除 superseded ADR；它们解释了当前设计为何不是早期方案。
