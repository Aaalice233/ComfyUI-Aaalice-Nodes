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

npm run check:file-length
Assert-NativeSuccess 'source file length check'

npm test
Assert-NativeSuccess 'npm test'

# npm test 已包含本包相对路径和 named import/export 的前端契约检查；单独运行时：
node --test tests/frontend_import_paths.test.js
Assert-NativeSuccess 'frontend import path contract'

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
- 第一方 JS / TS / Vue / Python / CSS / SCSS 是否以 600 行为目标且没有超过 800 行硬上限；`npm test` 已串联 `check:file-length`，601–800 行会列出维护性警告，超过 800 行直接失败。测试、脚本和部署代码同样统计，只有 `js/vendor/**` 与常规依赖、缓存和构建产物按精确规则排除。
- 前端模块拆分或入口调整后，`tests/frontend_import_paths.test.js` 是否通过；该测试覆盖本包相对路径与 named export 链，不能替代浏览器 Console、真实 ComfyUI 入口和 GUI 主路径验收。
- README 是否只保留用户信息，完整排期是否只存在于 `roadmap.md`。

## 3. 日志与刷新

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
- 前端修改后必须硬刷新或重开 ComfyUI 页面；后端修改、服务端注册或执行链变化后，必须完整重启 ComfyUI 后重新载入工作流副本。
- slot、widget 或序列化结构变化后，删除旧节点实例并重新创建。
- `/object_info/<Node>` 只证明后端注册，不代表节点 UI、执行或副作用可用。

## 4. GUI 验收规则

GUI 主路径由用户在真实 ComfyUI 页面中人工验收；不能用脚本点击、合成事件、mock API 或静态源码检查替代真实交互：

1. 默认载入调用方提供的工作流副本；只有没有提供工作流或目标本身要求空图时，才使用空白工作流，不覆盖用户未保存的工作流。
2. 每个操作后读取针对性状态；视觉结论需要截图，不能用整页文本代替断言。
3. 分别打开 Classic 和设置中的“现代节点设计（Nodes 2.0）”验证。工具栏的“画布模式”只是选择/平移模式，不是节点渲染模式。
4. 记录实际结果、未执行项和原始错误；不能用“看起来正常”代替验收证据。

自定义 DOM 节点不能以“节点库可搜索到”或“原生空壳已创建”作为前端通过标准。至少必须在真实 ComfyUI 实例中真正创建节点并确认：

- 自定义根 DOM 已连接，关键 toolbar、输入控件和内容区各存在且数量正确；
- 首次同步挂载没有读取未初始化控制器，列表为空时触发的 near-end/render 回调也不会使挂载中断；
- Console 不存在该扩展的 `nodeCreated`、`loadedGraphNode`、`setup` 或挂载错误；
- 对 Gallery 等网络节点，至少一个来源能渲染真实卡片；前端契约单测不能替代这项浏览器验证。

若行为与预期不符，先按以下顺序判断：

