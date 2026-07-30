# 测试与验收

本文件是项目唯一测试 runbook。`AGENTS.md` 只保留验收门槛；具体命令、隔离方式和人工检查以这里为准。

## 1. 验证层级

按改动风险逐级扩大，不必为每次小改动机械运行全部 GUI 流程：

1. 静态检查：语法、JSON、格式和文档约束。
2. 受影响测试：对应 Python / JavaScript 单测。
3. 全量测试：公共模块、协议、注册、生命周期或发布前变更。

涉及工作流持久状态的前端节点必须增加加载恢复契约：覆盖“默认状态已完成挂载或已发出请求后，再注入保存状态”的顺序，并断言 `loadedGraphNode` 仍会同步控件、按保存状态刷新派生内容，同时取消或淘汰先前的初始化请求。只测试模型序列化或 `onConfigure` 不足以证明刷新页面后的实际状态正确。
4. GUI 主路径：前端、slot、widget、序列化或浏览器副作用变化。
5. 人工系统验收：浏览器权限、系统通知、音频自动播放等必须依赖真实用户手势的能力。

纯文档修改可以只做文档、链接和格式检查；用户行为或公开协议变化仍需运行相关测试。

不涉及 slot、widget 尺寸协议、序列化或执行行为，且可在现有实例中硬刷新确认的局部前端视觉、布局和交互修改，默认只完成相关静态检查与单元测试，再交给用户在常用实例中实际验收；除非用户明确要求，不启动独立实例或浏览器自动化。画布原生命中、节点放置、缩放、动态槽和尺寸协议变化仍按风险进入 GUI 主路径。

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

自定义 DOM 节点不能以“节点库可搜索到”或“原生空壳已创建”作为前端通过标准。至少必须在隔离实例中真正创建节点并确认：

- 自定义根 DOM 已连接，关键 toolbar、输入控件和内容区各存在且数量正确；
- 首次同步挂载没有读取未初始化控制器，列表为空时触发的 near-end/render 回调也不会使挂载中断；
- Console 不存在该扩展的 `nodeCreated`、`loadedGraphNode`、`setup` 或挂载错误；
- 对 Gallery 等网络节点，至少一个来源能渲染真实卡片；前端契约单测不能替代这项浏览器验证。

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
| 节点增高、缩短及左右下角原生缩放手柄（涉及 DOM widget 时） | ✓ | ✓ |
| 加载低于新尺寸下限的旧节点，外框、背景和内容同步扩展且无透明空壳（修改默认或最小尺寸时） | ✓ | ✓ |
| 内部滚动区的未聚焦首次滚动、聚焦后普通滚动、焦点外画布行为及画布缩放修饰键（涉及滚动 DOM widget 时） | — | Standard / Legacy |
| 无阻断性 Console 错误 | ✓ | ✓ |

ParameterPanel / ParameterReceiver 还需覆盖绑定、显式同步、稳定 Parameter Id 重绑、源缺失和 KJNodes 缺失路径；参数或面板改名后应自动统一面板输出、KJ Set、托管 Get 与 Receiver 输入/输出名称，且无需结构同步；并覆盖面板位于父级图、Set/Get 被收进下级子图、新参数沿既有子图作用域补齐、跨子图双向定位和面板一键同步全部接收器。EnumSwitch 需覆盖 lazy 分支、未知 key、未连接分支和显式选项同步。

CharacterFeatureSwapNode 还需覆盖：

- DeepSeek mock 分别断言 `GET /models` 不携带 JSON Content-Type 或空 JSON body，`POST /chat/completions` 使用 `application/json` 请求体；认证 header 在两条路径保持一致。DeepSeek 会把带 JSON Content-Type 的空 GET body 判为无效 JSON。
- 请求必须显式携带 DeepSeek `thinking.type`；关闭时不得发送 `reasoning_effort`，启用时只允许 `high` 或 `max`。不要增加会被 DeepSeek 映射为 `high` 的伪 `low` / `medium` 档位。
- “测试连接”必须同时验证模型列表和一次真实 Chat Completion，不能只用 `/models` 成功代替生成路径可用；超时错误必须包含秒数、模型和思考档位。
- `original_prompt` 和 `character_prompt` 由上游 STRING 节点连接时，执行前自定义校验不得把连接占位值误判为空；真实空字符串只在 `execute()` 取得上游结果后显式失败。
- 默认八个特征及批量新增后，Tag 自动换行且末尾输入框始终可见或能通过 Tag 区域纵向滚动到达。
- 启用、停用、删除和排序后仍能继续输入新 Tag，输入焦点、回车提交和中英文逗号/换行批量解析正常。
- Classic 与 Nodes 2.0 分别从最小高度增高、再缩短，并从左下角和右下角重复拖拽；节点不得把任一次拉高后的 DOM 高度固化为新下限。
- 缩短时只有 Tag 内容区滚动，DOM overlay 不遮挡标题拖拽、原生缩放角、输入 socket 或输出 socket。

