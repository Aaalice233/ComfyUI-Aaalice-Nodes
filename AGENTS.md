# AGENTS.md

供协作者与 AI 助手使用；与当次明确指令冲突时，以当次指令为准。**本文件只记录长期有效的开发硬规则，不记录具体 Bug、调查过程、操作教程或测试日志，并保持在 500 行以内。**

## 1. 项目边界与依据

本项目选择性重写 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)，只实现已确认的节点和前端能力。

- ComfyUI 官方文档入口为 [https://docs.comfy.org/](https://docs.comfy.org/)；API、生命周期、Schema、list、缓存或前端行为不确定时，先查官方文档和当前安装版本源码，再决定实现。
- 排查前端显示、渲染、widget、画布或交互问题时，必须同时核对当前 ComfyUI 源码，以及本地存在的对应版本 ComfyUI 前端源码（当前参考 `E:/git/ComfyUI_frontend`）；以源码确认生命周期、DOM、LiteGraph、Classic / Nodes 2.0 和样式行为，不得只凭截图、打包 bundle 或经验猜测。
- 现象与预期冲突时，先用同版本的官方内置节点交叉验证。若官方节点也复现，按上游或环境问题处理，不给本包堆私有兼容补丁。
- 方案开始依赖多层时序补丁、轮询或重复状态时，暂停实现并重新核对职责和根因。
- 当前已进入正式发布前稳定期；现有节点身份、工作流序列化、公开前端 API、用户交互和已验证行为均按稳定契约对待。修复优先采用边界清晰的最小改动，禁止因为局部问题顺带改写无关模块、替换成熟实现或进行大范围“顺手重构”。
- 重构必须由明确根因、架构债务或无法安全局部修复的问题驱动，并在动手前确认调用方、状态真源、生命周期、Subgraph、Classic / Nodes 2.0、旧工作流和第三方集成影响。若判断重构能避免实质技术债或显著降低后续风险，先向用户说明触发原因、拟改范围、兼容风险、不重构的代价和验证计划，并明确询问是否进行；获得同意前只做不会锁定重构方向的诊断与必要止损。扩大模块边界、改变持久协议或删除现有能力时同样必须先征得同意；breaking change 同步版本、迁移策略、双语 README 和公开限制。
- 未发布的内部中间态可以删除死代码或收敛实现，但不得借此绕过兼容性评估、迁移责任和回归验证，也不得保留无调用方的兼容壳、废弃别名或历史文档。
- 标识符使用英文；用户可见文案提供 English + 简体中文，并跟随 ComfyUI 界面语言。
- Classic、Nodes 2.0 与 Subgraph 是所有节点开发的基线支持面，不是后续可选适配；新增或修改节点必须同时成立。暂不支持 App Mode。
- 新增依赖前必须征得同意；禁止静默吞错、伪造成功或用降级掩盖根因。
- 只修改任务直接涉及的内容；工作区已有改动默认属于用户。
- 第一方手写 JS / TS / Vue / Python / CSS / SCSS（含测试、脚本与部署代码）以不超过 600 个物理行为模块化目标，800 行为禁止超过的硬上限；空行和注释同样计入。接近目标时必须按稳定职责拆分，业务入口只保留注册、路由或装配，状态模型、运行时协调、DOM、Dialog、生命周期和领域样式分别归属独立模块。固定上游产物只能按 `js/vendor/**` 等精确路径豁免，手写代码不得借 vendor / generated 名义、压缩排版、删除必要说明或转移到另一巨型文件规避检查。
- 提交消息使用 `type(scope): 中文描述`，标题不超过 72 个字符。

## 2. 文档职责

| 位置 | 职责 | 不应包含 |
|---|---|---|
| `README.md` / `README.en.md` | 用户安装、已发布功能、用法和公开限制 | 开发进度、下一项、完整排期、测试记录、协作规则 |
| `AGENTS.md` | 开发硬规则、架构边界、验收门槛 | 具体 Bug、长命令、教程、调查过程 |
| `CONTEXT.md` | 项目领域词汇和统一称呼 | 文件路径、字段名、实现方案 |
| `docs/adr/` | 难逆且存在真实取舍的架构决策 | 操作步骤、视觉细节 |
| `docs/design/` | 设计语言、组件和交互规范 | 后端协议决策 |
| `docs/development/` | 架构、内部路线图、测试与发布 runbook | 普通用户安装教程 |

- 文档入口见 [`docs/README.md`](docs/README.md)。
- `README.md` 为简体中文首页 README（同时作为 Registry readme）；`README.en.md` 为 English。两份结构必须对齐、页顶互链。
- 节点重置或增删时：README 只更新已发布节点、用户用法和公开限制；[`roadmap.md`](docs/development/roadmap.md) 独立维护进度、下一项、稳定编号和排期。
- ADR 状态只用 `Accepted`、`Superseded by ADR NNNN` 或 `Rejected`。已发布决策被替代时保留历史并链接后继；未发布中间态删除后不保留 ADR。
- 一次性调查、聊天结论、本机故障笔记和测试截图不进入仓库。

### 2.1 上下文入口

`AGENTS.md` 是开发上下文总入口。需要参与判断的项目文档必须在这里使用 `@相对路径` 引用；普通 Markdown 链接只用于阅读导航，不视为上下文注入。

所有开发任务先加载：

- @CONTEXT.md
- @docs/development/architecture.md

按任务类型继续加载：

| 任务 | 注入文档 |
|---|---|
| 文档整理、职责判断或查找入口 | @docs/README.md |
| 节点重置、增删节点或调整优先级 | @docs/development/roadmap.md |
| 测试、调试、GUI 验收或发布前检查 | @docs/development/testing.md |
| 前端性能、富 DOM、画布卡顿或热路径 | @docs/development/performance.md、@docs/development/testing.md |
| 发布、版本和 Registry | @docs/development/release.md |
| 前端视觉、组件、主题或可访问性 | @docs/design/ui-system.md |
| QuickGroupManager 交互与布局 | @docs/design/quick-group-manager.md |
| ResolutionPreset、画幅坐标板或个人分辨率预设 | @docs/design/resolution-preset.md |
| FetchFromKrita 或 Krita Bridge | @docs/adr/README.md、@docs/adr/0011-krita-bridge-execution-snapshots.md |
| BooruGalleryNode、多站点画廊或虚拟瀑布流 | @docs/design/booru-gallery.md、@docs/adr/0010-booru-gallery-capability-snapshots-masonry.md |
| Discord 分享、最新运行相册或成员验证中继 | @docs/design/discord-share.md |
| PromptSelector、词库或 DIY 侧边栏 | @docs/design/prompt-selector-workspace.md、@docs/adr/0007-independent-prompt-library-live-references.md、@docs/adr/0008-stable-dashboard-control-bindings.md、@docs/adr/0012-dashboard-source-scoped-groups.md、@docs/adr/0013-dashboard-multi-target-binding-sets.md、@docs/adr/0014-dashboard-value-import-recovery.md |

新增专题文档时，若其内容会影响实现或验收，必须同时补到本节。README 面向用户，不作为默认开发上下文注入。

## 3. 仓库与后端

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py
├── nodes/{control,prompt,tools,_lib}/
├── js/{lib,assets}/
├── locales/{en,zh}/
├── tests/
└── docs/{adr,design,development}/
```

- 根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`，不放业务节点。
- V3 节点默认一节点一文件；`nodes/<domain>/__init__.py` 导出 `NODE_CLASSES`，只注册已实现的域。
- 新增域时同步 `nodes/__init__.py` 与 `pyproject.toml` packages。
- category 使用 `Aaalice/<domain>`；当前域为 `Aaalice/control`、`Aaalice/prompt` 与 `Aaalice/tools`。
- `nodes/_lib/` 只放不依赖运行中 ComfyUI 的纯逻辑，并可直接单测。
- 运行时错误保留原始原因与参数上下文；不得把导入错误伪装成未实现。
- `validate_inputs()` 只校验执行前可获得的字面量、类型或前端注入 payload；连接输入在该阶段没有上游运行值，禁止对其做非空或内容语义校验。此类检查必须放在 `execute()` 拿到真实上游值之后。
- HTTP 公共认证 header 不得无条件包含 `Content-Type: application/json`；无 body 的 GET 只发送认证等实际 header，JSON POST 使用客户端 `json=` 参数自动生成编码和 Content-Type，避免服务端把空 GET body 当作无效 JSON。
- 模块关系与状态真源见 [`architecture.md`](docs/development/architecture.md)。

## 4. 前端、渲染与状态

### 4.1 生命周期与状态

- `WEB_DIRECTORY = "./js"`；业务扩展使用 `app.registerExtension`，共享模块不得自行重复注册。
- `js/extension.js` 是前端唯一包入口；每个业务扩展模块必须由该入口显式静态导入，不得假设 `WEB_DIRECTORY` 会自动执行目录中的其它 `.js` 文件。新增节点时必须用入口契约测试锁定该导入。
- 前端相对 import 必须按浏览器中的 `/extensions/ComfyUI-Aaalice-Nodes/` 挂载路径计算，不能按仓库文件系统层级猜测；新增或移动嵌套模块后必须用契约测试确认所有相对 import 只解析到本包公开路径或 ComfyUI `/scripts/`，避免单个 404 阻断整个 `extension.js` 模块图。
- 模块拆分或新增 barrel re-export 时，本包相对路径的 named import 必须能在目标文件或其 re-export 链中解析到稳定的 named export；提交前运行 `node --test tests/frontend_import_paths.test.js`，该契约不替代 ComfyUI 公共脚本的运行时验证。
- 所有节点默认都可能位于根图、任意层级 Subgraph 或被多个 wrapper 复用的共享 Subgraph 定义中。查找节点、连线、事件、动态槽、布局和事务必须从 `node.graph` 及真实父子图关系出发；跨图连接只走 ComfyUI 官方 Subgraph / virtual-output 协议，执行注入和事件反查使用完整限定执行 ID。禁止用 `app.graph`、当前可见画布、裸 Node Id、标题或槽位下标猜测所属图和身份。
- 交互节点覆盖新建、加载、复制和 setup 补挂路径；不得绕过 ComfyUI 生命周期。
- `onConfigure` 不是工作流恢复完成的可靠终点。依赖持久状态发起查询、同步控件或计算派生视图的节点，必须在 `loadedGraphNode` 再以 `node.properties` 为最终真源执行一次幂等恢复；已挂载不能成为跳过恢复的理由。恢复请求必须取消或代际淘汰初始化请求，禁止默认状态的迟到结果覆盖工作流状态。
- 业务 DOM widget 必须通过 `js/lib/dom_widget_lifecycle.js` 的 `addLifecycleDOMWidget()` 同步挂载，禁止在业务模块直接调用 `addDOMWidget()`；异步 i18n 就绪后只更新文案和绘制。Nodes 2.0 的 WidgetDOM 渲染 key 不包含宿主生成的 widget UUID，撤销、重做或重载在同一 Vue 更新内以原 Node Id 重建节点时会复用旧组件，因此每个重建实例必须获得不同但不进入序列化的渲染类型，确保新 DOM 元素重新执行挂载。升级 ComfyUI 前端时必须重新核对 `useProcessedWidgets.ts` 与 `WidgetDOM.vue` 的 key 和挂载契约，不得用延迟、轮询或保留旧 DOM 绕过。
- DOM widget 挂载器、虚拟列表和布局模块可能在构造期间同步触发 render、near-end、resize 等回调；回调依赖必须在调用挂载器前完成初始化，禁止闭包读取仍处于 TDZ 或尚未赋值的控制器。挂载失败必须复位 mounted 标记、输出含堆栈的原始错误并允许生命周期重试。
- 工作流持久状态以 `node.properties` 为真源。内部 payload 不暴露为 Schema widget，执行时由 `graphToPrompt` 注入。
- 状态变化必须覆盖保存、加载、复制、撤销/重做和执行路径。
- Dashboard 页面内容滚轮只能滚动当前页面，不得把顶部、底部或内容不足一屏解释成页面切换。页面切换只由页眉左侧页面按钮或独立的 Page Rail 触发；Rail 常态在 Dashboard body 右侧占用固定 38px 独立列显示页面圆点，悬停或键盘聚焦时胶囊可越出该列展开页面名称，但圆点列不得覆盖 Scroll Surface 或控件。Rail 只通过点击和键盘导航选择页面，滚轮不参与页面切换；选中胶囊整体使用强调色和发光边缘。每个侧栏根独立拥有 Rail、过渡快照、光标和计时器，重挂、工作区切换、隐藏或销毁时清理自身资源，不得影响其它根；页面回到原 Page Id 时折叠为无过渡 no-op。宿主移除、替换或隐藏自定义页签根时必须立即清理该根的锚定浮层、Tooltip 与 Context Menu，不得关闭其它根的菜单；首次挂载或持续 `v-show` 隐藏的根不得参与完整 Provider/控件重建，重新显示时补一次渲染，焦点请求只能由发起操作的可见根消费；多根生成的 DOM 控件 id 必须按根隔离，脱离根挂载的浮层必须记录显式 owner，控件销毁必须清除自己的浮动编辑器并闭合未完成手势。
- Dashboard 的结构重绘必须按侧栏根和 Page Id 保存并恢复当前 Scroll Surface 位置；删除、拖拽提交、布局命令和普通结构失效不得使当前页面回顶，切换页面后恢复该页自己的会话位置，切换工作流时清空旧图记忆。布局拖拽的目标项保留用户指定落点，发生矩形碰撞时只把原位置相交项及其后续碰撞链稳定向下挤开；缩放碰撞仍只顺延本次缩放项，二者都不得隐式执行全页整理。框选跨越页面散项与组内成员时必须把相关 Layout Group 作为完整根级单元移动，禁止用 `moveItems(..., { groupId: null })` 隐式解除成员关系或删除空组；解除分组只允许显式命令。由框选创建 Layout Group 时，新组必须锚定选区原有的最小行列，新增外壳占位沿用插入碰撞语义向下挤开相交链，禁止用寻找空位的放置语义把新组追加到页面末尾。布局模式下，Layout Group 的标题、边缘和内容必须共同作为卡片入组目标，并显示不改变尺寸的明确接收态；松手按稳定顺序放入目标组首个可用位置，组扩大时保持外部锚点并下推相交链。拖回原组只移动成员，整组不得嵌套，空原组必须清理。
- Dashboard 布局模式的选区只有一套状态真源；单击、`Ctrl` / `Meta` 多选、框选和键盘选择都必须让当前选区中的页面散项、组内成员与分隔项立即显示同一层不改变占位的明确选择轮廓。Layout Group 的组合样式不得以更高 CSS 优先级覆盖成员的瞬时选中反馈。
- Dashboard 布局模式的框选命中面覆盖整个工作区内容表面：空白区域可起框，普通单击/拖动任意卡片先选中并可直接拖动，`Ctrl` / `Meta` / `Shift` / `Alt` 修饰键才进入加选或减选框选；按钮、输入和缩放手柄不得被接管。全选只能由显式“全选布局项”按钮触发并按根级散项与 Layout Group 组合单元选择；禁止注册 `Ctrl` / `Meta` + `A` 全选快捷键。该按键在侧边栏非文本区域必须被消费且不得传给 ComfyUI 画布，文本输入只保留浏览器原生全选。
- 局部重绘不得无条件销毁仍有效的焦点、Popover、Dialog 或操作状态；只有锚点失效、节点移除或对应生命周期结束时才清理。
- 文本输入期间必须保留输入元素的 DOM identity、焦点、光标/选区和 IME composition；实时搜索或筛选只更新结果区域，禁止在每次 `input` 事件中重建包含输入框的根视图。
- Dialog 挂载失败时清理部分状态、记录原始错误并显示可见错误。
- `graph.onTrigger`、`onNodeAdded`、`onNodeRemoved` 等图级回调是 ComfyUI 前端管理器会安装、链式调用并在重建时恢复的单一插槽，不得由业务节点长期占用或自行覆盖来监听属性变化。优先使用官方图事件、节点生命周期或保留原描述符语义的节点级观察；任何包装都必须幂等、可卸载，且不能截断 Nodes 2.0 的事件链。
- 侧边栏绑定画布高亮由 `js/lib/canvas_control_binding_highlight.js` 统一维护：Classic 的标记变化必须调用 `LGraphCanvas.setDirty(true, true)`；Nodes 2.0 的候选 widget 必须遵循 ComfyUI `useProcessedWidgets` / `shouldRenderAsVue` 的可见性、去重和 `canvasOnly` 规则，`sourceWidgetName`（旧协议）或宿主 widget 名（新协议，widgetId 投影）以 `$$` 开头的 promoted canvas-only pseudo widget 不参与 DOM 行映射；同类不可序列化 / canvas-only pseudo widget 也不参与普通节点的原生 fallback 支持判定，但可序列化的 `$$` 自定义 widget 仍必须阻断猜测。含 `preview_text` 与 canvas image preview 的根图首次加载必须直接高亮，不得依赖进入/退出子图触发补同步。
### 4.2 性能优化硬规则

- 性能问题必须先按“本包、ComfyUI 前端、第三方插件、浏览器/环境”分层归因，再在责任边界内修复根因。不得为掩盖本包的全量重建、图遍历或 DOM 抖动而修改 ComfyUI 内核或其它插件，也不得用节流、延迟、轮询、静默降级或限制数量制造表面流畅。
- ComfyUI 前端把自定义侧栏页签的 render 回调包在 Vue effect 中，渲染期读取的响应式状态（widgetValueStore 等）会成为依赖；控件写值后宿主可能再次调用 render。只要页签仍拥有原工作区树，重复 render 必须立即幂等返回，禁止把响应式重入解释为结构失效。Dashboard 值预览与提交按稳定 Binding Key 通过已挂载 `controlView().update()` 定向同步所有可见投影，不得调用 `renderWorkspace()`、重新解析 Provider、替换卡片 DOM 或依赖重建后的补动画；只有布局、绑定、控件类型、动态选项或可用性等结构变化才允许 `scheduleRender`。真实结构失效若发生在连续手势中，使用 `js/lib/workspace_controls.js` 的手势计数延后，并在手势结束后补一次完整渲染。
- `computeSize()`、`getMinHeight()`、`getMaxHeight()`、`_arrangeWidgets()`、`onDrawForeground()` 和 `onDrawBackground()` 都属于画布逐帧热路径：必须保持有界 O(1)，禁止遍历图、规范化状态、重建数组/Map、查询 DOM、读取计算样式或安装监听器。派生布局与主题值按节点及结构输入缓存，在结构提交、加载恢复、主题变化和移除时精确失效；位置和无关高度变化不得打穿缓存。
- 控件值变化必须通过保留的 `controlView().update()` 定向更新；不得重建 Dashboard DOM、重算结构布局或重新枚举 Subgraph promoted widgets。控件、绑定、选项或运行契约变化才进入结构同步。
- Dashboard 的 Subgraph Provider 必须按宿主、Adapter Revision、widget 对象列表与稳定 Control Id 缓存 `Control Id -> promoted widget` 结构索引；解析已绑定控件时只重新适配目标 widget，禁止每张卡片重复适配全部兄弟 widgets。索引不得缓存参数值、availability、动态 options 或 preset payload，这些状态每次从真实 widget 读取；Adapter 变化、widget 对象结构变化、`graphChanged`、工作流恢复和 `CONTROL_HOST_INVALIDATED_EVENT` 必须失效缓存。回归测试必须同时锁定“缓存命中时只适配目标”和“失效后重新建立索引”。
- Nodes 2.0 重挂观察器必须先按 `data-node-id` 等稳定身份过滤相关 mutation，再按 animation frame 合并；同一模块每帧最多进行一次 DOM 查询，不得按节点各自全页扫描或用“立即 + rAF + timeout”重复补写。富 DOM widget 默认允许宿主 `hideOnZoom` 低缩放降级，确需低缩放持续可见时必须说明业务理由。
- KJ Set/Get 的虚拟连线绘制和性能开关属于 KJNodes，不得由本包 monkey patch。性能诊断必须把本包热路径与 KJNodes 的 `Show links`、单节点 `drawConnection` 及 Performance 设置分开验证，避免把第三方逐帧绘制归因给本包。
- 性能回归必须覆盖普通点击、连续控件手势、节点/子图选中与移动、画布平移缩放、根图和嵌套/共享 Subgraph，并用调用次数、对象 identity、DOM 数量和浏览器长任务证明热路径没有退化。自动测试通过后仍需在真实重型工作流复测；静态检查不能代替实际响应延迟结论。

### 4.3 DOM widget 与缩放

- DOM widget 通过内容下限声明稳定最小尺寸；`computeSize()` 不得把当前 `node.size` 当作最小值，也不得用延迟或重复 `setSize()` 与原生布局争夺尺寸真源。
- 可手动缩放的 DOM widget 不得把当前 `scrollHeight`、`clientHeight`、wrapper 高度或已拉伸后的几何当作 `getMinHeight()`；这些值会形成只增不减的反馈环。需要容纳可增长列表时使用与当前尺寸无关的稳定下限，并在空间不足时由内容区滚动。
- Nodes 2.0 的 `useProcessedWidgets` 只把 `computeLayoutSize()` 归约为 `hasLayoutSize`，`NodeWidgets` 随后把该 widget 设为 `auto` 网格行，并在存在 `auto` 时让整个 widget stack `flex: 1`；它不会用 `getMinHeight()` / `getMaxHeight()` 生成 Vue 网格轨道。因此多个 DOM widget 会分享节点新增高度，造成工具栏、列表或空状态越拉越开。Classic 仍通过这两个高度参与 LiteGraph 分配；需要“节点可继续增高、内容保持顶部紧凑”的双模式节点，必须分别约束 Classic widget 高度和 Nodes 2.0 widget stack 的顶部内容轨道。`WidgetDOM.vue` 在 Nodes 2.0 会把业务元素挂进 `.lg-node-widgets`，Classic 才使用独立 `.dom-widget` overlay，禁止根据其中一种模式的 DOM 结构推断另一种。Nodes 2.0 原生缩放还只读取节点元素 inline `min-width`，不读取 computed CSS；业务最小宽度必须同步到真实节点元素并在重挂后恢复。`WidgetDOM.vue` 容器对 `pointerdown` / `pointermove` / `pointerup` 使用 `.stop` 阻断冒泡，widget 内手势若监听 window / document 必须走捕获阶段，否则拖拽开始后收不到后续事件。上述均为当前前端内部契约，升级时重新核对 `domWidget.ts`、`useProcessedWidgets.ts`、`NodeWidgets.vue`、`WidgetDOM.vue` 与 `useNodeResize.ts`。
- Nodes 2.0 的节点外层只承载轮廓、选择态和命中，实际内容尺寸由内部节点表面及布局状态拥有。禁止只给外层节点设置 `min-width` / `min-height`；否则旧工作流保存的较小内容尺寸不会同步，形成“外框放大、内容仍窄”的透明空壳。调整默认或最小尺寸时必须同步真实内容层与布局尺寸，并用低于新下限的旧节点验证外框、背景和控件宽高一致。
- Nodes 2.0 内需要独立滚动的 DOM 区域必须遵循当前 ComfyUI 前端的焦点式滚轮捕获协议：包含滚动区的可聚焦业务根声明 `data-capture-wheel="true"`，并保证滚轮到达宿主捕获阶段前其自身或后代已经取得焦点。宿主 `TransformPane` 在捕获阶段先于目标元素处理 `wheel`，因此禁止试图在滚动区自身的 `wheel` 回调中补焦点；需要悬停即滚动时应在 `pointerenter` 等更早事件中建立焦点，同时不得抢走外部文本编辑控件的焦点。业务代码不得用 `preventDefault()`、`stopPropagation()`、捕获阶段拦截或伪造并转发 `WheelEvent` 与画布争夺滚轮；当前 Standard 导航模式下的 `Ctrl` / `Meta` + 滚轮必须保留给宿主缩放。
- `data-capture-wheel` 属于前端实现契约，不是 `addDOMWidget` 公共文档承诺。新增滚动 DOM widget 或升级 ComfyUI 前端时，必须先核对当前安装版本的 `useCanvasInteractions`（或其后继实现），不得从旧项目复制滚轮补丁。
- 全尺寸 DOM widget 必须让出 LiteGraph 原生缩放角、拖拽和放置命中；CSS `pointer-events` 不能代替原生命中检测。
- Classic 会先执行 `node.getWidgetOnPos()` 再检查 `findResizeDirection()`；即使没有自绘 DOM，贴近底角的原生 widget 也可能吞掉完整缩放命中。此类纯原生节点只允许在 `beforeRegisterNodeDef` 按精确 node id 为对应 `nodeType` 安装 `js/lib/native_widget_resize.js`，禁止用全局 `nodeCreated`、`loadedGraphNode`、全图扫描、运行时名称猜测或改写 `resizable` 扩大影响面。全尺寸 DOM 节点复用 `js/lib/dom_widget_resize.js`，两类路径均禁止自绘假手柄。
- `getWidgetOnPos()` 是纯命中查询，不得读取全局按下状态、注册 document 监听器、切换 class 或启动缩放副作用；只有宿主已将当前节点设为 `resizing_node` 后，才能在 `onResize` 中进入缩放期 DOM 让渡。固定节点由宿主将 `resizable` 设为 `false`，业务修复不得覆盖；Nodes 2.0 的四角手柄也由宿主渲染，包内只负责让出命中和同步真实尺寸。回归必须证明非目标节点完全不变，并分别验证固定时不可缩放与取消固定后四角可用。
- DOM overlay 根和 Comfy wrapper 默认不接收指针，只给真实交互控件开启命中；缩放期间根及全部后代必须停用命中，底部和四角保留原生手柄安全区。
- DOM widget 与原生 slot 共用空间时使用 LiteGraph 的叠放语义，不得通过隐藏槽或事后劫持 `arrange()` 修正重复高度。
- 自定义布局在 `onResize` 中从新尺寸重算 DOM 几何、真实 slot 和 Nodes 2.0 标记，并请求画布重绘。
- DOM widget 内需要让某个子区域吃掉剩余高度时，优先使用 flex 列布局加 `flex: 1`；不要用 `grid-template-rows: auto minmax(0, 1fr)` 配合子项自动放置。可隐藏兄弟项（`display:none`）不参与网格后，可见子项会被自动放置进 `auto` 行只保留内容高度，空的 `1fr` 行照样领走全部剩余空间，形成“外层已撑满、内容不跟随”的假性失效，且 Classic 与 Nodes 2.0 同时中招。必须用 grid 行模板时，为每个子项显式指定 `grid-row`，不依赖文档顺序。
- 排查“元素没随容器撑满”类布局问题时，以外层到目标的实际几何链（`getBoundingClientRect`）为准逐层定位，禁止只看目标元素的 CSS 声明下结论；外层尺寸正确不代表内部排版正确。
- 连续动画控件必须保留动画元素的 DOM identity，只更新 class、style、data 和 ARIA 状态。

### 4.4 原生槽与双模式

- Canvas/native 层负责静态表面、布局反馈和真实 slot；DOM overlay 负责交互、焦点、键盘和 aria。
- Classic 使用 LiteGraph 原生 slot；Nodes 2.0 使用 Vue slot DOM。禁止用 CSS 圆点伪造 socket。
- Nodes 2.0 确需监听 DOM 重挂时使用幂等 `MutationObserver`；不需要重挂的节点不得常驻观察器，所有路径禁止持续轮询。

### 4.5 控件适配

- 控件身份、显示名称、值和选项属于不同变更域：名称变化只更新展示，控件、绑定、类型或运行契约变化才进入结构同步。稳定 Binding Identity 必须独立于标题、位置和当前数组下标。
- Dashboard 数值卡片可保存卡片级 `numericRange`，只覆盖侧边栏 Integer / Float 控件的最小值、最大值和步长；不得回写 Provider Control Spec、原 widget 选项、联动兼容签名或节点当前值。覆盖值必须为有限数值、满足 `min < max`、`0 < step <= max - min`，Integer 域全部使用整数，并且不得越过 Provider 已声明的有限边界；缺失、失效或重置时回退节点默认值。该设置属于 Dashboard 布局状态，必须随工作流、复制和完整侧边栏预设保存。
- 第三方适配器只能通过公开注册与校验 API 写回真实 widget；跨子图查找、事件和创建操作使用节点所属 graph，不能退回 `app.graph` 猜测。
- 自动适配必须在创建、加载、复制、重命名和结构变化后幂等收敛；手动刷新只能作为诊断恢复操作，不能掩盖缺失事件、错误真源或竞态。
- Dashboard V4 一张控件卡片允许一个主 `binding` 与多个有序 `linkedBindings`；主控件唯一拥有展示和读值语义，附加目标只参与写入。兼容性和原子写入只能走 `js/lib/control_binding_set.js`：要求同一 graph、Provider 明确可联动、Control Spec 类型和值域一致（含 Integer / Float 与图像目录），先快照全部目标并在一个图事务中写入，任一失败必须回滚全部已触达目标；Provider 不得吞掉 `false`、失败对象、Promise 或异常。动态选项为空、未赋值或临时不可用只暂停整卡写入，不能判坏持久关系；第三方 Seed 只有同时声明数值和执行后行为 codec 才可联动；每次 `graphToPrompt` 序列化前及 `queuePrompt` 完成后都必须以主 Seed 收敛整组状态。禁止 renderer、业务节点或工作区散落循环写入。预设必须展开并按无分隔符碰撞的稳定 Binding Key 去重全部目标并迁移旧 Key；来源同步只以主 binding 认领卡片，来源删除或类型漂移不得静默删除含附加目标的整张卡片。内部 Subgraph 节点仍不得被直接穿透绑定，只允许宿主公开 widget。
- 参数控件的“渲染类型”和“选项来源”必须由独立适配层管理。第三方类型通过稳定 adapter 注册其发现条件、身份、读写、序列化、校验和可用性；未检测到真实来源或来源为空时不显示对应类型，业务节点不得散落硬编码探测。
- `js/lib/controls/registry.js` 注册的每个 renderer 必须通过 `js/lib/controls/contract.js` 的 `controlView()` 返回完整控件视图，不能手写 `{ root, destroy }` 等不完整对象；宿主会统一读取 `headerAccessories`、`kind`、`headerOnly`、`update` 和 `destroy`，新增 renderer 必须配套契约测试或实际挂载烟测，避免控件创建阶段异常后整张侧边栏只显示错误状态。
- 绑定画布节点的侧边栏控件标题必须以对应节点的实时公开显示标题为真源（优先使用 `getTitle()`），不得在 Provider 或 workspace 层写死通用标题；节点重命名、加载和复制后的标题必须通过现有事件刷新链同步，用户明确设置的 `labelOverride` 才可以覆盖源标题，稳定 binding identity 不得依赖标题。
- 同一控件类型在侧边栏和公开子图 widget 中必须复用同一控件适配与状态协议。图像控件统一提供资产浏览、独立上传、清空和预览；Seed 统一持久化“数值 + after-generate 行为”，固定、递增、递减、随机四种模式不得退化成锁定/解锁布尔值。
- Dashboard Component Note 是卡片或分隔项的布局元数据，随工作流、复制、完整预设和便携备份保存，但不得进入 Binding 身份、Provider 控件值或联动兼容签名。Markdown 编辑与预览必须复用 vendored `marked`、DOMPurify 和共享 Dialog / Switch；完整说明只能由标题旁低干扰、可聚焦的信息徽章显式打开，整张卡片或标题悬浮不得直接展示长说明。

## 5. 领域不变量

- `SimpleNotify` 只表示执行到达，不表示并行分支完成或队列清空；通知副作用只发生在前端。
- `GroupIsEnabled` 在 graphToPrompt 时按组标题快照组成员 mode 并注入 payload，探测器自身不计入判定；组不存在或为空时显式失败，不猜测状态。
- `GroupLogicProbe` 复用同一快照注入机制（`js/lib/group_probe.js`），多条组条件按扁平 AND/OR 组合，不提供嵌套表达式；结果只输出单个布尔，懒执行分支交给 ImpactConditionalBranch 等既有节点，不在本包重复实现。
- Booru Gallery 内容黑名单属于当前 ComfyUI 用户的应用级持久设置，只能存放在用户目录的 Gallery 设置文件中；不得写入 `node.properties`、工作流 JSON、节点默认值或切换工作流时会重建的前端状态。加载、切换、新建工作流以及重启 ComfyUI 都不得清空黑名单。
- 产品术语以 [`CONTEXT.md`](CONTEXT.md) 为准，协议决策以 accepted ADR 为准。

## 6. UI、主题与本地化

- 新增或修改任何包含用户可见界面的功能时，若当前环境提供 `frontend-design` skill，必须在设计和实现前优先加载并使用；同时依据本节与 [`ui-system.md`](docs/design/ui-system.md) 完成视觉设计，不得等功能代码完成后才临时补一层样式。
- 本项目默认不向用户展示或要求选择多个视觉方案；除非用户当次明确要求比较方案，否则实现者必须结合现有界面、共享组件、主题 token 与产品职责自行完成一个经过取舍的最佳方案，并直接实现。不得把“先给方案”“等待选择”当作推迟界面完成度的理由。
- UI 功能的完成标准同时包含美学、设计感、可读性、空间利用度和交互舒适度。实现时必须整体检查信息层级、布局比例、留白与对齐、色彩与状态语义、控件密度、不同尺寸适配、键鼠操作、反馈动效、可访问性及明暗主题；任何一项明显粗糙都视为功能尚未完成。
- 界面设计必须与功能逻辑在同一实施轮次完成并接受同等强度的自检。禁止以“功能可用”为由交付浏览器默认控件、随意堆叠的按钮、含义不清的图标、拥挤或空耗空间的布局、缺失状态反馈的交互，以及与项目设计系统割裂的临时样式。
- 状态与诊断信息分层：状态信号优先由容器级视觉承担（边框、色调、图标徽章），内容区只保留一个明确的主要行动；同一句状态文案不得在同类组件的每个实例上重复堆叠，失效原因、来源身份等诊断信息进入 Tooltip 或按需展开，不占用常态空间。
- 任何状态区块以组件可能出现的最小宽高为设计基线，而不是按理想尺寸设计后被动截断。交付前必须在最窄与最矮尺寸下确认：无逐字竖排、无文字叠印、无被裁切或不可达的按钮和输入；空间不足时按“详情行 → 辅助文案 → 图标徽章”的顺序收敛，主要行动按钮始终完整可见、可点。
- 新 DOM 界面复用 `js/lib/ui.js` + `ui.css`；业务布局放在 `js/lib/theme.css`，不重复实现 button、field、empty state 或 dialog。
- 节点原生层、DOM overlay、Dialog 和 Popover 的职责及主题映射以 [`ui-system.md`](docs/design/ui-system.md) 为准；DOM 根不得重复绘制节点外壳。
- 新增或修改任何用户可见功能时，功能逻辑完成不等于界面完成；必须同时检查视觉层级、比例、留白、对齐、色彩、状态辨识、空间占用、动效和主题适配。禁止用过大的实心标记、大面积高不透明度遮罩、浏览器默认外观或临时占位样式充当正式设计；选中、加载、错误、禁用和空状态都必须在不压制主要内容的前提下清楚、协调且可读。
- 本项目不采用依赖极细分割线和大片留白的极简风格。普通区域禁止默认使用连续横线、竖线或密集 `1px border` 切割层级；优先通过错层表面、空间聚合、圆角轮廓、柔和边缘阴影、局部身份色和内容密度变化建立结构。分割线只保留给表格行列、时间轴、树关系、焦点、错误或媒体裁切等具有真实语义的场景，不能作为“不会设计分区”的兜底。
- 普通激活态可以跟随节点强调色；警告、危险、筛选颜色和多档业务状态保留自身语义，且颜色不能成为唯一状态信号。
- Switcher、Select、折叠搜索、Dialog、Popover 等交互必须优先复用共享组件；具体动画、间距、状态和可访问性契约只在 [`ui-system.md`](docs/design/ui-system.md) 维护，业务模块不得复制实现。
- Dialog 内触发确认、警告或二级编辑时必须进入同一共享 Dialog 层级栈；禁止在自绘高层遮罩上直接调用未经层级验证的宿主弹窗。交付前确认后打开的浮层在视觉、指针和键盘焦点上均位于当前 Dialog 之上，不能把“正在等待被遮挡的确认”表现成按钮无响应。
- 折叠搜索存在有效查询时必须使用共享的已应用搜索状态，并在 Hover / Focus 提示中显示完整查询；收起搜索不得静默清空或隐藏仍生效的筛选状态。
- 所有面向用户展示的标签列表必须保留类别结构，并渲染为按类别分色的胶囊集合；不得退化为逗号文本、纯文本行或无差异灰块。类别色优先用于低饱和填充、文字和柔和边缘阴影，禁止同时叠加高强度彩色边框与彩色背景。每个胶囊必须是独立 DOM、独立命中单元，并提供至少一个与当前上下文相关的单项操作；“只读”只表示不能修改标签文本，不得阻止详情页加入黑名单、复制、筛选等业务操作。
- 组件说明徽章只负责橙黄色问号标识和安全 Markdown 悬浮预览；新增、编辑和删除说明必须走组件右键菜单，徽章点击不得打开编辑器。
- 节点内 Tag List 必须允许标签换行并保证末尾新增输入框始终可达；不得让默认标签把输入框挤到不可见的单行横向滚动末端。节点缩短时由 Tag 区域内部纵向滚动，不得反向锁死节点最小高度。
- 节点颜色同步只走既有生命周期，禁止为颜色或主题同步增加持续轮询。
- Toast 只用 `app.extensionManager.toast.add`；可有无状态参数封装，禁止自建容器、队列或动画系统。
- 静态 `iconName` 与 `icon("…")` 必须存在于共享图标表，并通过图标契约测试。
- 颜色来自 ComfyUI token；禁止写死品牌色或只适用于暗色主题的正文色。
- 不得根据变量名称推断主题 token 的实际颜色或对比度。尤其 `--p-primary-contrast-color` 在 ComfyUI 主题中可能解析为深色，不能直接当作“白色图标”；深色或品牌色实心表面上的浅色图标优先使用 `--aa-ui-on-media`。涉及宿主顶栏或外部主题覆盖时，必须在真实挂载位置用 `getComputedStyle()` 核对按钮及 SVG / path 的 `color`、`stroke`、`fill` 和关键 token 解析值；静态 CSS 契约测试不能替代实际计算样式验收。
- 新 DOM 根使用 `--aa-ui-*` token 前必须加入 `ui.css` 的共享主题作用域，并用契约测试确认关键 token 可继承；选择器命中不代表含未定义自定义属性的颜色声明实际生效。
- 仅维护 `locales/{en,zh}/{main,nodeDefs}.json`。`nodeDefs.json` 管节点定义，自绘 DOM 使用 `main.json` 和 `js/i18n.js`。
- 序列化 id、COMBO 值和路径使用稳定英文；修改用户文案时同步两种语言。
- 所有节点的 V3 Schema 与 en/zh `nodeDefs.json` 显示名称必须以同一语义 emoji 开头；新增或重命名节点时同步三处并通过契约测试。
- 本包新增的节点菜单以 emoji 开头，并进入 en/zh 本地化文案。
- 只有用户明确要求视觉探索、方案比较或原型评审时，才制作多方案演示；正常功能开发直接完成并实现单一最佳方案。

### 6.1 按钮与操作层级

- 写按钮代码前必须先确定 `primary / secondary / utility / danger` 层级；一个独立界面或局部任务区原则上只能有一个 primary。相邻且同级的操作必须使用一致的高度、圆角、图标尺度、间距和表面强度，禁止逐个按钮随手配色、随手定尺寸。
- 紧凑节点顶栏、卡片悬浮层和 Popover 中，刷新、设置、翻页、关闭、展开等高频且含义明确的工具操作优先使用带本地化 Tooltip 的图标按钮；确实需要文字解释或承担当前区域唯一主操作时才使用文字按钮。禁止在一排轻量图标之间无理由插入高饱和、大面积实心文字按钮。
- 实心强调色只用于当前区域唯一且明确的主操作；普通导航、跳转、刷新、设置和取消默认使用 ghost 或低强度 tonal 表面，危险色只用于破坏性操作。按钮不能比其所服务的图片、内容或主要输入更抢眼。
- 圆形按钮只容纳单个图标；文字按钮不得强行做成圆形。图标必须来自共享图标表并准确表达动作，禁止为了省事复用语义相近但实际含义不同的图标，例如用刷新图标冒充加载状态或跳转动作。
- 按钮必须复用 `button()` / `iconButton()` 及共享 token；同一种按钮模式出现第二次前应优先收敛为共享组件或共享 variant，不得在业务 CSS 中持续堆叠一次性补丁修饰同类按钮。
- 每个按钮都必须具备可辨的 normal、hover、focus-visible、active、disabled 以及适用时的 loading 状态；动效应短促克制，不能依靠持续抖动、夸张位移或高亮光晕掩盖比例和层级问题。
- 交付前必须把按钮放回真实上下文，至少检查默认宽度与最窄支持宽度下的相邻关系、视觉重量、对齐、点击目标、文案长度和中英文状态。出现孤立高饱和色块、同组按钮风格不一、操作含义重复、图标与文字职责冲突、按钮挤压内容或需要用户再次指出“丑”时，均视为功能未完成。

### 6.2 设置界面、信息密度与渐进披露

- 设置页、管理页和复杂 Dialog 在实现前必须先写清当前用户任务、当前操作对象和唯一主操作；首屏必须能立即回答“我在哪里、正在配置什么、下一步做什么”。用户找不到焦点、看不到完整内容或需要在多个区域来回猜测时，视为信息架构失败，不能进入样式微调阶段。
- 用户可见界面禁止使用副标题。每个区域只保留一个清晰、可独立理解的主标题或主标签；必要的风险、约束和帮助信息必须改用正常字号的就近正文、Tooltip 或按需展开帮助，不得在主标题下堆叠弱化小字。页面身份、标题同义改写、宣传文案和显而易见的操作解释必须删除。
- 空间不足时先删减说明和重复层级，不得通过缩小文字来塞进界面。任何用户可见文字的 CSS 字号不得低于 `10px`；按钮、输入、导航、列表主标签和表单标签原则上不得低于 `11px`。短 ID、计数和弱化元数据也不得突破 `10px` 下限；空间不足时必须缩短文案、减少同时显示的信息或渐进披露。
- 多来源、多账户、多模型或多对象配置禁止把所有完整表单同时展开。默认只展示当前选择对象的详情，其余对象使用主从列表、可访问标签页或按需展开；新增对象时布局和认知负担不得随完整表单数量线性增长。
- 一个界面只保留一套主要导航。禁止同时堆叠重复标题区、宣传式 Hero、横向分页、卡片内二级导航和对象选择器来表达同一层级；Dialog 标题已说明页面身份时，不得再用大标题、小标题和说明卡重复占据首屏。
- 复杂设置优先使用“稳定导航 + 当前页面 + 当前对象详情”的结构，并通过渐进披露隐藏非当前任务。摘要、能力说明和辅助信息必须弱化，不得与表单、当前状态或保存操作争夺注意力。
- 默认只允许页面内容区承担主要纵向滚动。禁止在页面滚动区内再放多个带独立滚动条的完整表单、列表卡片或分级选择器；确有必要的局部滚动必须有稳定高度、明确边界，并且不会隐藏标题、当前对象、错误反馈或主操作。
- 主从双栏或多列 Dialog 中，每个独立滚动列必须从 Dialog 内容行到实际滚动元素建立完整的可收缩高度链：中间 Grid/Flex item 均声明 `min-height: 0`，滚动元素通过 `flex: 1` 或显式 `minmax(0, 1fr)` 获得剩余高度并设置 `overflow-y: auto`。禁止只给自然高度列表添加 `overflow` 后依赖父层裁切；Header、Footer 保持独立固定行，最高复杂度数据下列表首尾都必须可达。
- 首屏不得出现被裁掉的标题、只露出一半的卡片、无法看到结尾的表单或依赖用户先滚动才能理解的当前状态。切换页面或对象时滚动位置必须可预测：新对象默认从内容顶部开始，返回时是否恢复位置必须由统一状态明确管理。
- 空间不足时先减少同时可见的信息、收起次要说明或切换响应式结构，禁止通过继续缩小文字、压扁控件、制造嵌套滚动或让多个完整区域并排来硬塞内容。设置表单必须在默认宽度和最窄支持宽度下保持清晰的阅读顺序。
- 交付前必须以真实数据检查最高复杂度状态：最多来源、最长中英文文案、已配置与未配置混合、错误反馈、最窄支持宽度和常用窗口高度。若用户需要“看半天”、无法一眼定位当前对象、主要表单不能完整浏览或主操作被淹没，均视为功能未完成。

### 6.3 悬浮预览、信息浮层与色彩语义层级

Tooltip、Hover Card、已选摘要浮层等多实体信息预览**不得**落成“整块中性灰 + 单一弱化正文色”。若浮层承载来源、分级、类别、计数或多字段摘要，必须用可扫描的色彩语义建立层级；单调灰面视为视觉未完成。

- **先定角色，再上色。** 写样式前先拆清本浮层里有哪些语义角色，并分别映射：
  1. **身份色（Identity）**：稳定对象归属，如 Booru Source、节点强调色回退；只占边框、左侧细条、角向光晕、来源胶囊与序号块等小幅表面。
  2. **状态/分级色（Status）**：Rating、成功/警告/危险等；沿用既有语义色表，不得改成装饰色。
  3. **类别色（Category）**：标签类别、分区类型等可枚举维度；同一维度在卡片、列表、浮层中颜色必须一致。
  4. **字段芯片色（Meta chip）**：分辨率、格式、计数等短元数据用低饱和 tonal 胶囊区分种类，而不是全部同一灰胶囊。
  5. **正文默认色**：无类别信息的长文本仍用 `--aa-ui-text` / muted，不把整段正文刷成高饱和色。
- **色彩服务扫读，不服务装饰。** 优先：边框、细条、浅洗背景、胶囊描边/底、正文 token 着色、轻阴影带身份色。禁止大面积高饱和实心底、彩虹渐变堆叠、或让浮层外壳比正文内容更抢眼。
- **分层而不是平涂。** 典型结构：外壳用身份色边框 + 角向径向浅晕；顶栏用身份色浅洗与 inset 细条；元数据区用多色芯片；正文区可对已知类别 token 着色，分隔符保持 muted。一整张卡片只用同一灰阶时，必须有充分理由（例如纯错误/空状态）。
- **有结构就保留结构上色。** 最终输出若可由类别重建（如标签按 artist/character/copyright/general/meta 生成），浮层应渲染为带 `data-category`（或等价）的 token，而不是先拼成纯字符串再丢失类别。无法恢复结构时，才退回单色正文。
- **Token 与挂载。** 颜色必须来自 ComfyUI / `--aa-ui-*` / 领域 CSS 变量（如 `--aa-gallery-source-tone`），可用 `color-mix` 降饱和；允许 `var(--p-…, fallback)` 作回退，禁止写死仅暗色可用的正文色。身份色若影响浮层外壳，须把 `data-source` 等身份属性挂到**实际上色的根节点**（含 `document.body` 挂载的 tooltip 根），不能只写在内部子节点却指望外壳继承。
- **芯片与 token 模式。** 元数据芯片统一 `--*-chip-tone`（边框 / 浅底 / 文字同源于该变量）；类别 token 统一 `--*-token-tone`。新增种类时扩展变量映射，禁止为每个芯片手写互不相关的颜色三件套。
- **对比与主题。** 明暗主题下身份色、类别色、芯片字都必须保持可读；浅洗透明度以不淹没正文为准。`prefers-reduced-motion` 下可去掉入场，但不得去掉语义色。
- **定位与交互。** 贴指针的预览使用 `placement: "cursor"`（或等价）并记录指针坐标；交互型浮层需能移入选取文本。滚动、拖拽、视图切换、锚点卸载时关闭浮层，迟到的异步内容不得写回旧锚点。
- **验收。** 交付前用真实多样本检查：多来源身份色可辨、分级芯片正确、类别 token 不串色、长提示词可滚动且分隔符不抢色、空状态不假造彩色结构。用户一眼觉得“一片灰、很乏味”时，视为本节未满足。

## 7. 编辑与清理

- 修改前读取目标文件和调用关系；局部修改使用 `apply_patch`。
- 发布前稳定期默认不重构。功能开发与 Bug 修复必须先尝试在既有模块边界内完成；只有局部修复会继续制造重复真源、竞态、错误依赖或无法建立可靠回归时，才可提出重构建议，并在用户同意后重构直接相关部分。
- 重构不得与无关功能、视觉调整或清理混在同一改动中；必须保持提交范围可审查、行为差异可列举、回滚边界清晰。用户当次允许重构只授权解决当前问题所必需的范围，不代表可以重写相邻稳定模块。
- 重构前后必须建立等价行为清单和针对性回归，至少保护节点注册名、输入输出协议、持久字段、旧工作流加载、复制/撤销、Subgraph、Classic / Nodes 2.0 与公开扩展 API；无法证明兼容时停止并说明风险，不以“代码更整洁”作为破坏兼容的理由。
- 不格式化、回滚或清理无关内容，不覆盖用户已有改动。
- 纯演示 HTML、交互原型、截图和一次性调试产物统一放在已被 `.gitignore` 与 `.comfyignore` 排除的 `tmp/` 下；不得放入 `artifacts/`、业务源码或长期文档。需要长期保留的设计规范另写入 `docs/design/`。
- 删除前确认没有静态引用、生命周期入口、注册副作用或序列化职责。
- 不保留死导出、空壳域、未来规划常量、被替代样式或中间态转换。
- 注释解释 WHY、约束和平台差异，不复述代码。
- 行尾已由 `.gitattributes` 统一为 LF 入库，检出转换交给 `core.autocrlf`；编辑产生的行尾差异不再视为需要规避的问题，不要为行尾保留兼容脚本或绕行方案。
- `.comfyignore` 排除协作、测试和本地产物，但保留运行时代码、locales、assets、双语 README 与 LICENSE。

## 8. 验证

- 验证按风险升级：静态检查 → 受影响单测 → 全量检查 → 必要的 Classic / Nodes 2.0 GUI 主路径；具体命令和回归矩阵只以 [`testing.md`](docs/development/testing.md) 为准。
- 新增节点或改变节点行为时，根图与嵌套 Subgraph 是同一完成门槛：至少覆盖新建、保存/加载、复制/粘贴、序列化、执行及本次涉及的连接/事件路径；涉及执行 ID、跨图引用或共享 Subgraph 定义时，还必须覆盖多层嵌套和同一 Subgraph 的多 wrapper 实例。只在根图可用的实现不得交付。
- 动态参数链回归至少覆盖：重命名、尾部增删、中间重排、复制/粘贴、保存/加载、撤销/重做、根图与嵌套子图、直属 Set/Get、受管 Get、Receiver 输入输出及既有下游连线；结果必须无需拖动节点或切换画布即可立即一致。
- 纯前端界面、样式、布局和局部交互修改，若不涉及 slot、widget 尺寸协议、序列化、执行链、复杂 DOM 生命周期、子图、双模式或性能回归，完成代码检查后交给用户刷新现有 ComfyUI 页面验收；默认不启动独立实例，也不代替用户做 GUI 操作。
- 用户要求用于查看、比较或评审的 HTML / 交互原型属于设计交付物，不属于测试资产；默认只做源码与语法检查，交给用户实际体验，不启动浏览器自动化或代替用户进行视觉和交互验收。
- 浏览器权限、系统通知、音频播放等真实用户手势只能标记为人工确认；无法验证时如实列出缺口和风险。


## 9. 发布

- `PublisherId=aaalice`，包名 `comfyui-aaalice-nodes`；`pyproject.toml` packages 覆盖全部已实现域。
- 发布前同步版本、双语 README、locale、`.comfyignore`、节点清单和内部路线图。
- 发布只按 [`release.md`](docs/development/release.md) 执行。
- 用命令行更新 `REGISTRY_ACCESS_TOKEN` 时，必须让 `gh secret set` 直接从 stdin 读取，例如 `printf '%s' "$TOKEN" | gh secret set REGISTRY_ACCESS_TOKEN --repo OWNER/REPO`；禁止写 `--body -`，该参数会把字面量 `-` 保存为 Secret，导致发布工作流报 `Invalid personal access token`。命令和日志不得回显真实密钥。
- GitHub Actions 上传成功且 Registry 已生成对应版本记录即可结束；`NodeVersionStatusPending` 属于待审核，不等待变为 `Active`。

## 10. 完成检查

- [ ] 只改任务范围；无无关格式化、回滚或死代码
- [ ] 若发生重构，已先说明必要性、范围、风险、不重构代价和验证计划并获得用户同意；已证明局部修复不足，核对调用方、持久状态、旧工作流、Subgraph、双画布模式和第三方集成，且没有扩大无关改动
- [ ] node id、输入输出 id 和协议值使用英文
- [ ] English / 简体中文文案同步
- [ ] 新增或变更的可见状态已同时完成美观性、可读性、空间利用和主题适配检查；状态区块已在最小宽高下验证无逐字竖排、无叠印、无被裁切操作
- [ ] 按钮组已检查操作层级、视觉重量、同组一致性、窄宽度和中英文文案；不存在无理由的高饱和实心按钮或语义错误图标
- [ ] 复杂设置页已检查首屏焦点、渐进披露、单一主导航、当前对象可见性和滚动层级；没有同时展开多套完整表单或依赖嵌套滚动理解界面
- [ ] 用户可见界面没有副标题；主标签可独立理解，必要说明使用正常字号正文、Tooltip 或按需帮助
- [ ] CSS 中不存在低于 `10px` 的用户可见字号；按钮、输入、导航、列表主标签和表单标签通常不低于 `11px`
- [ ] 标签列表全部保留类别并分色胶囊化；每个胶囊有独立命中与上下文操作，没有退化成纯文本或彩色边框叠彩色底
- [ ] 普通区域没有使用连续横线、竖线或密集 1px 边框做默认分区；层级由表面、空间、阴影、形态和局部语义色共同建立
- [ ] 信息浮层/悬浮预览已按身份、状态、类别、元数据芯片分层上色；无整块单调灰面，身份属性挂在实际上色根节点
- [ ] README、roadmap、架构和公开限制按职责更新
- [ ] Classic 与 Nodes 2.0 主路径已验证，或已明确交给用户刷新验收
- [ ] 可缩放节点已分别检查固定与取消固定，原生 widget 和 DOM widget 均未抢占四角命中，也没有自绘宿主手柄；非目标节点的 `getWidgetOnPos`、`resizable` 与拖拽行为保持不变
- [ ] 根图、嵌套 Subgraph 及适用时的共享 Subgraph 多实例路径已验证；没有依赖 `app.graph`、当前画布或裸 Node Id
- [ ] 真实 slot、序列化真源和内部 payload 边界未破坏
- [ ] 逐帧尺寸/绘制回调没有图遍历、状态规范化、DOM 查询、计算样式读取或对象重建；结构缓存有精确失效测试，高密度节点画布的平移/缩放路径已评估
- [ ] 文档位置正确，链接和 ADR 状态有效，`AGENTS.md` 少于 500 行
- [ ] 已完成风险匹配的代码检查，并明确说明未执行的 GUI 或人工验收
