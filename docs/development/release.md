# Release

## Registry metadata

- Package: `comfyui-aaalice-nodes`
- Publisher: `aaalice`
- Registry readme: `README.md`
- Workflow: `.github/workflows/publish.yml`
- Secret: `REGISTRY_ACCESS_TOKEN`

## 发布前

1. 确认工作区只包含本次发布内容，测试和构建产物未被跟踪。
2. 更新 `pyproject.toml` version，并确认 packages 覆盖全部已实现节点域。
3. 同步 English / 简体中文 README、locale 和公开限制。
4. 检查 `.comfyignore`：排除协作文件、测试、缓存和本地产物，但保留运行时代码、assets、README 与 LICENSE。
5. 运行 [`testing.md`](testing.md) 中与改动风险匹配的检查。
6. 验证干净安装至少能导入节点、打开 UI 并执行最小工作流。

## 发布

推送包含 `pyproject.toml` 版本变化的提交到 `main`，或手动运行 **Publish to Comfy Registry** workflow。GitHub Actions 使用 `Comfy-Org/publish-node-action` 发布。

发布失败时保留 Action 原始日志，优先检查版本是否已存在、PublisherId、Secret 和包内容；不得通过跳过测试或改写历史制造成功。

## 发布后

- 在 Registry / Manager 确认新版本、图标、banner 和 README 正常显示。
- 从发布包安装一次，确认 `.comfyignore` 没有误排运行时文件。
- 记录真实用户可见的 breaking change；内部重构和测试流水不写入 README。