BooruGalleryNode 还需覆盖：

- 四个适配器的查询、分页、Rating、响应规范化、详情、分类标签、认证参数和 capability；不支持的收藏写入必须显式失败。
- Summary 搜索不逐帖 hydrate Detail；切换来源或重新搜索会中止旧请求，过期响应不渲染。
- Danbooru 周榜/月榜与 AI TAG 月榜走独立频道；Gelbooru、Safebooru 不显示未声明排行榜。逻辑页码统一从 1 开始，适配器分别正确转换 `page` 与零基 `pid`；刷新回到第 1 页，查询上下文变化回到第 1 页，跳页不预载前页。
- 双行上下文工具栏第一行原位展开搜索，中文 IME 输入期间不重建 input；不得监听全局 Queue 按钮或使用 `setInterval`。
- 10,000 条离线数据保持自然比例和最短列稳定顺序，可见卡片不超过 240；追加页不重排已有 placement，容器宽度变化才全量重排。
- 跨页多选、稳定去重、拖动排序、本地标签编辑与恢复、保存加载、复制、撤销重做和连续 Queue 独立快照。
- 并发原图下载后恢复选择顺序；任一图片下载、Content-Type、大小或解码失败时整节点失败，不跳项、不补黑图。
- Classic 与 Nodes 2.0 中验证默认尺寸、缩短增高和左右下角原生缩放；真实站点网络、认证、收藏和下载另作人工确认。

可用 `npm run benchmark:gallery` 运行不访问真实网站的 10,000 条布局基准。时间结果只作为本机观察值，CI 只断言有界可见数量。

SimpleNotify 还需覆盖：

- 桌面通知、声音分别单开、同时开启和同时关闭。
- 空消息的 English / 简体中文默认文案。
- `granted`、`default`、`denied` 和不支持 Notification API。
- 普通单值、list、连续 Queue，以及多个节点实例各提醒一次。
- 一个渠道失败不阻断另一渠道，工作流本身不因提醒失败而失败。
- 同类权限或音频错误单页面会话只 toast 一次。
- 右键“启用并测试提醒”读取当前 widget，并在用户操作中申请权限和播放测试音。

PromptSelector、词库与 DIY 侧边栏还需覆盖：

