# ADR 0007：独立词库与实时词条引用

Status: Accepted.

## 决策

Prompt Library 使用 ComfyUI 用户目录中的独立 SQLite 存储，PromptSelector 只在工作流内保存有序 Prompt Entry ID 与权重。执行前端按 ID 解析当前词条正文并注入内部 payload，因此词库编辑会更新所有引用并参与缓存；词条缺失时保留失效引用并阻止执行。相比把完整词库或正文快照复制进每个工作流，这一方案避免多份真源和同步漂移；代价是工作流离开原用户词库后需要先导入对应词库备份。

词库备份使用带 manifest 与哈希资源的 ZIP，侧边栏预设保持为独立 JSON；二者不互相嵌套，以免布局恢复意外覆盖用户词库。
