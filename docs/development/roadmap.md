# 节点重置路线图

本文件独立维护开发用的稳定编号、完成状态和实现顺序。用户 README 只说明已经发布的节点、用法和公开限制，不展示内部进度、下一项或排期。

## 当前状态

- 进度：`10 / 10` 个节点
- 下一项：无
- 稳定编号继承重置计划，调整优先级时不重编号。
- 每次只重置一个节点；包骨架和非节点前端扩展不计入节点进度。

## 已完成

| # | 当前实现 | 领域 | 职责 |
|---:|---|---|---|
| 1 | `SimpleStringSplit` | tools | 将文本拆分为清理后的字符串 list。 |
| 4 | `SimpleNotify` | tools | 在透明透传执行点提醒一次。 |
| 8 | `ResolutionPreset` | tools | 通过预设、精确输入或二维拖拽选择并输出对齐的宽高。 |
| 11 | `PromptSelector` | prompt | 从独立词库跨分类选择、排序并加权输出提示词。 |
| 17 | `GroupIsEnabled` | control | 队列提交时快照可视组成员模式，报告是否被完全禁用。 |
| 18 | `QuickGroupManager` | control | 按颜色范围统一启用、静音或绕过组，并配置排序与联动。 |
| 21 | `BooruGalleryNode` | gallery | 跨 Danbooru、Gelbooru、Safebooru 与 AI TAG 搜索或无重复随机抽取自然比例瀑布流；节点与 Dashboard 共享完整多视图运行时，组件状态受 Dashboard 预设控制，并保存有序选择、输出对应图片与 Prompt。 |
| 24 | `FetchFromKrita` | krita | 每次执行从 Krita 当前活动文档获取可见合成图与选区蒙版。 |
| 27 | `GroupLogicProbe` | control | 多条组启用/禁用条件按 AND/OR 组合，队列提交时快照求值并输出单个布尔用于懒执行分支。 |
| 28 | `ConditionalSaveImage` | tools | 仅在启用时复用现有保存实现，关闭时透明透传图像。 |

## 不再重置

| # | 旧节点 ID | 原因 |
|---:|---|---|
| 2 | `SimpleValueSwitch` | 实用价值不足，不在当前范围内。 |
| 5 | `WorkflowDescription` | ComfyUI 已原生提供 `MarkdownNote`，无需重复实现。 |
| 6 | `UniversalVAEEncode` | 独立图片改用 ComfyUI 原生 list 映射逐张执行完整处理链，视频继续使用原生 VAE Encode；额外编码节点已在发布后移除。 |
| 7 | `ModelNameExtractor` | 当前不需要单独提取模型名称。 |
| 9 | `SimpleLoadImage` | ComfyUI 原生 `Load Image` 已覆盖图像与 mask 加载；默认黑图不能解决实际输入图像的工作流资产分享问题。 |
| 10 | `PromptCleaningMaid` | 当前不再提供提示词清理能力；已在发布后移除。 |
| 13 | `SimpleImageCompare` | ComfyUI 原生 `Compare Images` 已覆盖交互对比；本包只将其执行视图投影到参数控制侧边栏，不再重复实现节点。 |
| 14 | `SimpleCheckpointLoaderWithName` | 当前不需要额外提供模型名称和预览的检查点加载节点。 |
| 19 | `GroupIgnoreManager` | 静音与绕过职责已合并到 #18 `QuickGroupManager`。 |
| 22 | `MultiCharacterEditorNode` | 当前不需要多角色提示词编辑能力。 |
| 23 | `SaveImagePlus` | 不再提供附加预览输出与重复元数据逻辑；条件保存由 #28 `ConditionalSaveImage` 负责。 |
| 25 | `SendToKrita` | 当前工作方式只需在 Krita 中提前准备活动文档和选区，再由 `FetchFromKrita` 执行时读取；不需要反向发送节点。 |
| 26 | `PromptAssistantBridge` | 提示词小助手已自带提示词优化节点，桥接节点不再必要；已在发布后移除。 |

## 节点队列

当前无待重置节点。

## 已完成的非节点扩展

| 前端扩展 | 职责 |
|---|---|
| Sidebar Workspace Presets | 以版本化快照保存全部侧边栏页面、布局、稳定绑定和控件值，并提供已修改状态、保存修改、放弃修改、另存为及事务化导入；常见模型参数支持确认后按唯一文件名适配本机嵌套目录，缺失或同名歧义时仍写入新预设值并明确诊断，避免沿用旧预设模型；导入默认仅数值并复制基础预设后套用、切换到新副本，完整模式也额外创建命名预设且预警失效绑定，任何模式都不覆盖已有预设；预设随工作流 extra 分发。 |
| Dashboard Layout Editor | 以统一选区真源支持框选、跨组批量移动、明确插入/碰撞链预览、边缘连续滚动和键盘微调；控件卡片按实际宽高切换响应式内部布局。 |
| Quick Group Navigation | 在 QuickGroupManager 行中直接定位，并在 Aaalice Workspace 维护手动添加的组导航清单；支持版本 3 工作流持久化、反引号键（`Backquote`，Tab 上方）为默认按住式组跳转轮盘激活键，可在工作流中改为其它单个按键、鼠标/键盘即时选择、分页和缺失组提示，不再占用画布悬浮入口。 |

## 更新规则

完成、砍掉或调整节点时，同一次变更必须更新：

1. 本文件的状态、队列和下一项。
2. English / 简体中文 README 的已包含节点、用户用法和公开限制；内部进度与下一项不得复制过去。
3. `docs/development/architecture.md` 的已注册节点与数据流。
4. 节点定义和前端文案对应的 en / zh locale。