- PromptSelector 跨分类多选、节点内排序、权重、前缀、分隔符、词库实时编辑、缺失引用阻断，新建节点默认尺寸与可缩放下限均为 `440 × 560`，Nodes 2.0 下顶栏与底栏不得覆盖原生标题、输入输出槽和节点包标记，以及排队后最近使用记录、默认最近优先/手工词库顺序切换和旧库字段迁移。
- PromptSelector 词条列表的滚轮回归必须覆盖：初始焦点在画布时，把指针直接移入列表，不点击即可用第一段滚轮滚动；列表自身或 PromptSelector 内其它控件获得焦点时普通滚轮仍留在组件；外部文本输入获得焦点时，指针经过列表不会打断输入；移出并把焦点放回画布后恢复宿主行为；Standard 模式 `Ctrl` / `Meta` + 滚轮仍缩放画布；Legacy 模式遵循当前前端实现。静态测试必须锁定业务根的 `data-capture-wheel="true"`、列表 `tabindex="0"`、`pointerenter` 预先补焦点及外部编辑保护，并拒绝在目标 `wheel` 回调补焦点、`preventDefault()`、`stopPropagation()`、捕获阶段监听及自行构造 `WheelEvent`。
- `data-capture-wheel` 不属于 `addDOMWidget` 的公开稳定 API。ComfyUI Frontend 升级后先读取当前安装版本的 `useCanvasInteractions`（或后继实现），再用同版本官方内置 DOM widget 交叉验证；不能仅凭旧测试通过认定滚轮协议未变。
- 词库分类、收藏夹、默认收藏夹、标签、预览图、完整/筛选 ZIP、旧 JSON、冲突策略和损坏包回滚。
- 普通模式下节点右键始终可以添加参数；添加 Dialog 的页面下拉保持共享箭头样式，全选/全不选只影响当前允许添加的参数；编辑模式只开放布局操作。
- ParameterPanel 的侧边栏投影必须覆盖无 Separator、根分区、单个与多个 Separator、开头/连续/末尾空分区、单参数分区和 Separator 改名。添加 Dialog 按原顺序显示非空分区；自动组使用稳定 Separator Parameter Id 区分同名分区，后续新增复用完全匹配的组并保留用户组名，且不得把分区卡片归入同面板的旧无作用域来源组或重排既有卡片。
- 侧边栏适合范围调节的有界数值可拖动滑条；Seed 和无可靠范围的数字不显示误导性滑条。Seed 的锁定/解锁按钮与 ParameterPanel 复用同一组件及 `fixed` / `randomize` 状态，预设捕获、应用与回滚同时覆盖 Seed 数值及 `control_after_generate`。所有数字都可点击精确输入、滚轮和方向键按 step 调整，`Shift` 十倍加速；连续拖动或滚轮只产生一个图历史边界。枚举和布尔参数继续复用共享 Select 与 Switch。
- 侧边栏与 ParameterPanel 图像参数必须物化同一个 32px 共享控件：点击选择、文件拖入、拖放反馈、裁切缩略图、即时完整预览和清空交互保持一致；清空或上传后同步两处状态。执行时未选择图像或所选文件已不存在必须输出单张 `512 × 512` 纯黑 IMAGE，文件随后恢复时执行指纹必须失效旧缓存；解码、权限和其它真实读取错误仍明确失败。原生图像 Combo 还需分别覆盖 `input`、`output`、`temp` 目录和显式 `[type]` 标记，缩略图与悬浮大图必须请求真实目录。非图像文件和无文件名响应必须显示明确错误。
- 内置 `Preview Image` 侧边栏卡片覆盖执行前空态、恢复后的 `node.images`、新执行结果、批次切换、媒体区及键盘打开全窗口、最高 8 倍缩放、指针中心缩放、放大后拖动与边界收口、双击/按钮还原、Escape 关闭和销毁清理；同一批次在普通 Dashboard 重绘中不得反复生成缓存破坏 URL。内置 `Preview as Text` 覆盖标量、数组拼接、长文本内部滚动、空态、纯文本保真、安全 Markdown 与节点 `preview_mode` 切换。两者均只持久化 Binding 与布局，预设不保存执行输出。
- 原生 `Compare Images` 侧边栏卡片必须能通过媒体区点击或键盘打开全窗口查看器；查看器分别覆盖滚轮与按钮缩放、最高 8 倍限制、指针中心缩放、放大后拖动与边界收口、无手柄悬停分割与键盘微调、A 左/缩放居中/B 右的底栏布局及窄屏换行、A/B batch 切换、双击与适应屏幕还原、Escape 关闭，以及卡片销毁时关闭浮层。卡片与查看器中的图片都不得触发浏览器原生 `dragstart` 或被拖回 ComfyUI 画布。
- 侧边栏调参时对应 ParameterPanel 节点面实时重绘，手势结束后再广播完整参数变更；搜索为空提示严格遵守 `hidden`，存在可见参数且未搜索时不能占据页面底部。
- 完整侧边栏预设在普通模式和布局模式顶栏创建、应用、保存修改、另存、放弃修改、复制、重命名和删除；便携 JSON 导入要求确认名称，并在同一事务中创建、应用和选中新预设。多页面重复 Binding 只保存和写入一次。布局或参数偏离基准后保留预设名称，以斜体和末尾 `*` 表示修改，没有基准时显示中性占位的“选择预设”，同时说明差异数量；切换前覆盖保存/另存、放弃与取消路径。
- 缺失、移出侧边栏、类型变化、选项失效和第三方 codec 拒绝值均进入复核；确认后保留失效卡片并应用兼容内容，任一写入失败同时回滚布局和全部已写参数。内部预设和便携 JSON 共用快照协议，导入会创建并选中新基准预设；0.2.0 检测到旧版纯参数预设时直接清空并提示保存工作流。
- 参数卡片不显示常驻设置按钮；右键与 `ContextMenu` / `Shift+F10` 打开共享菜单，方向键和 Escape 可操作，危险移除有独立语义，文本输入仍保留浏览器原生右键编辑。Seed 和无范围数字采用标题行紧凑卡片，不被同一网格行的滑条卡片拉高。
- 页面、带页码层级的当前页标题、双击及 `Enter` / `F2` 原位重命名、页面空白处右键菜单及键盘菜单键、菜单内的重命名/复制/颜色/删除与布局模式附加操作、十二列细分网格、卡片宽高拖动与键盘调整、全程网格吸附、操作项碰撞时自身顺延且其它卡片保持原位、窄侧栏单列投影不回写规范宽度且布局组全部成员按顺序完整显示、不同纵向占位的参数卡片、矮卡片填充高卡片旁空位、分隔线、布局组、多选拖动、入组/移出组保持相对几何、整体移动、仅由按钮触发的整理布局、右侧页面 rail 悬停后所有圆点分别展开为胶囊、滚动期间不闪烁、当前指示器按实际按钮几何平移到目标圆点且展开时高亮整个胶囊、切页前后 rail DOM identity 不变、点击/滚轮/键盘切换与首尾停止、普通模式和布局模式下的边界自动翻页、拖拽期间不误翻页、V2 布局预设和 Missing Binding 手动重绑。
- QuickGroupManager 每行取景框按钮与侧边栏“组导航”都能把完整组边界适配到视口；侧边栏只显示手动添加的组，添加、移除、失效组保留、搜索、颜色、节点数量、启用状态、图变化刷新和未固定时定位后收起均正确。每组组合键支持多修饰键、拒绝裸键与重复占用，在输入控件和 Dialog 中不触发；每项 X/Y 画布偏移独立生效且默认归零，10%–300% 缩放默认 82%，非默认视图设置可见。导航清单、快捷键、偏移与缩放进入工作流事务并可保存、加载及撤销重做。
- 通用 widget、Aaalice 稳定 Parameter Id 与 Subgraph 整体公开 widget；不得解析子图内部节点。
- Classic 与 Nodes 2.0 分别保存、加载、复制宿主节点、撤销/重做、切换工作流和导入不兼容预设。
- Discord 分享分别验证工作区侧栏底栏纸飞机、顶栏、隐藏三态及重载持久化；底栏 GitHub、Discord 社区链接和右侧固定按钮保持可用，两处右键迁移后只能保留一个可见分享入口，设置必须能恢复隐藏入口。首次点击在没有运行结果时仍先完成 Discord 授权与目标服务器成员检测；非成员显示配置的社区邀请，成员验证成功后才以 Toast 提示运行工作流。右键 Preview Any 后保存/加载仍能解析提示词来源；连续两次运行只展示后一次成功执行的去重图像。主图信息栏不得覆盖图像，计数、文件名和尺寸必须垂直居中于同一水平轴线；紧凑缩略图使用窄竖片，上方图片、下方显示无空格完整分辨率，文件名保留在可访问名称中；底栏覆盖滚轮横向滚动、方向键和首尾切换。主图覆盖最高 8 倍缩放、指针中心滚轮缩放、按钮缩放、放大后拖动与边界收口、双击/按钮还原，以及切换图像后自动复位；缺失提示词禁用态保持正确。Footer 频道多选至少保留一项，只显示中继公开的 Target 名称，重开后恢复仍有效的选择并在 Target 变化时回退默认项；部分发送失败时只保留失败频道供重试。
- 中继纯逻辑覆盖 Origin 白名单、OAuth state、会话 TTL、成员/角色失败、速率和大小上限、Webhook Target 配置与去密钥公开列表、提示词代码块转义、单消息 Embed 上限、作者 mention 和多频道部分失败。速率测试必须断言按 Discord User Id 调用原生 Rate Limiting binding、拒绝时返回可机读重试时间，并且发送路径不再创建 `rate:*` KV 记录；绑定缺失或调用异常必须显式失败。每个所选频道只允许一次 Webhook 调用，payload 必须在同一消息中包含作者、图像附件和完整 fenced Prompt；超过单消息上限应明确拒绝。真实 Discord OAuth、退出服务器后的再次拒绝、Webhook 最终渲染和撤销会话属于外部系统验收，不得用 mock 结果声明通过。

