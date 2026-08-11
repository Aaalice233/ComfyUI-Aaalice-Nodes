# ADR 0008：侧边栏使用稳定控件绑定

Status: Accepted.

## 背景

DIY 侧边栏需要跨保存、加载、节点改名、复制和工作流调整继续定位同一控件。节点标题、画布位置和临时 node id 都可能变化；按名称模糊匹配可能把预设值静默写入错误节点。子图还需要明确外部公开控件与内部实现的边界。

## 决策

DIY 侧边栏是原节点控件的投影，不拥有控件值。页面、布局组和控件卡片布局保存在工作流；实际值继续由原节点 widget 或 `node.properties` 持有。

控件卡片通过 Provider、稳定 Control Host ID 和 Control ID 精确绑定。节点标题、位置、显示标签和临时画布 ID 只用于展示或定位，不参与持久匹配。普通节点使用稳定 widget identity，子图只暴露子图整体公开的 promoted widget，不遍历内部节点。Promoted widget 的 Control ID 使用 `sourceNodeId`、`sourceWidgetName` 和可选 `disambiguatingSourceNodeId` 的源身份；即使公开名称相同，也必须保持不同绑定。

宿主复制时生成新 Host ID；检测到重复身份时修复副本，不修改原宿主。侧边栏写值必须经对应 Provider 写回原节点，并进入 ComfyUI 图变更与撤销边界。

普通绑定解析中，目标缺失或类型变化时保留 Missing Binding 并要求人工重绑，不按名称猜测。这个选择牺牲了“尽量自动恢复”的便利，换取工作流更新、节点改名、复制和子图重构时不把值静默写入错误目标。用户明确发起的外部预设“仅导入数值”属于受限迁移边界：它不修复 Binding 或恢复旧布局，只可按 [ADR 0014](0014-dashboard-value-import-recovery.md) 把互为唯一的源卡片值迁移到当前目标卡片。

Dashboard 布局备份可以携带布局、绑定和导出时的兼容控件值，但不包含 Prompt Library。导入先预检精确匹配、缺失目标和类型变化；不兼容值跳过，Missing Binding 保留，整次应用形成一个撤销边界。

工作流内的多套控件值预设使用独立的版本化集合，按同一稳定 Binding Key 保存 `valueType + payload`，不复制 Dashboard 布局。一个 Binding 即使投影到多个页面也只保存和写入一次。应用前完整预检，兼容值通过 Provider 在一个图变更边界内原子写回；写入中断时回滚已经应用的值。第三方适配器可以提供同步 preset codec，但不能绕过稳定身份、可序列化 payload、类型校验和 Provider 写回边界。

## 结果

- 侧边栏与原节点不会形成两份控件状态。
- 节点改名、移动和页面重排不会破坏有效绑定。
- 复制节点和子图重构不会因为名称相似而误写值。
- 缺失绑定需要用户明确修复，自动恢复能力受限但错误不会被隐藏。
- 子图内部结构可以独立演进，只要外部公开控件身份保持稳定。
