# ADR 0004：ParameterReceiver 使用可见 Get 与显式结构同步

Status: Accepted.

## 背景

ParameterReceiver 需要集中接收 ParameterPanel 对应的 KJ Get 值。若把路由藏在不可见 payload 中，工作流难以检查；若源面板每次编辑都自动创建、删除或移动远端节点，又会造成难以预期的图结构变化。

## 决策

ParameterReceiver 是真实的 32 路后端透传节点。前端绑定会创建或复用 KJ Set，创建可见的折叠 KJ Get，并把 Get 连接到接收器的原生输入。KJNodes 不可用时明确失败，不模拟路由。

后端的 32 路声明只是执行上限；画布按当前绑定动态创建真实槽，不保留未使用槽。动态槽决策见 [ADR 0006](0006-dynamic-native-business-slots.md)。

绑定身份由 ParameterPanel 节点 id 与稳定 Parameter Id 共同确定。名称和类型可以自动刷新；新增、删除、重排或托管连线损坏只标记为“需要同步”。只有首次绑定或用户显式同步时，才允许在一个图变更边界内调整结构；影响已有连线或额外 Get 使用者时必须确认。

## 结果

- 工作流中的路由可见、可检查，socket 和连线保持原生语义。
- 编辑源面板不会静默创建或删除远处节点。
- 结构同步是用户可预期、可撤销的明确操作。
