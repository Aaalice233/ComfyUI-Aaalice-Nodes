# 开发文档

本目录只保存需要长期维护的技术文档，并通过 `.comfyignore` 排除在 Registry 安装包之外。

`AGENTS.md` 是 AI 与协作者的开发上下文总入口。会影响实现或验收的文档必须同时以 `@相对路径` 登记在 `AGENTS.md`；本页只负责供人浏览和分类，不承担上下文注入。

## 文档入口

| 文档 | 面向对象 | 内容 |
|---|---|---|
| [English README](../README.md) / [中文 README](../README.zh-CN.md) | 用户 | 安装、节点用法、公开限制和预览进度 |
| [AGENTS.md](../AGENTS.md) | 协作者 | 开发硬规则和验收门槛 |
| [CONTEXT.md](../CONTEXT.md) | 产品与开发 | 领域词汇和统一称呼 |
| [架构](development/architecture.md) | 开发者 | 模块边界、状态真源和数据流 |
| [路线图](development/roadmap.md) | 维护者 | 稳定编号、完成状态和内部排期 |
| [测试](development/testing.md) | 开发者 | 静态、单测、隔离 GUI 和人工验收 runbook |
| [发布](development/release.md) | 发布者 | Registry 发布与发布后确认 |

## 设计与决策

- [UI 设计系统](design/ui-system.md)：主题 token、共享组件、状态和可访问性。
- [ParameterPanel 设计](design/parameter-panel.md)：节点面、结构编辑器、ParameterReceiver 和双模式渲染。
- [ADR 索引](adr/README.md)：当前有效和历史架构决策。

## 收录规则

- README 只写用户能观察或操作的内容，不写内部排期和测试过程。
- `AGENTS.md` 只写硬规则；具体命令和操作步骤进入对应 runbook。
- ADR 只记录难逆且存在真实方案取舍的决策。
- 一次性调查、聊天结论、本机故障记录、测试截图和已删除的未发布中间态不进入仓库。
