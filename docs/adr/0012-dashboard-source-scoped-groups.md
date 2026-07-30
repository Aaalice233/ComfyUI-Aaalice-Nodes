# ADR 0012：Dashboard 来源组使用可扩展作用域身份

**Status:** Accepted

## Context

Dashboard 原先只用 `provider + hostId` 表示来源组，适合一个 ParameterPanel 对应一个布局组，但无法表达面板内部由 Separator 建立的多个语义分区。若由 Workspace 或 Dashboard 直接解析 ParameterPanel 参数结构，会把领域规则扩散到视图和持久模型；若使用 Separator 显示名匹配，改名与同名分区又会造成身份漂移。

## Decision

来源组身份扩展为 `provider + hostId + optional scopeId`。`scopeId` 是 Provider 定义的稳定、不透明作用域，Dashboard 只负责规范化、持久化和精确匹配，不解释其内容。

ParameterPanel Provider 使用 Separator 的稳定 Parameter Id 生成 `separator:<id>` 作用域，并在列出控件前完成有序分区。Separator 本身不成为卡片；空分区省略；第一个 Separator 之前的参数保留无作用域根分区。存在实际 Separator 分区时，每个非空分区都请求自动成组，包括单参数分区。没有 Separator 的面板继续沿用同一 Host 下两张卡片才成组的行为。

自动归组只操作本次新增卡片：优先复用完全匹配的来源组，保留用户修改后的组名、颜色和布局；找不到时才按 Provider 提示创建。旧的无 `scopeId` 数据继续有效，未声明来源的旧手工组只为无作用域来源保留成员匹配兼容。系统不自动拆分、迁移或整理已有布局。

## Consequences

- Provider 可以在不修改 Dashboard 命令层的情况下为其它领域增加稳定子作用域。
- Separator 改名不影响已有组身份，同名 Separator 也不会合并。
- 工作流与侧边栏预设会持久化可选 `scopeId`，旧数据无需迁移。
- 已经把多个 Separator 分区混在一个旧组中的工作流保持原样；用户重新添加或手工整理时才产生新结构。
