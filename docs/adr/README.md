# Architecture Decision Records

ADR 只记录难逆、令人意外且存在真实方案取舍的当前或已发布决策。状态使用：

- `Accepted`：当前有效。
- `Superseded by ADR NNNN`：已发布决策被后继 ADR 替代，保留历史。
- `Rejected`：评估后未采用且结论仍有长期参考价值。

## 当前有效

| ADR | 核心决定 |
|---|---|
| [0003：工作流序列化是参数状态真源](0003-workflow-serialization-source-of-truth.md) | 参数定义和值保存在工作流，执行 payload 不是第二份持久状态。 |
| [0004：ParameterReceiver 使用可见 Get 与显式结构同步](0004-parameter-receiver-explicit-get-sync.md) | 路由保持可见，结构变化只在绑定或用户显式同步时应用。 |
| [0006：业务可变槽使用动态原生槽](0006-dynamic-native-business-slots.md) | 画布只物化当前业务需要的真实槽，不保留隐藏容量槽。 |
| [0007：独立词库与实时词条引用](0007-independent-prompt-library-live-references.md) | 词库独立持久化，节点按稳定 ID 实时解析正文。 |
| [0008：侧边栏使用稳定参数绑定](0008-stable-dashboard-control-bindings.md) | 侧边栏只投影原值，并按稳定宿主与参数身份精确绑定。 |
| [0009：Dashboard 使用结构化网格与可选布局组](0009-dashboard-grid-layout-groups.md) | 页面直接组织卡片；可选单层布局组与支持宽高跨度的十二列细分逻辑网格取代强制分区。 |
| [0010：Booru Gallery 使用能力适配、选择快照与虚拟瀑布流](0010-booru-gallery-capability-snapshots-masonry.md) | 多站点差异集中在 capability 适配器；排队保存独立选择快照，浏览使用有界 DOM 的自然比例瀑布流。 |
| [0011：Krita Bridge 使用短请求快照与显式失败](0011-krita-bridge-execution-snapshots.md) | ComfyUI 与 Krita 通过请求关联的本机临时文件交换执行快照，外部状态异常时整体失败。 |
| [0012：Dashboard 来源组使用可扩展作用域身份](0012-dashboard-source-scoped-groups.md) | Provider 定义可选来源作用域；ParameterPanel 用稳定 Separator 身份投影分区，Dashboard 保持领域无关。 |
| [0013：Dashboard 使用主参数与多目标绑定集](0013-dashboard-multi-target-binding-sets.md) | 一张卡片保留一个展示主参数，并通过原子 Binding Set 安全写入多个兼容目标。 |

## 已替代

- [ADR 0002：稳定参数身份与直接输出重绑](0002-parameter-stable-id-direct-output-rebind.md) — Superseded by ADR 0006

未发布的开发中间态在删除后不保留 ADR。
