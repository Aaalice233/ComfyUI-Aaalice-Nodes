# 节点重置路线图

本文件独立维护开发用的稳定编号、完成状态和实现顺序。用户 README 只说明已经发布的节点、用法和公开限制，不展示内部进度、下一项或排期。

## 当前状态

- 进度：`8 / 20` 个节点
- 下一项：#12 `CharacterFeatureSwapNode`
- 稳定编号继承重置计划，调整优先级时不重编号。
- 每次只重置一个节点；包骨架和非节点前端扩展不计入节点进度。
- `ParameterReceiver` 承接 #16 的职责，旧名称为 `ParameterBreak`。

## 已完成

| # | 当前实现 | 领域 | 职责 |
|---:|---|---|---|
| 1 | `SimpleStringSplit` | tools | 将文本拆分为清理后的字符串 list。 |
| 3 | `EnumSwitch` | tools | 按精确字符串 key 惰性选通同类型分支。 |
| 4 | `SimpleNotify` | tools | 在透明透传执行点提醒一次。 |
| 10 | `PromptCleaningMaid` | prompt | 原样透传，或按显式格式保守清理自然语言、规范化并去重标签列表。 |
| 11 | `PromptSelector` | prompt | 从独立词库跨分类选择、排序并加权输出提示词。 |
| 15 | `ParameterPanel` | control | 创作并直接输出最多 32 个参数。 |
| 16 | `ParameterReceiver` | control | 按当前绑定动态接收并透传面板对应的 KJ Get。 |
| 18 | `QuickGroupManager` | control | 按颜色范围统一启用、静音或绕过组，并配置排序与联动。 |

## 不再重置

| # | 旧节点 ID | 原因 |
|---:|---|---|
| 2 | `SimpleValueSwitch` | 实用价值不足，不在当前范围内。 |
| 5 | `WorkflowDescription` | ComfyUI 已原生提供 `MarkdownNote`，无需重复实现。 |
| 17 | `GroupIsEnabled` | 仅查询组启用状态，独立节点的实用价值不足。 |
| 19 | `GroupIgnoreManager` | 静音与绕过职责已合并到 #18 `QuickGroupManager`。 |

## 节点队列

| 顺序 | # | 旧节点 ID | 领域 | 目标职责 |
|---:|---:|---|---|---|
| 1 | 12 | `CharacterFeatureSwapNode` | prompt | 交换角色特征。 |
| 2 | 21 | `DanbooruGalleryNode` | gallery | 搜索图库图像与标签。 |
| 3 | 22 | `MultiCharacterEditorNode` | gallery | 编辑多角色提示词。 |
| 4 | 7 | `ModelNameExtractor` | tools | 提取可读模型名。 |
| 5 | 14 | `SimpleCheckpointLoaderWithName` | media | 加载模型并输出名称与预览。 |
| 6 | 8 | `ResolutionMasterSimplify` | tools | 提供分辨率与尺寸辅助。 |
| 7 | 24 | `FetchFromKrita` | krita | 从 Krita 拉取内容。 |
| 8 | 25 | `OpenInKrita` | krita | 在 Krita 中打开内容，与 #24 配套实现。 |
| 9 | 9 | `SimpleLoadImage` | tools | 加载本地图像和 mask。 |
| 10 | 6 | `VAEImageBatchFix` | tools | 修正 VAE batch 形态。 |
| 11 | 13 | `SimpleImageCompare` | media | 交互对比图像。 |
| 12 | 23 | `SaveImagePlus` | media | 提供更多控制的图像保存。 |

## 非节点队列

| # | 前端扩展 | 前置条件 | 目标职责 |
|---:|---|---|---|
| 20 | Quick Group Navigation | #18 | 从浮动界面快速导航工作流组。 |

## 已完成的非节点扩展

| 前端扩展 | 职责 |
|---|---|
| Sidebar Workspace Presets | 以版本化快照保存全部侧边栏页面、布局、稳定绑定和参数值，并提供已修改/未保存状态、保存修改、放弃修改、另存为及事务化导入。 |

## 更新规则

完成、砍掉或调整节点时，同一次变更必须更新：

1. 本文件的状态、队列和下一项。
2. English / 简体中文 README 的已包含节点、用户用法和公开限制；内部进度与下一项不得复制过去。
3. `docs/development/architecture.md` 的已注册节点与数据流。
4. 节点定义和前端文案对应的 en / zh locale。