1. 在同版本 ComfyUI 中用官方内置 V3 节点复现。
2. 查 [ComfyUI 官方文档](https://docs.comfy.org/) 和当前安装版本源码。
3. 官方节点同样复现时记录为上游或环境行为，不给本包增加私有时序补丁或兼容层。
4. 只有本包复现时，才沿本包生命周期和状态真源继续定位。

### 5.1 高密度画布性能（规范详见 [性能优化规范](performance.md)）

- 性能回归使用同一工作流、相同缩放、窗口尺寸和节点可见范围，分别记录静止、连续平移和连续缩放；Classic 与 Nodes 2.0 分开测，不能用静止流畅替代拖动画布结论。至少覆盖 QuickGroupManager、GroupLogicProbe、富 DOM 节点和嵌套 Subgraph。
- 自动测试以调用次数和对象身份锁定热路径，而不是依赖机器速度阈值：仅移动节点或修改无关高度时，QuickGroupManager 的尺寸回调必须返回缓存结果；结构变化时才失效。逐帧回调不得调用组快照或遍历图。
- Dashboard 控件值预览与提交必须保持工作区根、卡片和未涉及控件的 identity，只调用目标 `controlView().update()`；不得触发全量 DOM 重建或全节点重绘。
- Dashboard/Subgraph 参数提交必须保持工作区根、卡片和控件 identity；同 Binding 在重复卡片或多侧栏根中的投影通过 value channel 各更新一次。断言普通值提交不调用 `scheduleRender("dashboard")` / `renderWorkspace()`，宿主因响应式 widget 写值重复调用 Sidebar render 时直接返回；动态选项、控件类型、Binding 或 Host 显式失效仍会完整重建。
- Subgraph Provider 的回归使用多个公开 widgets：首次建立 Control Id 到 promoted widget 的结构索引，后续解析同一 Binding 只重新适配目标 widget 并读取实时值；Adapter 注册变化、`graphChanged`、工作流恢复和 `CONTROL_HOST_INVALIDATED_EVENT` 后必须重建索引。嵌套图像 Combo 还要断言同一失效周期内 definition owner 只遍历一次。
- 第三方 widget adapter 回归覆盖 `widgetTypes` 的大小写归一化、可选同步 `matches()` / `describe()`、重复 `controlId` 拒绝、`getValue()` 的实时值读取、混合自定义面板的 `allowNativeFallback`、注册/卸载后的重新发现，以及未知 widget 仍阻断原生 fallback；执行后动态加入 `$$` 前缀且不可序列化 / canvas-only 的 pseudo widget 时，既有简单控件必须保持可解析且 pseudo widget 自身不得暴露，可序列化的 `$$` 自定义 widget 仍阻断 fallback；renderer 回归覆盖 `controlView()` 的完整字段和 `kind` 一致性。
- Nodes 2.0 重挂回归需注入相关与无关 DOM mutation：无关 mutation 不扫描节点；同一帧多个相关 mutation 只进行一次 `[data-node-id]` 查询；低质量缩放隐藏富 DOM，恢复后内容、值、槽位和交互必须完整。
- 浏览器性能记录至少观察主线程长任务、每帧 `computeSize` / `getMinHeight` / draw 回调次数、DOM 查询、样式重算和合成成本。报告相同场景优化前后数据；无法稳定采样时如实交由用户使用真实工作流验证，不以源码检查宣称 FPS 改善。
- KJ Set/Get 单独做归因矩阵：`KJNodes.showSetGetLinks` 的 `never` / `selected` / `always`、单节点 `drawConnection`、`KJNodes.perf.singleCanvasPan` 及阴影/连线边框选项分别验证。本包测试不得修改或 monkey patch KJNodes；即使本包缓存命中，KJ 的虚拟连线和 canvas 性能设置仍可能主导平移成本。

## 5. 通用 GUI 回归矩阵

涉及前端交互、slot、widget、尺寸协议或序列化时，Classic 与 Nodes 2.0 至少分别检查；纯样式修改按第 1 节交给用户刷新验证：

| 路径 | Classic | Nodes 2.0 |
|---|:---:|:---:|
| 新建节点与默认值 | ✓ | ✓ |
| 控件、菜单和真实 socket 可操作 | ✓ | ✓ |
| 执行成功且输出无截断 | ✓ | ✓ |
| 保存后重新加载 | ✓ | ✓ |
| 复制节点、撤销和重做 | ✓ | ✓ |
| 暗色 / 亮色与窄宽度（涉及视觉时） | ✓ | ✓ |
| 节点增高、缩短及四角原生缩放命中（涉及任何 widget 或尺寸协议时） | ✓ | ✓ |
| 固定时不可缩放；取消固定后底部 widget 不得抢占四角（涉及底部控件时） | ✓ | ✓ |
| 加载低于新尺寸下限的旧节点，外框、背景和内容同步扩展且无透明空壳（修改默认或最小尺寸时） | ✓ | ✓ |
| 内部滚动区的未聚焦首次滚动、聚焦后普通滚动、焦点外画布行为及画布缩放修饰键（涉及滚动 DOM widget 时） | — | Standard / Legacy |
| 无阻断性 Console 错误 | ✓ | ✓ |

BooruGalleryNode 还需覆盖：

- 四个适配器的查询、分页、Rating、响应规范化、详情、分类标签、认证参数和 capability；不支持的收藏写入必须显式失败。
- Summary 搜索不逐帖 hydrate Detail；切换来源或重新搜索会中止旧请求，过期响应不渲染。
- TLS 证书校验失败必须首个请求立即返回结构化 `tls_certificate_error`，保留底层 `SSLCertVerificationError` 原文且不能进入三次瞬时重试；前端显示持久本地化摘要，点击可查看、选择和复制完整错误并重试。自动回归必须拒绝 `ssl=False`、`verify=False` 或任何关闭证书校验的实现。
- 全局黑名单不得进入任一来源的远端查询参数或改变认证判断；搜索、排行榜和收藏夹均在列表响应上做大小写无关的原始标签精确匹配，不能把 `text` 误匹配为 `text_focus`。设置输入及历史持久值必须统一识别英文逗号、中文逗号、顿号与换行，禁止把多项合并成一个永远无法命中的标签。过滤后视口不足时最多自动补取 4 个后续页面，仍不足则显示可访问的“继续查找”操作；补页判定不扫描卡片、不逐帖请求 Detail。
- Danbooru 周榜/月榜与 AI TAG 月榜走独立频道；Gelbooru、Safebooru 不显示未声明排行榜。逻辑页码统一从 1 开始，适配器分别正确转换 `page` 与零基 `pid`；刷新回到第 1 页，查询上下文变化回到第 1 页，跳页不预载前页。
- 随机模式的开关状态必须保存、加载和复制，但不进入执行 payload；开启时隐藏页码并让请求携带 `random=1`、使用 `cache: "no-store"` 而不携带 `page` / `cursor`，关闭后恢复逻辑页。连续“再抽一组”和 near-end 补取在相同来源、查询、频道、周期及 Rating 范围内不得重复 `source + postId`，改变范围或退出后才清空；黑名单结果不得进入已见集合。后端必须证明 Danbooru 0–1 个普通标签生成免费 `rating:…` 加原生 `random:<limit>`、覆盖完整匹配集且不出现 `order:random`；匿名或基础账户的双标签查询必须保留两个普通标签及免费 Rating，通过最新页与 `a0` ID 游标探测首尾帖子 ID，再从区间阈值使用 `b<ID>` 游标抽取真实批次，禁止调用计数端点或 OFFSET 深页。范围缓存覆盖同一规范化查询命中，并对 Rating 和账户身份严格隔离；边界探测不受本机黑名单影响，实际抽取和空批次回退仍必须应用黑名单；随机阈值必须落在首尾 ID 内，空过滤批次回到已探测的最新有效批次。超过两个普通标签和非预算类上游错误必须显式失败；随机结果页不得进入搜索结果缓存，查询规范化缓存仍可复用。Gelbooru / Safebooru 原生随机、AI TAG 全页采样及搜索/排行榜/收藏夹路由透传保持原契约；前端洗牌使用 Web Crypto 拒绝采样且不修改输入数组。唯一结果耗尽必须在有限空批次后结束。
- 节点的双行上下文工具栏第一行原位展开搜索，中文 IME 输入期间不重建 input；Dashboard 窄栏将工具区收敛为两行，第一行合并来源、浏览 / 已选、单选 / 多选和收起搜索。仅 Gallery Dashboard 的两个 Switcher 启用共享 `segmentedControl({ activeLabelOnly: true })` 收缩契约，以“当前项图标 + 文字、未选项仅图标”显示，节点投影及未启用该选项的其它 Switcher 保持原样；切换不得通过 `flex` 宽度过渡触发布局重排；搜索点击后原位展开，明确工具按钮只显示图标并保留本地化 Tooltip，常用窄宽下瀑布流至少显示三列。随机 Switcher 紧邻刷新按钮，关闭/开启通过中性/紫色表面、滑块位置、文字与 `aria-checked` 同时区分，不渲染重复底部提示；刷新按钮在普通模式显示刷新状态，在随机模式显示不带方框轮廓的闪光抽取图标与抽取状态，加载图标旋转且本地化短标签同步更新；不得监听全局 Queue 按钮或使用 `setInterval`。Dashboard 的节点模式只能以无容器的单个图标与状态文字只读显示，窄侧边栏只保留图标且不得绘制圆形徽章；侧边栏不得写入 `node.mode`，节点自身切换启用、静音或绕过后状态指示必须实时同步。悬浮大图的图片区高度必须由首次 Summary 几何一次确定，Detail 和 Sample / Large Preview 加载完成后不得重算高度或触发高度过渡；图片区和底栏必须是独立 Grid 行，普通图片以 `contain` 完整显示；底栏按实际内容在 40–240px 内动态增高且不得超过视口高度的 35%，达到上限后才内部滚动，不能覆盖图片区；触发卡片已有解码缩略图时必须优先使用其真实比例，不能因 Summary 缺失尺寸回退成方形；竖图图片区不得固定封顶为 360px；普通竖图继续完整显示，按卡宽计算出的自然高度超过视口可用图片区时必须切换为超长图模式：图片按卡宽保持原始比例并从顶部裁出可见片段，不将整幅漫画缩成窄条，预览图也不能随浮层二次居中上下跳动。回归必须确认比例 CSS 变量通过 `HTMLElement.style.setProperty()` 实际写入 DOM，禁止把未被 `el()` 处理的 `style` 对象放进创建参数后仅凭源码断言成功。
- 瀑布流已通过 `pointerenter` 取得焦点后，指针点击卡片主体、收藏及其它悬浮操作，普通滚轮必须继续滚动原瀑布流；键盘激活保留控件焦点，已打开 Dialog 不得被抢焦点。静态回归同时拒绝把卡片或操作按钮直接 `blur()` 到 `document.body`。
- 10,000 条离线数据保持自然比例和最短列稳定顺序，可见卡片不超过 240；追加页不重排已有 placement，容器宽度变化才全量重排。
- 跨页多选、稳定去重、拖动排序、本地标签编辑与恢复、保存加载、复制、撤销重做和连续 Queue 独立快照。
- 并发原图下载后恢复选择顺序；任一图片下载、Content-Type、大小或解码失败时整节点失败，不跳项、不补黑图。媒体代理必须保留适配器声明的站点请求头并在重定向后继续复核 URL；Gelbooru 缩略图、Sample 与 Original 的真实下载均须携带站点 Referer，验证返回 `image/*` 而不是 HTML 帖子页。
- 卡片与详情均按 download capability 显示原图下载入口，下载使用 `来源-帖子ID.扩展名`；详情的“打开原图”与“下载原图”必须使用不同图标和行为。
- Classic 与 Nodes 2.0 中验证默认尺寸、缩短增高和左右下角原生缩放；把节点加宽后依次点击、移动、切换渲染模式和重载，Gallery 内容必须始终贴合当前节点外壳，不能回缩到旧固定宽度；真实站点网络、认证、收藏和下载另作人工确认。

可用 `npm run benchmark:gallery` 运行不访问真实网站的 10,000 条布局基准。时间结果只作为本机观察值，CI 只断言有界可见数量。

SimpleNotify 还需覆盖：

- 桌面通知、声音分别单开、同时开启和同时关闭。
- 空消息的 English / 简体中文默认文案。
- `granted`、`default`、`denied` 和不支持 Notification API。
- 普通单值、list、连续 Queue，以及多个节点实例各提醒一次。
- 一个渠道失败不阻断另一渠道，工作流本身不因提醒失败而失败。
- 同类权限或音频错误单页面会话只 toast 一次。
- 右键“启用并测试提醒”读取当前 widget，并在用户操作中申请权限和播放测试音。
- Classic 与 Nodes 2.0 均验证固定时无缩放、取消固定后四角可用；至少从右下角完成一次增高和缩短，消息、通知开关、声音开关与音量控件不得先于缩放角命中。同一回归同步覆盖 `GroupIsEnabled` 与 `SimpleStringSplit`，并抽查一个非目标内置节点保持原始 `getWidgetOnPos`、`resizable` 和拖拽行为。
- 原生 widget passthrough 的自动测试必须实际调用包装方法：角区不返回 widget、非角区保留第三个参数并委托原实现、`resizable = false` 不被绕过、重复安装幂等。DOM passthrough 还必须确认命中查询不读取 `app.canvas.pointer.isDown` 或产生监听器/class 副作用，只有 `app.canvas.resizing_node === this` 时才进入缩放状态。

PromptSelector、词库与 DIY 侧边栏还需覆盖：

- PromptSelector 跨分类多选、节点内排序、权重、前缀、分隔符、词库实时编辑、缺失引用阻断，新建节点默认尺寸与可缩放下限均为 `440 × 560`，Nodes 2.0 下顶栏与底栏不得覆盖原生标题、输入输出槽和节点包标记，以及排队后最近使用记录、默认最近优先/手工词库顺序切换和旧库字段迁移。
- PromptSelector 词条列表的滚轮回归必须覆盖：初始焦点在画布时，把指针直接移入列表，不点击即可用第一段滚轮滚动；列表自身或 PromptSelector 内其它控件获得焦点时普通滚轮仍留在组件；外部文本输入获得焦点时，指针经过列表不会打断输入；移出并把焦点放回画布后恢复宿主行为；Standard 模式 `Ctrl` / `Meta` + 滚轮仍缩放画布；Legacy 模式遵循当前前端实现。静态测试必须锁定业务根的 `data-capture-wheel="true"`、列表 `tabindex="0"`、`pointerenter` 预先补焦点及外部编辑保护，并拒绝在目标 `wheel` 回调补焦点、`preventDefault()`、`stopPropagation()`、捕获阶段监听及自行构造 `WheelEvent`。
- `data-capture-wheel` 不属于 `addDOMWidget` 的公开稳定 API。ComfyUI Frontend 升级后先读取当前安装版本的 `useCanvasInteractions`（或后继实现），再用同版本官方内置 DOM widget 交叉验证；不能仅凭旧测试通过认定滚轮协议未变。
- 词库分类、收藏夹、默认收藏夹、标签、预览图、完整/筛选 ZIP、旧 JSON、冲突策略和损坏包回滚。
- 普通模式下节点右键始终可以添加控件；每个符合条件的添加、绑定或解绑动作只出现一次，禁止同时通过 `getNodeMenuItems` 与 legacy `getExtraMenuOptions` 注册；添加 Dialog 打开时依据节点标题和所属（含嵌套祖先）可视组标题保守模糊匹配页面名，可信匹配自动选中对应页面，无法确认时保留当前页面；页面下拉保持共享箭头样式，全选/全不选只影响当前允许添加的控件；编辑模式只开放布局操作。
- 添加控件身份回归必须同时模拟“保存的是旧 promoted-widget Control ID、Provider 当前返回的是 canonical Control ID、UI 行传入的是 control descriptor”三种形状：`createControlBindingMatcher()` 只能在边界读取 `control.binding`；已存在的行显示 `Already added`、禁用且不进入全选候选，未绑定项才进入初始选择和提交集合。以 15 个旧绑定加 1 个新控件的 fixture 验证不能重复添加整组参数；禁止只测试底层 matcher 收到裸 binding 而遗漏 Dialog 调用方的 descriptor 形状。
- 侧边栏适合范围调节的有界数值可拖动滑条；Seed 和无可靠范围的数字不显示误导性滑条。普通 Integer / Float 参数卡片右键可设置侧边栏专用最小值、最大值和步长并恢复节点默认值；覆盖值随工作流、卡片/页面复制和完整侧边栏预设往返，不能改写节点 widget 选项、联动兼容签名或当前值。校验覆盖非有限值、反向/相等边界、非正或大于范围的步长、Integer 小数以及越过节点声明边界；节点值暂时位于自定义范围外时精确值保持真实，滑条只把视觉位置夹在边界内，直到用户下一次调节。Float 节点即使原生 widget 未声明范围且运行时默认 `step` 为 `1`，设置侧边栏 `0.01` 后拖动到 `1.37` 也必须保留 `1.37`，不能在预览同步阶段按节点默认步长舍入为整数。Seed 的执行后行为按钮复用同一四模式 Popover，完整支持 `fixed` / `increment` / `decrement` / `randomize`，图标、选中态与 codec 必须同步；随机模式保持中性输入表面，另外三种模式的输入框分别显示蓝、绿、琥珀低饱和状态色。预设捕获、应用与回滚同时覆盖 Seed 数值及该行为。所有数字都可点击精确输入、滚轮和方向键按 step 调整，`Shift` 十倍加速；连续拖动或滚轮只产生一个图历史边界。枚举和布尔控件继续复用共享 Select 与 Switch。
- 参数卡片与分隔项右键均可新增、编辑和删除 Component Note；空白说明规范化为未设置，非空 Markdown 随工作流、卡片/页面复制、完整侧边栏预设和便携 JSON 往返，来源同步及重绑不丢失。编辑 Dialog 用 Switch 在源码与预览间切换，格式工具栏和 `Ctrl` / `Cmd` + `B`、`I`、`K`、`Shift+X`、Tab 缩进都必须保持选区可继续编辑；预览覆盖 CommonMark/GFM 标题、强调、删除线、引用、有序/无序/任务列表、行内与围栏代码、链接、HTTP(S) 图片、表格和分隔线，并继续经过 DOMPurify 白名单。只有已有说明的卡片显示橙黄色问号徽章；悬浮或键盘聚焦显示安全 Markdown 预览，徽章点击不会打开编辑器，作者只能从组件右键菜单进入编辑路径，Header-only、联动徽标、窄栏与分隔项编辑按钮均不重叠。保存/删除各产生一个 Dashboard 图事务并触发活动侧边栏预设自动保存，不修改 Provider、Binding、节点参数或当前值。
- LoraManager 侧边栏列表必须与节点列表保持同一项语义：启用/停用、拖拽或键盘调整顺序、模型强度精确输入与步进、展开独立 CLIP 强度并在收起时同步回模型强度；预览仍通过有限缓存和生命周期清理，不把 `selected` 临时字段写回。每个 LoRA 行和空白列表区域的共享右键菜单覆盖“在 Civitai 查看”“删除”“上移/下移/移到顶部/底部”“复制备注”“复制触发词”“保存配方”，并提供“添加 LoRA”打开 LoraManager 页面；本机 API 失败必须保留原始错误并以 Toast 明确反馈，不能静默成功。
- 删除当前侧边栏预设时覆盖：有后继预设优先切换后继、删除末尾时切换前一个、删除最后一个时清空 Dashboard 并进入空画布、取消删除或兼容快照复核取消时保持原预设与原布局；删除非当前预设不改变当前工作副本。回归需验证工作流 extra、基准 ID、当前 Page Id、撤销/重做和保存加载往返。
- 图像控件必须物化同一个 32px 共享控件：点击选择、文件拖入、拖放反馈、裁切缩略图、即时完整预览和清空交互保持一致。原生图像 Combo 还需分别覆盖 `input`、`output`、`temp` 目录和显式 `[type]` 标记，缩略图与悬浮大图必须请求真实目录。非图像文件和无文件名响应必须显示明确错误。
- 内置 `Preview Image` 侧边栏卡片覆盖执行前空态、恢复后的 `node.images`、新执行结果、批次切换、媒体区及键盘打开全窗口、最高 8 倍缩放、指针中心缩放、放大后拖动与边界收口、双击/按钮还原、Escape 关闭和销毁清理；同一批次在普通 Dashboard 重绘中不得反复生成缓存破坏 URL。内置 `Preview as Text` 覆盖标量、数组拼接、长文本内部滚动、空态、纯文本保真、安全 Markdown 与节点 `preview_mode` 切换；参数名称与“纯文本”/“Markdown”模式徽标必须处于同一标题行，正文上方不得保留重复状态行。两者均只持久化 Binding 与布局，预设不保存执行输出。
- 原生 `Compare Images` 侧边栏卡片必须能通过媒体区点击或键盘打开全窗口查看器；查看器分别覆盖滚轮与按钮缩放、最高 8 倍限制、指针中心缩放、放大后拖动与边界收口、无手柄悬停分割与键盘微调、A 左/缩放居中/B 右的底栏布局及窄屏换行、A/B batch 切换、双击与适应屏幕还原、Escape 关闭，以及卡片销毁时关闭浮层。卡片与查看器中的图片都不得触发浏览器原生 `dragstart` 或被拖回 ComfyUI 画布。
- 侧边栏调参时只定向更新对应控件，不重建节点面或整个工作区；搜索为空提示严格遵守 `hidden`，存在可见控件且未搜索时不能占据页面底部。Dashboard 搜索覆盖全部页面，仅匹配参数组件实时显示标题，不匹配页面名、布局组名或页面上下文；打开搜索后按页面分组挂载真实控件卡片，输入查询只切换已有结果的可见性，多个同名控件可以连续修改并通过 value channel 同步，清空查询后恢复当前页原布局与页面滚动位置；搜索结果控件的菜单、数值范围、图像上传、Seed 行为、联动和错误态不得退化为跳转按钮或独立副本。
- Dashboard 顶栏固定为页面身份/预设/设置行与操作行两行，预设选择位于第一行页面设置按钮左侧，长页面名或 Layout Group 名称使用省略且不得使 Page Rail、Scroll Surface 或操作行在一行/两行之间跳变；窄栏时操作行只在自身横向滚动。完整侧边栏预设在普通模式和布局模式顶栏创建、应用、保存修改、另存、放弃修改、复制、重命名和删除；便携 JSON 导出将当前选中预设名称写入 JSON 的 `name` 字段并作为文件名；导入优先使用该名称，同名时自动建议不冲突的名称，且在同一事务中创建、应用和选中新预设。多页面重复 Binding 只保存和写入一次。布局或参数偏离基准后保留预设名称，以斜体和末尾 `*` 表示修改，没有基准时显示中性占位的“选择预设”，同时说明差异数量；切换前覆盖保存/另存、放弃与取消路径。
- 缺失、移出侧边栏、类型变化、选项失效和第三方 codec 拒绝值均进入复核；确认后保留失效卡片并应用兼容内容，任一写入失败同时回滚布局和全部已写控件。内部预设和便携 JSON 共用快照协议；外部导入两种模式均输入名称并创建新预设，不覆盖现有预设。
- 便携侧边栏预设导入必须覆盖：有可用基础预设时默认仅数值、没有预设时默认完整模式；仅数值先深复制基础预设，Binding Key 精确命中；Host / Adapter / Card Id 漂移后按唯一卡片上下文安全恢复；卡片改名但页面上下文仍唯一；恢复值展开到新版 primary / linked Binding Set；重复名称产生歧义时不按数组顺序猜测；单个非有限或损坏源值只跳过自身；新版新增参数和未命中目标保留副本原值；导入后基础预设快照保持不变，新副本成为当前 Dashboard 与基准；任一失败恢复导入前 Dashboard、基准身份、预设集合和全部已写节点值。两种模式均验证名称规范化和大小写不敏感冲突后缀。完整预设预检发现 Missing / incompatible / resolver error Binding 时显示风险明细，并在最终写入前再次确认；确认时重新解析 Provider。
- Dashboard V4 多目标卡片覆盖：V3 单 binding 自动迁移、主/附加 Binding 序列化与复制、字段元组 Binding Key 无分隔符碰撞且旧预设 Key 自动迁移、节点右键只在存在兼容目标时提供绑定入口、重复目标拒绝、同图与 Control Spec 值域兼容过滤、Integer / Float 域隔离、图像目录隔离、数值/布尔/下拉/文本/Seed 联动、Seed 数值与执行后行为共同同步，`before` / `after` 模式在每次 `graphToPrompt` 序列化前和 `queuePrompt` 完成后均由主 Seed 收敛（含多批队列、执行中切换工作流与 `randomize`）、一个 graph history 边界、第三方控件的 `false` / `{ ok: false }` / Promise / 抛错越过 Provider 边界并在部分写入后全部回滚，未同时声明数值与行为 codec 的第三方 Seed 明确拒绝联动、目标缺失或结构漂移进入联动错误但动态选项为空/未赋值/临时不可用只暂停整卡写入、混合值徽标、主参数重绑、来源组删除或重排不丢附加目标、管理页同名节点/卡片可区分且默认焦点不落在解除按钮、预设捕获/应用/回滚全局去重全部 Binding，以及根图、公开 Subgraph widget、Classic / Nodes 2.0、保存加载、复制粘贴和撤销重做。绑定确认还要覆盖“打开 Dialog 后复制/修复子图身份”的场景：确认时重新枚举源节点并重新匹配目标，但提交和首次同步必须只消费这同一次预检的 source/目标解析快照；用第二次解析返回 `missing` 的测试替身锁定确认链不得重复解析。布尔 `false` 必须作为合法读取 payload 参与混合值判断和同步，同时 Provider 在写入、回滚或冲刷阶段返回 `false` 仍是明确失败。绑定紫框还要覆盖根图进入嵌套/共享 Subgraph 再逐层返回：当前 graph 不误标同 Node Id 控件，返回后 Classic wrapper 被宿主替换及 Nodes 2.0 DOM 重挂两条路径都自动恢复，无需刷新；普通节点与混合 `preview_text`、canvas image preview、动态显隐、宿主去重的 Subgraph 节点都只标记实际绑定行，特殊组件数量不一致不得清空其它紫框，歧义行不得猜测。直接穿透内部 Subgraph 节点必须继续拒绝。
- “打开时聚焦”必须覆盖根图与嵌套/共享 Subgraph、Classic 与 Nodes 2.0、保存加载、复制和撤销/重做；Classic 标记只使用宿主 `addTitleButton()` 原生标题按钮，不得借零高度 DOM widget 进入节点 widget 布局，首次加载、刷新、固定节点和未 resize 状态都必须直接出现在标题栏，移除时只删除本包按钮并保留宿主或第三方后来替换的点击处理；设置 Popover 必须用按钮已绘制矩形或新节点标题区回退矩形转换出临时 DOM 锚点，关闭后立即清理，不能引用已删除的 Classic DOM widget；Nodes 2.0 继续使用节点 DOM 标记。加载时视觉同步不得阻断随后同一代际的子图导航和 `fitToBounds()`，撤销/重做仍只恢复标记而不重复聚焦。
- 侧边栏绑定紫框还要覆盖画布首帧已经完成后才发生的首次同步：含 `preview_text` 与 canvas image preview 的根图、嵌套和共享 Subgraph，在 Classic 中标记新增、promoted view 替换或移除后，无需进入/退出子图即可立即重绘；现代 widget 必须通过 `getOutlineColor()` 命中，legacy/custom widget 即使暴露但不消费该钩子，也必须在自身 `draw()` 后得到同一紫框；高尺寸 DOM widget 的紫框使用宿主 `margin`、`computedHeight` 与实际 DOM 挂载矩形对齐，不能退回固定 `NODE_WIDGET_HEIGHT` 或 native margin；KSampler 等新版 store-backed Subgraph native 投影必须在宿主 `drawWidgets()` 创建瞬时 concrete widget 后按稳定绑定目标补框。宿主替换 widget `draw()` 或 node `drawWidgets()` 后下一次同步重新包装，解绑只恢复本包仍持有的属性并保留宿主替换。Nodes 2.0 必须按 ComfyUI `useProcessedWidgets` / `shouldRenderAsVue` 的可见性、去重和 `canvasOnly` 规则映射 DOM 行，`sourceWidgetName` 以 `$$` 开头的 promoted pseudo widget 不得占用行位置。回归锁定标记变化调用 `LGraphCanvas.setDirty(true, true)`，不得用进入/退出子图、延迟、轮询或逐帧 graph 扫描补救。
- 参数卡片不显示常驻设置按钮；右键与 `ContextMenu` / `Shift+F10` 打开共享菜单，方向键和 Escape 可操作，危险移除有独立语义，文本输入仍保留浏览器原生右键编辑。Seed 和无范围数字采用标题行紧凑卡片，不被同一网格行的滑条卡片拉高。
- 页面、带页码层级的当前页标题、双击及 `Enter` / `F2` 原位重命名、页面空白处右键菜单及键盘菜单键、菜单内的重命名/复制/颜色/删除与布局模式附加操作、页面、布局组与参数卡片共用 tone 预设色板预览、自定义 Hex 颜色、规范化持久化及旧组颜色兼容；页面与卡片可从菜单打开共享颜色编辑器，清除颜色后恢复默认强调色、Dashboard V4 十二列整数网格、卡片宽高拖动与键盘调整、命令路径统一整数吸附、单击页面散项/组内成员/分隔项后立即显示一致且不改变占位的明亮选择轮廓、`Ctrl` / `Meta` 多选时本次加入项与既有项使用同一视觉状态、整个 Dashboard 表面的空白区域都能起框，普通单击/拖动任意卡片先选中并可直接拖动，`Ctrl` / `Meta` / `Shift` / `Alt` 修饰键才进入加选或减选框选，按钮/输入/缩放手柄不被框选接管、顶栏“全选布局项”按钮按根级散项与 Layout Group 组合单元建立选区、`Ctrl` / `Meta` + `A` 在非文本侧边栏区域不执行全选也不传给 ComfyUI 画布而文本输入只保留浏览器原生全选、拖拽碰撞时拖动项保留目标落点且原位置相交项按稳定顺序向下挤开（覆盖大卡片插到小卡片之前、多选整体和布局组），框选同时命中页面散项与组内成员时把对应 Layout Group 作为完整根级单元移动并保持组身份、全部成员及组内坐标，只有显式“移出组/解除分组”才允许清除关系；在满页顶部或中部选中卡片打组时，新组必须留在选区原位置并保留选区横向列位，组外壳新增占位只向下挤开相交项及后续碰撞链，不得把组放到页面末尾，也不得移动未横向相交的邻列；散项或另一组成员拖到现有组的标题、边缘或内容区域时必须显示完整组接收态和“加入组”徽标，松手后追加到目标组首个可用位置、保持目标组锚点并只下推外部碰撞链，离开/取消时清理接收态，拖回原组内部仍精确移动，整组不允许嵌套且空原组自动移除；缩放碰撞仍只让操作项顺延、窄侧栏单列投影不回写规范宽度且布局组全部成员按顺序完整显示、不同纵向占位的参数卡片、运行时尺寸投影后的组间距与页面/组内碰撞重排、矮卡片填充高卡片旁空位、分隔线、布局组、多选拖动、入组/移出组保持相对几何、整体移动、仅由按钮触发的整理布局、当前页标题旁的 `01/NN` 页码入口、仅点击或键盘激活时打开的完整页面菜单、位于条目开头的拖拽手柄、整行页面选择、点击/滚轮/键盘切换与首尾停止、普通模式和布局模式下页面内容滚动只作用于当前页、删除卡片和拖拽提交后的结构重绘保持当前 Scroll Surface 位置、切换页面后恢复各 Page Id 自己的会话位置且切换工作流不串用旧位置、右侧 Page Rail 独立 38px 圆点列不覆盖 Scroll Surface 或卡片、悬停展开名称胶囊且选中胶囊整体显示强调光晕、Rail 内点击/键盘可直接切换页面且不把请求交给 Scroll Surface、多个侧栏根状态隔离且共享 Page Id 的同帧相反请求不会播放同页伪过渡、Rail 内滚轮不建立延迟队列，停止后不追加旧页面请求，键盘导航按页面顺序移动并在首尾停止，页面切换期间不重建 Rail 的 DOM 身份，切换到第二页、倒数第二页及任意方向时展开态中心保持不变，离场页面快照绝不参与 Dashboard body / Page Rail 的轨道尺寸计算；上传中的 file input 不参与快照值复制、custom→Vue、其它 custom renderer 替换或 `v-show` 隐藏后按根清理旧控制器、锚定浮层、Tooltip 与 Context Menu且不关闭其它根菜单；首次挂载或持续隐藏的根不重建 Provider/控件，重新显示时补一次渲染，搜索焦点只进入发起操作的可见根；多根词库 checkbox id 不重复，销毁数值控件会移除浮动编辑器并闭合拖拽事务、网格和页面菜单拖拽期间均不误翻页、V2 布局预设自动迁移和 Missing Binding 手动重绑。整理布局必须按完整矩形占位和稳定视觉顺序确定性紧凑，连续执行两次所得布局一致。
- Dashboard 布局手势的纯逻辑回归还必须锁定：框选完整 Layout Group 时成员不残留为散项也不丢失视觉选择；混合页面散项/多组成员提升为完整组；插入预览与 `insertEntries()` 使用同一稳定碰撞顺序；组内、跨组和根网格落点的 `precise` 语义；`Alt`+方向键保持选区内部几何并在十二列边缘收口。契约测试确认边缘滚动只有一个 rAF 循环，Escape、松手和销毁均清除位移、接收态与 frame。GUI 中用超过一屏的密集页面从首项框选到末项，连续上下自动滚动并反向拖回，确认末尾项目不掉选、插入标记与最终位置一致、碰撞链以预览位置落地。
- 每一种 Dashboard Control Renderer 都需在最矮、默认、加高、最窄和加宽卡片中检查：标题与操作不重叠；多行文本不截断且占满剩余高度；Markdown/输出/列表可滚动；Tag List 高态换行、矮态不锁高；窄分段选择多行；高图像选择扩大真实预览；单行输入、布尔、数值不被机械拉满。静态契约锁定统一 Container Query 边界且不存在每卡 ResizeObserver；实际视觉由用户在真实侧边栏的暗/亮主题验收。
- 调整档案 Dialog 回归覆盖：规则列表与候选选择面互斥、打开/关闭候选后恢复规则滚动位置、按宿主来源稳定分组、同名参数组内序号、规则搜索不重建搜索输入、最长中英文名称/来源/页面胶囊、ready/ambiguous/missing 状态、Seed/布尔/文本/数值编辑器、更新当前值与确认移除、最窄支持宽度和常用窗口高度。确认档案栏可辨识当前档案与统计，Footer 明示本机自动保存和套用边界且只有“套用 N 条规则”是主操作；规则和候选使用无实线边框的错层表面，列表首尾可达且不产生嵌套完整表单。
- 页面菜单提供专用拖拽手柄，拖拽和 `Alt+ArrowUp` / `Alt+ArrowDown` 都按单次 Dashboard 命令调整页面顺序，切换、撤销/重做、保存/加载和预设往返保持顺序一致。
- QuickGroupManager 每行取景框按钮与侧边栏“组导航”都能把完整组边界瞬移适配到视口；侧边栏只显示手动添加的组，添加、移除、失效组保留、搜索、颜色、节点数量、启用状态、拖拽排序、图变化刷新和未固定时定位后收起均正确。导航不再提供单组直达键；旧工作流中的历史 `1`–`6` / 小键盘值不再读取，用户只配置一个轮盘激活键。每项 X/Y 画布偏移独立生效且默认归零，10%–300% 缩放默认 82%，非默认视图设置可见。导航清单、轮盘按键、顺序、偏移与缩放进入工作流事务并可保存、加载及撤销重做。
- QuickGroupManager 作为一个整体控件添加到侧边栏时，卡片使用稳定 `quick-group-manager` Binding，展示当前 graph 的组、Mute / Bypass 与状态；工具组靠右且不遮挡标题，并通过通用 `layoutProjection` 按实际可见条目收放临时高度。连续多个 Manager 在页面和组内都应重排后续矩形占位，不留下内部或卡片间空白，且不改写 `data-drop-*` 或规范工作流布局；组列表不建立独立滚动。每个非空组的整行都可点击切换，开关必须复用 runtime 的级联预检和单次 graph transaction。画布节点、侧边栏和节点读取同一 Manager 状态。侧边栏预设只覆盖组成员的启用/关闭状态，关闭成员按 Manager 当前 Mute / Bypass 模式恢复；保存/加载、复制、撤销/重做、缺失节点和类型不匹配均明确处理；切换预设不得改变 Manager 的颜色范围、排序、关闭模式或联动规则，旧预设内的 Manager 配置与历史关闭模式必须迁移移除；不引入独立聚合页或轮询。
- Dashboard V4 控件宽度覆盖 3–12 的每个整数列跨度，行高覆盖不小于 13 的任意整数跨度；Provider 未声明宽度的新建绑定必须使用 6 列并默认形成左、右两列，显式 3 列等尺寸和既有布局必须保留。拖拽、键盘与命令缩放仍逐整数单位变化，默认变宽不得收窄可调范围。V2/V3 自动迁移为 V4：V2 旧双列的列位置与列跨度等比迁移到 12 列，V3 十二列布局保持不变，已有有效整数行跨度保持；回归同时覆盖来源同步、预设往返、窄栏投影、Provider `layoutProjection`、组内/页面级矩形碰撞、投影不污染持久布局，以及 Classic / Nodes 2.0 的实际对齐。
- Dashboard 布局模式的点阵必须在空页和短页覆盖至少一屏；把卡片拖到初始视口以下并滚动到底时，点阵继续覆盖到最后一个隐式网格行且与卡片吸附坐标保持一致。实现只允许现有 Grid 上的单层重复 CSS 背景和内容自然高度，不得用 DOM 点阵、滚动监听、JS 高度写入或 `ResizeObserver` 扩展背景。
- 通用 widget 与 Subgraph 整体公开 widget；不得解析子图内部节点。子图公开多行 `STRING` 必须出现在“添加参数”列表中，使用多行文本卡片并能双向写回；回归同时覆盖普通 store 投影的非枚举 `widgetId` 和宿主 input 以 `_widget` 持有、widget 自身没有 `widgetId` 的官方 DOM 投影，且宿主存在更靠前的非 widget input 时不能误认来源。
- Classic 与 Nodes 2.0 分别保存、加载、复制宿主节点、撤销/重做、切换工作流和导入不兼容预设。
- Discord 分享分别验证工作区侧栏底栏纸飞机、顶栏、隐藏三态及重载持久化；底栏 GitHub、Discord 社区链接和右侧固定按钮保持可用，顶栏入口与 Workflow Hub、LoRA Manager 一致使用蓝色方块和白色图标，并完整覆盖 Hover、Focus、Active、Disabled、连接状态点和加载状态。两处右键迁移后只能保留一个可见分享入口；选择隐藏必须先二次确认，设置必须能恢复隐藏入口。首次点击在没有运行结果时仍先完成 Discord 授权与目标服务器成员检测；非成员显示配置的社区邀请，成员验证成功后才以 Toast 提示运行工作流。右键 Preview Any 后保存/加载仍能解析提示词来源；连续两次运行只展示后一次成功执行的去重图像。主图信息栏不得覆盖图像，计数、文件名和尺寸必须垂直居中于同一水平轴线；紧凑缩略图使用窄竖片，上方图片、下方显示无空格完整分辨率，文件名保留在可访问名称中；底栏覆盖滚轮横向滚动、方向键和首尾切换。主图覆盖最高 8 倍缩放、指针中心滚轮缩放、按钮缩放、放大后拖动与边界收口、双击/按钮还原，以及切换图像后自动复位；缺失提示词禁用态保持正确。存在提示词时编辑按钮进入多行编辑态，保存/放弃、Escape、Ctrl/Cmd+Enter、空内容校验、字符计数、编辑期间发送禁用和关闭 Dialog 后草稿丢弃均正确，发送使用修改后的本次 Prompt 且不改变工作流与最新运行快照。Footer 频道多选至少保留一项，只显示中继公开的 Target 名称，重开后恢复仍有效的选择并在 Target 变化时回退默认项；部分发送失败时只保留失败频道供重试。长 Prompt 文件选项默认开启并持久化，Hover / Focus 可读到 4,096 / 6,000 字符限制以及关闭后自动分段、图像置于末段的说明；选择中包含推荐能力频道时自动开启并显示就近气泡，移除该频道后恢复用户偏好，只选普通收集频道不得自动覆盖。
- 中继纯逻辑覆盖 Origin 白名单、OAuth state、会话 TTL、成员/角色失败、速率和大小上限、Webhook Target 配置与去密钥公开列表、提示词代码块转义、单消息 Embed 上限、Prompt TXT 大小上限、首个 Embed 作者昵称/Discord CDN 头像/资料链接和多频道部分失败。后续 Prompt 分段不得重复作者区，也不得用用户头像覆盖 Webhook 身份。速率测试必须断言按 Discord User Id 调用原生 Rate Limiting binding、拒绝时返回可机读重试时间，并且发送路径不再创建 `rate:*` KV 记录；绑定缺失或调用异常必须显式失败。一般 Prompt 在单段可容纳时每个频道只调用一次 Webhook；关闭文件化后必须按顺序发送连续 fenced 分段、只在最后一段附图，单段失败时尽力删除该频道先前分段，超过十段安全上限才明确拒绝；文件模式必须在同一消息附图像和完整 UTF-8 TXT。真实 Discord OAuth、退出服务器后的再次拒绝、Webhook 最终渲染和撤销会话属于外部系统验收，不得用 mock 结果声明通过。

## 6. 必须人工确认的项目

浏览器安全策略要求真实用户手势。自动点击、合成事件、mock API 或单元测试只能验证代码路径，不能证明以下系统能力通过：

- 浏览器权限弹窗真实出现并能授予权限。
- Windows 桌面通知真实显示。
- 浏览器自动播放限制已由右键操作解除。
- 扬声器实际播放了提示音及音量符合预期。
- Discord OAuth 弹窗、目标 Guild 成员身份和真实 Webhook 消息。

人工验收时，在真实浏览器中右键 SimpleNotify，选择“🔔 启用并测试提醒”，确认权限、Windows 通知和声音；Discord 分享使用真实成员和非成员账号分别验证一次，并确认单选和多选频道时各目标频道得到完整结果。关闭文件化时，长 Prompt 分段必须连续且图像只出现在最后一条；文件化后应在同一消息看到真实作者昵称与头像、完整 TXT 与图像，且只选普通收集频道不会自动覆盖文件偏好。结果必须标为“人工通过”或“尚未人工验证”，不能由自动化代替。

## 7. 通过与交付

UI 通过必须同时满足：节点可创建、控件可操作、输出不截断、原生 socket 可命中、状态可保存恢复、执行结果正确、无阻断性前后端错误。

交付报告应区分：

- 已通过的自动检查。
- 已通过的 Classic / Nodes 2.0 路径。
- 已由用户真实手势确认的系统能力。
- 未执行项、原始阻碍和剩余风险。

禁止用 mock、旧截图、仅 `/object_info` 成功或“看起来正常”代替真实验收。
