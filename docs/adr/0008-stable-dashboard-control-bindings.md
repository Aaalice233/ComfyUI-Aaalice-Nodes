# ADR 0008：侧边栏使用稳定参数绑定

Status: Accepted.

## 决策

DIY 侧边栏是原节点参数的投影，不拥有参数值。页面布局保存到工作流，参数卡片通过稳定 Control Host ID、Provider 和 Control ID 精确绑定；节点标题、位置、显示标签和临时画布 ID 不参与自动匹配。普通节点使用 widget identity，Aaalice 参数使用领域稳定 ID，子图只使用子图整体对外公开的 promoted widget。

目标缺失或类型变化时保留 Missing Binding 并要求人工重绑，不按名称猜测。这个选择牺牲了“尽量自动恢复”的便利，换取工作流更新、节点改名、复制和子图重构时不把参数值静默写入错误目标。
