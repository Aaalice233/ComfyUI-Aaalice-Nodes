# 节点重置路线图

本文件维护开发用的稳定编号、完成状态和实现顺序。用户 README 只展示当前进度、下一项和已发布节点，不复制完整排期。

## 当前状态

- 进度：`5 / 23` 个节点
- 下一项：#5 `WorkflowDescription`
- 稳定编号继承重置计划，调整优先级时不重编号。
- 每次只重置一个节点；包骨架和非节点前端扩展不计入节点进度。
- `ParameterReceiver` 承接 #16 的职责，旧名称为 `ParameterBreak`。

## 已完成

| # | 当前实现 | 领域 | 职责 |
|---:|---|---|---|
| 1 | `SimpleStringSplit` | tools | 将文本拆分为清理后的字符串 list。 |
| 3 | `EnumSwitch` | tools | 按精确字符串 key 惰性选通同类型分支。 |
| 4 | `SimpleNotify` | tools | 在透明透传执行点提醒一次。 |
| 15 | `ParameterPanel` | control | 创作并直接输出最多 32 个参数。 |
| 16 | `ParameterReceiver` | control | 通过稳定透传槽接收面板对应的 KJ Get。 |

## 不再重置

| # | 旧节点 ID | 原因 |
|---:|---|---|
| 2 | `SimpleValueSwitch` | 实用价值不足，不在当前范围内。 |

## 节点队列

| 顺序 | # | 旧节点 ID | 领域 | 目标职责 |
|---:|---:|---|---|---|
| 1 | 5 | `WorkflowDescription` | tools | 在画布中保存工作流说明。 |
| 2 | 17 | `GroupIsEnabled` | control | 输出组是否启用。 |
| 3 | 18 | `GroupMuteManager` | control | 批量静音工作流组。 |
| 4 | 19 | `GroupIgnoreManager` | control | 批量忽略工作流组。 |
| 5 | 10 | `PromptCleaningMaid` | prompt | 清洗并去重标签。 |
| 6 | 11 | `PromptSelector` | prompt | 从清单选择提示词。 |
| 7 | 12 | `CharacterFeatureSwapNode` | prompt | 交换角色特征。 |
| 8 | 21 | `DanbooruGalleryNode` | gallery | 搜索图库图像与标签。 |
| 9 | 22 | `MultiCharacterEditorNode` | gallery | 编辑多角色提示词。 |
| 10 | 7 | `ModelNameExtractor` | tools | 提取可读模型名。 |
| 11 | 14 | `SimpleCheckpointLoaderWithName` | media | 加载模型并输出名称与预览。 |
| 12 | 8 | `ResolutionMasterSimplify` | tools | 提供分辨率与尺寸辅助。 |
| 13 | 24 | `FetchFromKrita` | krita | 从 Krita 拉取内容。 |
| 14 | 25 | `OpenInKrita` | krita | 在 Krita 中打开内容，与 #24 配套实现。 |
| 15 | 9 | `SimpleLoadImage` | tools | 加载本地图像和 mask。 |
| 16 | 6 | `VAEImageBatchFix` | tools | 修正 VAE batch 形态。 |
| 17 | 13 | `SimpleImageCompare` | media | 交互对比图像。 |
| 18 | 23 | `SaveImagePlus` | media | 提供更多控制的图像保存。 |

## 非节点队列

| # | 前端扩展 | 前置条件 | 目标职责 |
|---:|---|---|---|
| 20 | Quick Group Navigation | #17–#19 | 从浮动界面快速导航工作流组。 |

## 更新规则

完成、砍掉或调整节点时，同一次变更必须更新：

1. 本文件的状态、队列和下一项。
2. English / 简体中文 README 的进度、下一项和已包含节点。
3. `docs/development/architecture.md` 的已注册节点与数据流。
4. 节点定义和前端文案对应的 en / zh locale。