## 7. 必须人工确认的项目

浏览器安全策略要求真实用户手势。自动点击、合成事件、mock API 或单元测试只能验证代码路径，不能证明以下系统能力通过：

- 浏览器权限弹窗真实出现并能授予权限。
- Windows 桌面通知真实显示。
- 浏览器自动播放限制已由右键操作解除。
- 扬声器实际播放了提示音及音量符合预期。
- Discord OAuth 弹窗、目标 Guild 成员身份和真实 Webhook 消息。

人工验收时，在真实浏览器中右键 SimpleNotify，选择“🔔 启用并测试提醒”，确认权限、Windows 通知和声音；Discord 分享使用真实成员和非成员账号分别验证一次，并确认单选和多选频道时，每个目标频道都只出现一条消息，且该消息同时包含 `作者：@用户`、所选图像及三反引号包裹的完整提示词。结果必须标为“人工通过”或“尚未人工验证”，不能由自动化代替。

## 8. 通过与交付

UI 通过必须同时满足：节点可创建、控件可操作、输出不截断、原生 socket 可命中、状态可保存恢复、执行结果正确、无阻断性前后端错误。

交付报告应区分：

- 已通过的自动检查。
- 已通过的 Classic / Nodes 2.0 路径。
- 已由用户真实手势确认的系统能力。
- 未执行项、原始阻碍和剩余风险。

禁止用 mock、旧截图、仅 `/object_info` 成功或“看起来正常”代替真实验收。
