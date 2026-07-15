# 开发文档

本目录只存放项目的持久技术文档，并通过 `.comfyignore` 排除在 Registry 安装包之外。用户安装与使用说明位于根目录 [README](../README.md) / [中文 README](../README.zh-CN.md)，开发硬规则位于 [AGENTS.md](../AGENTS.md)，领域词汇位于 [CONTEXT.md](../CONTEXT.md)。

## 架构决策

[`adr/`](adr/) 记录难逆、存在真实取舍且仅看代码无法解释的决策。当前索引见 [ADR README](adr/README.md)。

## 设计规范

- [UI 设计系统](design/ui-system.md)：主题 token、共享组件、状态与可访问性规则。
- [ParameterPanel](design/parameter-panel.md)：节点面、参数控件、结构编辑器与双模式渲染。

## 开发说明

- [Architecture](development/architecture.md)：节点、前端模块、数据流和状态真源。
- [Testing](development/testing.md)：静态检查、后端测试和双模式 GUI 回归。
- [Release](development/release.md)：Registry 发布前检查与 GitHub Actions 流程。

## 收录原则

- 一次性调查记录、聊天结论、截图和本机故障笔记不进入仓库。
- 面向普通用户的行为写入双语 README，不在开发文档重复维护。
- 硬性规则写入 AGENTS.md；本目录解释结构、设计和可重复操作。
- 已删除且未发布的开发中功能不保留迁移说明或历史文档。
