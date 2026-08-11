# Architecture Decision Records

ADR 只记录难逆、令人意外且存在真实方案取舍的当前或已发布决策。状态使用：

- `Accepted`：当前有效。
- `Superseded by ADR NNNN`：已发布决策被后继 ADR 替代，保留历史。
- `Rejected`：评估后未采用且结论仍有长期参考价值。

## 当前有效

| ADR | 核心决定 |
|---|---|
| [0007：独立词库与实时词条引用](0007-independent-prompt-library-live-references.md) | 词库独立持久化，节点按稳定 ID 实时解析正文。 |
| [0008：侧边栏使用稳定控件绑定](0008-stable-dashboard-control-bindings.md) | 侧边栏只投影原值，并按稳定宿主与控件身份精确绑定。 |
| [0009：Dashboard 使用结构化网格与可选布局组](0009-dashboard-grid-layout-groups.md) | 页面直接组织卡片；可选单层布局组与支持宽高跨度的十二列细分逻辑网格取代强制分区。 |
| [0010：Booru Gallery 使用能力适配、选择快照与虚拟瀑布流](0010-booru-gallery-capability-snapshots-masonry.md) | 多站点差异集中在 capability 适配器；排队保存独立选择快照，浏览使用有界 DOM 的自然比例瀑布流。 |
| [0011：Krita Bridge 使用短请求快照与显式失败](0011-krita-bridge-execution-snapshots.md) | ComfyUI 与 Krita 通过请求关联的本机临时文件交换执行快照，外部状态异常时整体失败。 |
| [0012：Dashboard 来源组使用可扩展作用域身份](0012-dashboard-source-scoped-groups.md) | Provider 定义可选来源作用域，Dashboard 保持领域无关。 |
| [0013：Dashboard 使用主控件与多目标绑定集](0013-dashboard-multi-target-binding-sets.md) | 一张卡片保留一个展示主控件，并通过原子 Binding Set 安全写入多个兼容目标。 |
| [0014：侧边栏仅数值导入使用唯一语义恢复](0014-dashboard-value-import-recovery.md) | 仅数值迁移以新版布局为权威，精确匹配失败后只恢复互为唯一的语义卡片。 |

未发布的开发中间态在删除后不保留 ADR。
