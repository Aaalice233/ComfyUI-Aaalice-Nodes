# 测试与验收

本文件是项目唯一测试 runbook。`AGENTS.md` 只保留验收门槛；具体命令、隔离方式和人工检查以这里为准。

## 1. 验证层级

按改动风险逐级扩大，不必为每次小改动机械运行全部 GUI 流程：

1. 静态检查：语法、JSON、格式和文档约束。
2. 受影响测试：对应 Python / JavaScript 单测。
3. 全量测试：公共模块、协议、注册、生命周期或发布前变更。
4. GUI 主路径：前端、slot、widget、序列化或浏览器副作用变化。
5. 人工系统验收：浏览器权限、系统通知、音频自动播放等必须依赖真实用户手势的能力。

纯文档修改可以只做文档、链接和格式检查；用户行为或公开协议变化仍需运行相关测试。

仅改变颜色、间距、圆角、字号或其它视觉样式，且不改变交互、尺寸协议、slot、序列化或执行行为时，默认不启动独立实例、不运行浏览器自动化或自动化测试；完成静态核对后交给用户在常用实例中硬刷新验证。用户明确要求自动验收时例外。若修改同时触及点击命中、节点放置、缩放或最小尺寸计算，则不属于纯样式，按风险进入受影响检查或 GUI 主路径。

## 2. 自动检查

从仓库根目录使用当前 ComfyUI 环境运行。PowerShell 的 `$ErrorActionPreference` 不会自动处理所有 native command 非零退出码，因此每一步都显式检查：

```powershell
$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess([string] $Name) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

$jsFiles = rg --files js tests -g '*.js'
Assert-NativeSuccess 'rg JavaScript files'
foreach ($file in $jsFiles) {
    node --check $file
    Assert-NativeSuccess "node --check $file"
}

npm test
Assert-NativeSuccess 'npm test'

../../.venv/Scripts/python.exe -m unittest discover -s tests -v
Assert-NativeSuccess 'Python unittest'

ruff check .
Assert-NativeSuccess 'ruff check'

Get-ChildItem locales -Recurse -Filter '*.json' | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 |
        ConvertFrom-Json | Out-Null
}

git diff --check
Assert-NativeSuccess 'git diff --check'
```

若 `rg`、`node`、`npm` 或 `ruff` 不可用，应报告缺失工具和未执行项，不能把跳过当成通过。

文档变更另查：

- Markdown 相对链接指向的文件是否存在。
- English / 简体中文 README 标题结构、节点清单、用法和公开限制是否对齐。
- ADR 状态和索引是否一致。
- `AGENTS.md` 是否少于 500 行。
- README 是否只保留用户信息，完整排期是否只存在于 `roadmap.md`。

## 3. 独立测试实例

用户通常已在 `127.0.0.1:8188` 运行日常 ComfyUI。自动验收不得停止、复用或修改该实例。

### 3.1 端口与隔离

- 默认从 `127.0.0.1:8189` 启动测试实例；若占用，依次选择其它空闲端口。
- 测试实例必须同时隔离 `user-directory`、数据库和日志。只设置 `--user-directory` 不能保证数据库隔离。
- 临时目录统一放在 `../../../logs/codex-e2e-<timestamp>/`，验收结束后只清理本轮创建的资源。
- 启动前记录命令和 PID；停止前再次核对 PID、命令行和端口，避免误停用户实例。

示例（端口按实际空闲值替换）：

```powershell
$ErrorActionPreference = 'Stop'

$comfyRoot = (Resolve-Path '../..').Path
$python = (Resolve-Path '../../.venv/Scripts/python.exe').Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path (Resolve-Path '../../../logs').Path "codex-e2e-$stamp"
$userDir = Join-Path $runRoot 'user'
$dbPath = (Join-Path $runRoot 'comfyui.db').Replace('\', '/')
$stdoutPath = Join-Path $runRoot 'stdout.log'
$stderrPath = Join-Path $runRoot 'stderr.log'
$port = 8189

New-Item -ItemType Directory -Force -Path $userDir | Out-Null

$arguments = @(
    'main.py',
    '--listen', '127.0.0.1',
    '--port', "$port",
    '--user-directory', $userDir,
    '--database-url', "sqlite:///$dbPath"
)

$process = Start-Process -FilePath $python `
    -ArgumentList $arguments `
    -WorkingDirectory $comfyRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

"PID=$($process.Id) URL=http://127.0.0.1:$port STDOUT=$stdoutPath STDERR=$stderrPath"
```

以日志中的 `To see the GUI go to:` 和 `web root:` 为准，不凭启动命令猜测服务已就绪。

停止测试实例前核对：

```powershell
$candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
$candidate | Select-Object ProcessId, ExecutablePath, CommandLine
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
```

确认命令行、PID 和端口属于本轮实例后，再使用 `Stop-Process -Id $process.Id`。

## 4. 日志与刷新

