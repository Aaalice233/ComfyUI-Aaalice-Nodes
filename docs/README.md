# 项目文档

本目录只存放项目的持久技术文档。用户安装与使用说明位于根目录 [README](../README.md) / [中文 README](../README.zh-CN.md)，开发硬规则位于 [AGENTS.md](../AGENTS.md)，领域词汇位于 [CONTEXT.md](../CONTEXT.md)。

## 架构决策

[`adr/`](adr/) 记录难以逆转、存在真实取舍且仅看代码无法解释的决策。当前决策索引见 [ADR README](adr/README.md)。被替代的 ADR 保留历史，但必须明确链接后继决策。

## 设计规范

- [Herdi-inspired UI](design/herdi-inspired-ui.md)：主题 token、组件库、ParameterPanel 节点面与 Operation Panel 的视觉和交互规则。

## 开发说明

- [Architecture](development/architecture.md)：当前节点、模块边界、数据流和状态真源。
- [Testing](development/testing.md)：静态检查、后端测试、双模式 GUI 回归和证据要求。
- [Release](development/release.md)：Registry 发布前检查与 GitHub Actions 流程。

## 收录原则

- 一次性调查记录、聊天结论、截图和本机故障笔记不进入仓库。
- 面向普通用户的行为写入双语 README，不在开发文档重复维护。
- 硬性规则写入 AGENTS.md；本目录解释结构、原因和可重复操作。
- 通用工具教程只有在本项目确实依赖该流程时才保留。
