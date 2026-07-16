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
| [发布流程](development/release.md) | Registry 元数据、发布步骤和发布后确认 |

## `design/`

| 文档 | 内容 |
|---|---|
| [UI 设计系统](design/ui-system.md) | 主题 token、共享组件、尺度、状态和可访问性 |
| [参数系统](design/parameter-system.md) | ParameterPanel、ParameterReceiver、结构编辑器和双模式布局 |
| [QuickGroupManager](design/quick-group-manager.md) | 顶栏、组列表、过滤、排序、联动和自适应尺寸 |

## `adr/`

[ADR 索引](adr/README.md) 记录当前有效和已替代的架构决策。ADR 只保存难逆、令人意外且存在真实取舍的协议或架构决定，不承担操作教程、视觉规范或调查记录职责。

## 收录与更新规则

- README 只写用户可以安装、观察或操作的内容，不写内部进度、下一项、测试过程或协作规则。
- `AGENTS.md` 只写必须长期执行的硬规则；长命令和操作步骤进入对应 runbook。
- `CONTEXT.md` 只统一术语，不记录路径、字段和实现方案。
- 架构文档描述当前实现；历史取舍进入 ADR；视觉和交互细节进入 `design/`。
- 一次性调查、聊天结论、本机故障记录、测试截图和未发布的废弃中间态不进入仓库。
- 新增、重命名或删除专题文档时，同步本页、`AGENTS.md` 的上下文入口及所有相对链接。
