# Testing

## 最小检查

从仓库根目录运行：

```powershell
$ErrorActionPreference = 'Stop'

$jsFiles = rg --files js tests -g '*.js'
foreach ($file in $jsFiles) {
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "node --check failed: $file" }
}

npm test
../../.venv/Scripts/python.exe -m unittest discover -s tests -v
ruff check .

Get-ChildItem locales -Recurse -Filter '*.json' | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
}

git diff --check
```

上述命令应逐项检查退出码；PowerShell 不会因为所有 native command 返回非零而自动停止。JSON locale 必须使用真实解析器读取，不能只检查括号或文本差异。公共模块、协议或核心流程变更后扩大测试范围；纯文档修改不要求运行后端测试。

文档变更还需检查 Markdown 相对链接、双语 README 标题结构、ADR 状态链和 `AGENTS.md` 行数。链接到历史 ADR 的内容允许描述旧设计，但 active 文档不得把 superseded 结构写成当前规则。

## 日志位置

路径相对仓库根目录，实际端口和前端根以当次日志为准。

| 用途 | 路径或来源 |
|---|---|
| Desktop 主日志 | `../../../logs/comfyui.log` |
| 轮转日志 | `../../../logs/comfyui.log_*.log` |
| ComfyUI user 日志 | `../../user/comfyui.log`、`../../user/comfyui_PORT.log` |
| 前端根目录 | 日志中的 `web root:` |
| E2E 证据 | `../../../logs/codex-e2e-<timestamp>/` |

Python 导入、节点注册和 HotReload 问题查看 server 日志；JS 行为查看浏览器 Console。GUI 地址从 `To see the GUI go to:` 获取，不假定 8188 或 8189。

## 前端刷新规则

- LG_HotReload 只处理 Python，JS 改动后必须硬刷新或重启 ComfyUI。
- slot、widget 或序列化结构变更后，删除画布上的旧节点并重新创建。
- `/object_info/<Node>` 只证明后端注册，不代表 UI 可用。

## GUI 回归矩阵

ParameterPanel 前端改动至少覆盖：

| 路径 | Classic | Nodes 2.0 |
|---|:---:|:---:|
| 新建节点与默认参数 | ✓ | ✓ |
| 修改 slider / enum / Seed | ✓ | ✓ |
| 打开结构编辑器并保存 | ✓ | ✓ |
| 输出显示、拖线与连接态颜色 | ✓ | ✓ |
| 保存并重新加载工作流 | ✓ | ✓ |
| Operation Panel 同步值 | ✓ | ✓ |
| Operation Panel 展开/收起且保留顶栏、侧栏 | ✓ | ✓ |
| 节点与 Subgraph 右键加入、面板内移除 | ✓ | ✓ |
| 页面新增、命名、排序、删除、默认页与撤销 | ✓ | ✓ |
| 多选、拖动、宽度、组合、轮播、解组与撤销 | ✓ | ✓ |
| 轮播最高高度、箭头、键盘、横向滚动与触控 | ✓ | ✓ |
| 1440/1920 最小基准、自适应窗口与窄窗口滚动 | ✓ | ✓ |

涉及特定控件时增加键盘、focus、hover、暗色/亮色主题和窄宽度检查。

## Codex 内置浏览器验收

1. GUI 自动验收只能使用 Codex 内置浏览器访问用户当前的 ComfyUI 页面。
2. 禁止自行启动 Chrome / Edge、连接 CDP、引入 Playwright / Selenium，或创建隔离浏览器与临时 GUI 测试框架。
3. 在空白工作流或新标签中测试，不覆盖用户未保存的工作流。
4. 优先用 DOM role、label、`data-*` 定位；Canvas 交互确有必要时才使用坐标。
5. 每个操作后读取针对性状态；视觉验收再截图，不用整页文本代替断言。
6. 内置浏览器不可用或无法稳定连接时立即停止 GUI 自动化，清理本轮临时资源并交由用户手测。

无法完成 GUI 验收时应如实报告已完成的静态检查、现有单元测试和剩余风险，不得用 mock、旧截图或伪造结果制造通过。

## 通过标准

UI 通过必须同时满足：节点可创建、控件可见可操作、输出不截断、原生 socket 可命中、状态可保存恢复、无阻断性前端错误。无法自动化的视觉项必须列为人工检查，不得省略。
