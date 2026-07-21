# 节点重置路线图

本文件独立维护开发用的稳定编号、完成状态和实现顺序。用户 README 只说明已经发布的节点、用法和公开限制，不展示内部进度、下一项或排期。

## 当前状态

- 进度：`12 / 16` 个节点
- 下一项：#9 `SimpleLoadImage`
- 稳定编号继承重置计划，调整优先级时不重编号。
- 每次只重置一个节点；包骨架和非节点前端扩展不计入节点进度。
- `ParameterReceiver` 承接 #16 的职责，旧名称为 `ParameterBreak`。

## 已完成

| # | 当前实现 | 领域 | 职责 |
|---:|---|---|---|
| 1 | `SimpleStringSplit` | tools | 将文本拆分为清理后的字符串 list。 |
| 3 | `EnumSwitch` | tools | 按精确字符串 key 惰性选通同类型分支。 |
| 4 | `SimpleNotify` | tools | 在透明透传执行点提醒一次。 |
| 8 | `ResolutionPreset` | tools | 通过预设、精确输入或二维拖拽选择并输出对齐的宽高。 |
| 10 | `PromptCleaningMaid` | prompt | 原样透传，或按显式格式保守清理自然语言、规范化并去重标签列表。 |
| 11 | `PromptSelector` | prompt | 从独立词库跨分类选择、排序并加权输出提示词。 |
| 12 | `CharacterFeatureSwapNode` | prompt | 通过 DeepSeek 官方 API 迁移当前节点选中的单角色特征。 |
| 15 | `ParameterPanel` | control | 创作并直接输出最多 32 个参数。 |
| 16 | `ParameterReceiver` | control | 按当前绑定动态接收并透传面板对应的 KJ Get。 |
| 18 | `QuickGroupManager` | control | 按颜色范围统一启用、静音或绕过组，并配置排序与联动。 |
| 21 | `BooruGalleryNode` | gallery | 跨 Danbooru、Gelbooru、Safebooru 与 AI TAG 搜索自然比例瀑布流，保存有序选择并输出对应图片与 Prompt。 |
| 24 | `FetchFromKrita` | krita | 每次执行从 Krita 当前活动文档获取可见合成图与选区蒙版。 |

## 不再重置

| # | 旧节点 ID | 原因 |
|---:|---|---|
| 2 | `SimpleValueSwitch` | 实用价值不足，不在当前范围内。 |
| 5 | `WorkflowDescription` | ComfyUI 已原生提供 `MarkdownNote`，无需重复实现。 |
| 7 | `ModelNameExtractor` | 当前不需要单独提取模型名称。 |
| 14 | `SimpleCheckpointLoaderWithName` | 当前不需要额外提供模型名称和预览的检查点加载节点。 |
| 17 | `GroupIsEnabled` | 仅查询组启用状态，独立节点的实用价值不足。 |
| 19 | `GroupIgnoreManager` | 静音与绕过职责已合并到 #18 `QuickGroupManager`。 |
| 22 | `MultiCharacterEditorNode` | 当前不需要多角色提示词编辑能力。 |
| 25 | `SendToKrita` | 当前工作方式只需在 Krita 中提前准备活动文档和选区，再由 `FetchFromKrita` 执行时读取；不需要反向发送节点。 |

## 节点队列

| 顺序 | # | 旧节点 ID | 领域 | 目标职责 |
|---:|---:|---|---|---|
| 1 | 9 | `SimpleLoadImage` | tools | 加载本地图像和 mask。 |
| 2 | 6 | `VAEImageBatchFix` | tools | 修正 VAE batch 形态。 |
| 3 | 13 | `SimpleImageCompare` | media | 交互对比图像。 |
| 4 | 23 | `SaveImagePlus` | media | 提供更多控制的图像保存。 |

## 已完成的非节点扩展

| 前端扩展 | 职责 |
|---|---|
| Sidebar Workspace Presets | 以版本化快照保存全部侧边栏页面、布局、稳定绑定和参数值，并提供已修改/未保存状态、保存修改、放弃修改、另存为及事务化导入。 |
| Quick Group Navigation | 在 QuickGroupManager 行中直接定位，并在 Aaalice Workspace 维护手动添加、可配置组合键的组导航清单，不再占用画布悬浮入口。 |

## 更新规则

完成、砍掉或调整节点时，同一次变更必须更新：

1. 本文件的状态、队列和下一项。
2. English / 简体中文 README 的已包含节点、用户用法和公开限制；内部进度与下一项不得复制过去。
3. `docs/development/architecture.md` 的已注册节点与数据流。
4. 节点定义和前端文案对应的 en / zh locale。