| 用途 | 路径或来源 |
|---|---|
| Desktop 主日志 | `../../../logs/comfyui.log` |
| Desktop 轮转日志 | `../../../logs/comfyui.log_*.log` |
| 默认 ComfyUI user 日志 | `../../user/comfyui.log`、`../../user/comfyui_PORT.log` |
| 独立测试实例 | 本轮 `codex-e2e-<timestamp>/` |
| 前端根目录 | server 日志中的 `web root:` |
| 前端错误 | Codex 内置浏览器 Console |

- Python、导入、注册和 HotReload 问题先看 server 日志；JS 行为看浏览器 Console。
- LG_HotReload 只处理 Python。JS 变化后必须硬刷新或重启 ComfyUI。
- slot、widget 或序列化结构变化后，删除旧节点实例并重新创建。
- `/object_info/<Node>` 只证明后端注册，不代表节点 UI、执行或副作用可用。

## 5. GUI 验收规则

GUI 自动验收只能使用 Codex 内置浏览器：

1. 不自行启动 Chrome / Edge，不连接 CDP，不引入 Playwright / Selenium，也不搭临时 GUI 测试框架。
2. 在独立实例的空白工作流中测试，不覆盖用户未保存的工作流。
3. 优先使用 role、label 和 `data-*` 定位；Canvas 确实无法语义定位时再使用坐标。
4. 每个操作后读取针对性状态；视觉结论需要截图，不能用整页文本代替断言。
5. 分别打开 Classic 和设置中的“现代节点设计（Nodes 2.0）”验证。工具栏的“画布模式”只是选择/平移模式，不是节点渲染模式。
6. 内置浏览器不可用或连接不稳定时立即停止 GUI 自动化，清理本轮临时资源，并明确交给用户手测。

若行为与预期不符，先按以下顺序判断：

1. 在同版本 ComfyUI 中用官方内置 V3 节点复现。
2. 查 [ComfyUI 官方文档](https://docs.comfy.org/) 和当前安装版本源码。
3. 官方节点同样复现时记录为上游或环境行为，不给本包增加私有时序补丁或兼容层。
4. 只有本包复现时，才沿本包生命周期和状态真源继续定位。

## 6. 通用 GUI 回归矩阵

涉及前端交互、slot、widget、尺寸协议或序列化时，Classic 与 Nodes 2.0 至少分别检查；纯样式修改按第 1 节交给用户刷新验证：

| 路径 | Classic | Nodes 2.0 |
|---|:---:|:---:|
| 新建节点与默认值 | ✓ | ✓ |
| 控件、菜单和真实 socket 可操作 | ✓ | ✓ |
| 执行成功且输出无截断 | ✓ | ✓ |
| 保存后重新加载 | ✓ | ✓ |
| 复制节点、撤销和重做 | ✓ | ✓ |
| 暗色 / 亮色与窄宽度（涉及视觉时） | ✓ | ✓ |
| 无阻断性 Console 错误 | ✓ | ✓ |

ParameterPanel / ParameterReceiver 还需覆盖绑定、显式同步、稳定 Parameter Id 重绑、源缺失和 KJNodes 缺失路径；EnumSwitch 需覆盖 lazy 分支、未知 key、未连接分支和显式选项同步。

SimpleNotify 还需覆盖：

- 桌面通知、声音分别单开、同时开启和同时关闭。
- 空消息的 English / 简体中文默认文案。
- `granted`、`default`、`denied` 和不支持 Notification API。
- 普通单值、list、连续 Queue，以及多个节点实例各提醒一次。
- 一个渠道失败不阻断另一渠道，工作流本身不因提醒失败而失败。
- 同类权限或音频错误单页面会话只 toast 一次。
- 右键“启用并测试提醒”读取当前 widget，并在用户操作中申请权限和播放测试音。

## 7. 必须人工确认的项目

浏览器安全策略要求真实用户手势。自动点击、合成事件、mock API 或单元测试只能验证代码路径，不能证明以下系统能力通过：

- 浏览器权限弹窗真实出现并能授予权限。
- Windows 桌面通知真实显示。
- 浏览器自动播放限制已由右键操作解除。
- 扬声器实际播放了提示音及音量符合预期。

人工验收时，在真实浏览器中右键 SimpleNotify，选择“🔔 启用并测试提醒”，确认权限、Windows 通知和声音。结果必须标为“人工通过”或“尚未人工验证”，不能由自动化代替。

## 8. 通过与交付

UI 通过必须同时满足：节点可创建、控件可操作、输出不截断、原生 socket 可命中、状态可保存恢复、执行结果正确、无阻断性前后端错误。

交付报告应区分：

- 已通过的自动检查。
- 已通过的 Classic / Nodes 2.0 路径。
- 已由用户真实手势确认的系统能力。
- 未执行项、原始阻碍和剩余风险。

禁止用 mock、旧截图、仅 `/object_info` 成功或“看起来正常”代替真实验收。
