# 项目文档

本目录保存需要长期维护的内部技术文档，并通过 `.comfyignore` 排除在 Registry 安装包之外。用户安装、功能说明和公开限制只写入仓库根目录的双语 README。

`AGENTS.md` 是协作者与 AI 的开发上下文总入口。会影响实现或验收的专题文档必须同时以 `@相对路径` 登记在其中；本页只提供人工阅读入口与分类导航。

## 根目录文档

| 文档 | 面向对象 | 唯一职责 |
|---|---|---|
| [English README](../README.md) / [中文 README](../README.zh-CN.md) | 用户 | 安装、已发布节点、操作方法和公开限制 |
| [AGENTS.md](../AGENTS.md) | 协作者 | 开发硬规则、上下文路由和验收门槛 |
| [CONTEXT.md](../CONTEXT.md) | 产品与开发 | 领域词汇、身份概念和统一称呼 |

## `development/`

| 文档 | 内容 |
|---|---|
| [架构](development/architecture.md) | 当前模块边界、状态真源、生命周期和数据流 |
| [路线图](development/roadmap.md) | 内部编号、完成状态、下一项和开发排期 |
| [测试与验收](development/testing.md) | 自动检查、隔离 GUI、回归矩阵和人工验收 runbook |
| [性能优化规范](development/performance.md) | 富 DOM、虚拟列表、离屏降载、局部更新和性能归因边界 |
| [发布流程](development/release.md) | Registry 元数据、发布步骤和发布后确认 |

## `design/`

| 文档 | 内容 |
|---|---|
| [UI 设计系统](design/ui-system.md) | 原生节点分层、节点颜色、主题 token、共享组件、尺度、状态和可访问性 |
| [QuickGroupManager](design/quick-group-manager.md) | 顶栏、组列表、过滤、排序、联动和自适应尺寸 |
| [ResolutionPreset](design/resolution-preset.md) | 精确宽高、画幅坐标板、像素对齐、范围和个人预设管理 |
| [PromptSelector、词库与 DIY 侧边栏](design/prompt-selector-workspace.md) | 提示词选择、词库管理、页面布局、控件卡片和子图公开控件 |
| [Booru Gallery](design/booru-gallery.md) | 多站点能力、双行上下文工具栏、虚拟瀑布流、选择、详情、本地标签编辑和设置 |
| [Discord 分享](design/discord-share.md) | 入口迁移、最新运行相册、提示词绑定、成员验证和中继安全边界 |

`design/prompt-selector-sidebar-prototype.html` 是早期交互参考，只用于回看设计探索，不是现行规范、运行时代码或测试资产。当前行为以设计文档、架构、accepted ADR 和代码为准。

## `adr/`

[ADR 索引](adr/README.md) 记录当前有效和已替代的架构决策。ADR 只保存难逆、令人意外且存在真实取舍的协议或架构决定，不承担操作教程、视觉规范或调查记录职责。

## 收录与更新规则

- README 只写用户可以安装、观察或操作的内容，不写内部进度、下一项、测试过程或协作规则。
- `AGENTS.md` 只写必须长期执行的硬规则；长命令和操作步骤进入对应 runbook。
- `CONTEXT.md` 只统一术语，不记录路径、字段和实现方案。
- 架构文档描述当前实现；历史取舍进入 ADR；视觉和交互细节进入 `design/`。
- 一次性调查、聊天结论、本机故障记录、测试截图和未发布的废弃中间态不进入仓库。
- 新增、重命名或删除专题文档时，同步本页、`AGENTS.md` 的上下文入口及所有相对链接。

## 变更应该写到哪里

| 变化 | 必须更新 | 不应复制到 |
|---|---|---|
| 已发布功能、用法或公开限制 | 双语 README；必要时同步 locale | `AGENTS.md` 的实现规则 |
| 当前模块、状态真源或生命周期 | `development/architecture.md` | README 的用户教程 |
| 视觉语言、组件、布局或可访问性 | `design/ui-system.md` 和对应业务设计文档 | ADR 或路线图 |
| 节点完成状态、下一项或排期 | `development/roadmap.md` | README |
| 测试、隔离实例或人工验收步骤 | `development/testing.md` | `AGENTS.md` 的长命令 |
| 发布步骤和 Registry 检查 | `development/release.md` | 设计文档 |
| 难逆且存在真实取舍的架构决定 | 新增或更新 ADR，并维护 ADR 索引 | 当前架构说明中的历史调查 |
| 新术语或统一称呼 | `CONTEXT.md` | 实现路径和字段说明 |

一次变更可能同时影响多个职责。例如节点配色行为改变时，用户可见结果进入双语 README，跨节点视觉规则进入 `design/ui-system.md`，同步入口和模块边界进入架构文档；不要把同一段实现细节复制到每个文件。
