# 架构

本文描述当前实现的模块边界、状态真源和运行时数据流。历史取舍见 `docs/adr/`，交互与视觉细节见 `docs/design/`。

## 已注册节点

| 节点 | Category | 执行职责 | 前端职责 |
|---|---|---|---|
| `ParameterPanel` | `Aaalice/control` | 根据本次 prompt payload 输出最多 32 个参数值 | 参数创作、控件、动态原生输出、结构编辑和 Seed 更新 |
| `ParameterReceiver` | `Aaalice/control` | 有界 AnyType 逐路透传 | 绑定面板、管理可见 Get、显式同步和动态输入输出 |
| `QuickGroupManager` | `Aaalice/control` | 无 Prompt I/O 和执行副作用 | 发现、过滤、排序并原子切换当前图的可视组 |
| `EnumSwitch` | `Aaalice/tools` | 按精确字符串 lazy 选通一个同类型分支 | 分支编辑、面板选项绑定、显式同步和动态分支输入 |
| `SimpleStringSplit` | `Aaalice/tools` | 拆分字符串、清理空白并移除空段 | 无业务前端 |
| `SimpleNotify` | `Aaalice/tools` | 透明透传并返回提醒 payload | 在发起执行的页面发送桌面通知和提示音 |
| `PromptCleaningMaid` | `Aaalice/prompt` | 原样透传，或按显式格式清理自然语言、规范化并去重标签列表 | 模式切换、详细设置和内部配置注入 |
| `PromptSelector` | `Aaalice/prompt` | 组合前缀与有序词条正文，校验缺失引用和权重 | 跨分类选择、筛选、排序、权重和实时词库 payload 注入 |

根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`。`nodes/__init__.py` 按稳定域顺序加载 `NODE_CLASSES`；域导入错误保留原始异常。当前 Python 域为 `nodes/control`、`nodes/tools`、`nodes/prompt` 与无 ComfyUI 运行时依赖的 `nodes/_lib`。

## 后端边界

- `nodes/control/parameter_panel.py` 声明最多 32 路输出，把前端注入的参数 payload 转换为有界值序列；解析和类型转换位于 `nodes/_lib/parameter_values.py`。
- `nodes/control/parameter_receiver.py` 声明最多 32 路可选 AnyType 输入输出；`nodes/_lib/receiver_values.py` 只按协议顺序透传，不保存绑定状态。
- `nodes/control/quick_group_manager.py` 只注册无输入输出的 V3 节点；组发现和模式变化不进入后端。
- `nodes/tools/enum_switch.py` 声明 selector、最多 32 个 lazy MatchType 分支和一个同类型输出；`nodes/_lib/enum_switch.py` 校验 routes payload 并选择精确协议输入。
- `SimpleStringSplit` 是独立纯后端工具，不依赖参数系统。
- `SimpleNotify` 使用成对 MatchType 输入输出和 ComfyUI 默认 list 映射。后端只返回透传值与提醒 payload，浏览器副作用不进入执行层。
- `PromptCleaningMaid` 使用单一 STRING 输入输出；`nodes/_lib/prompt_cleaning.py` 持有配置验证、自然语言清理、顶层标签扫描和稳定去重。结构异常的标签列表原样输出并记录 warning；识别到已支持的顶层分区控制词时无损旁路，不猜测或修复其语法。
- `PromptSelector` 接收可选前缀并输出单一 STRING；纯逻辑校验有序词条 payload、0–20 权重和分隔符。词库领域服务使用用户目录中的 SQLite，HTTP 路由只负责 JSON、图片、ZIP 与变更事件传输。

后端 32 路 Schema 是执行和校验上限，不是前端槽数组真源。ParameterPanel 的返回值仍填满有界输出协议；画布只物化当前参数对应的连续槽。

## 前端模块

| 模块组 | 文件 | 职责 |
|---|---|---|
| 包入口 | `js/extension.js`、`js/i18n.js` | 加载共享样式、业务扩展和双语资源 |
| 参数面板 | `js/parameter_panel.js`、`js/parameter_panel_kj.js` | 生命周期、控件、结构编辑、prompt 注入、Seed 行为和 KJ Set |
| 参数接收器 | `js/parameter_receiver.js` | Receiver Binding、Get 所有权、显式同步、菜单和状态显示 |
| 枚举选通 | `js/enum_switch.js` | 分支编辑、选项绑定、同步提示、保线和 routes payload 注入 |
| 组管理 | `js/quick_group_manager.js` | 全局图事件、DOM、颜色范围、排序和原子模式事务 |
| 提醒 | `js/simple_notify.js` | 执行结果消费、权限入口和右键测试 |
| 提示词清理 | `js/prompt_cleaning_maid.js` | 模式 Switcher、设置浮层、生命周期和 prompt 配置注入 |
| 提示词选择 | `js/prompt_selector.js`、`js/lib/{prompt_selector_model,library_store,library_index,virtual_list,image_preview}.js` | 虚拟条目列表、词库索引与事件、共享图片预览、选择状态与执行 payload |
| DIY 左侧工作区 | `js/workspace.js`、`js/lib/{dashboard_model,control_providers,workspace_components}.js` | 手工页面布局、参数投影、子图公开参数、词库管理和预设 |
| 纯模型 | `js/lib/{param_model,receiver_model,enum_switch_model,quick_group_manager_model}.js` | 状态规范化、校验、差异和可单测规划 |
| 动态槽与布局 | `js/lib/{dynamic_slots,parameter_layout,receiver_layout,enum_switch_layout,kj_set_layout}.js` | 原生槽数量、双模式位置、最小尺寸和 KJ Set 排列 |
| DOM 与媒体辅助 | `js/lib/{dom_widget_resize,node_accent,parameter_controls,image_reference,safe_markdown,simple_notify_runtime}.js`、`js/vendor/` | 缩放命中、节点强调色同步、无状态控件、图像引用、安全 CommonMark/GFM、固定版本前端依赖和提醒运行时 |
| 共享 UI | `js/lib/ui.js`、`js/lib/ui.css`、`js/lib/theme.css` | 无业务按钮、Switcher、Toggle、Popover、主题 token 与节点专用布局 |

共享 `js/lib` 模块不得自行注册扩展或拥有工作流状态。业务入口负责生命周期和画布事务，纯模型保持无 DOM、无 ComfyUI 运行时依赖。

## 状态真源

| 功能 | 持久真源 | 实时派生数据 | 不得成为真源 |
|---|---|---|---|
| ParameterPanel | `node.properties.parameters` | 参数 meta、slot 布局、prompt payload | 服务端进程全局状态、DOM 控件值副本 |
| ParameterReceiver | `node.properties.receiverBinding` | 面板名称、参数类型、同步状态、Get 连线 | 面板标题、槽索引、Get 显示名 |
| EnumSwitch | `node.properties.enumSwitch` | 分支标签、源选项 diff、routes payload | Branch Key、槽位置、DOM 顺序 |
| QuickGroupManager | `node.properties.quickGroupManagerState` | 组名、颜色、成员和实际模式 | 缓存的组快照、其它 Manager 状态 |
| PromptCleaningMaid | `node.properties.promptCleaningMaidState` | 当前模式控件、设置状态、执行配置 JSON | DOM 控件副本、自动识别的 Prompt 类型 |
| PromptSelector | `node.properties.promptSelectorState` | 当前词条正文、缺失引用、执行 payload | 节点内正文快照、DOM 复选状态 |
| DIY 侧边栏布局 | `app.graph.extra.aaaliceSidebar` | 参数值、目标解析和 Missing Binding 状态 | 侧边栏 DOM、节点标题或位置 |
| Prompt Library | 用户目录 SQLite | 当前筛选、PromptSelector 引用解析 | 单个工作流、单个节点或浏览器缓存 |

Parameter 与 Route 分别使用稳定 id。显示名称、Branch Key 和排序位置不是身份；结构变化按稳定身份保存并恢复连线。

## 生命周期与数据流

交互节点覆盖 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描，并幂等挂载。DOM widget 同步创建；异步 i18n 就绪后只更新文案和重绘。

### ParameterPanel

1. 结构编辑器统一校验草稿并确认受影响连线。
2. 一个图变更边界内更新 `node.properties.parameters`；尾部增删保留稳定输出，中间变更按 Parameter Id 重塑并重连真实端点。
3. `graphToPrompt` 为本次执行注入参数 payload。
4. 执行成功后按 fixed、increment、decrement 或 randomize 更新 Seed，并通知依赖节点刷新。

### ParameterReceiver

1. 首次绑定或用户显式同步时读取源面板参数身份。
2. 创建或复用 KJ Set 与可见折叠 Get，按 Parameter Id 保存现有上下游连线。
3. 在一个图变更边界内增量调整真实输入输出和 Get 排列；稳定前缀保持原 link，中间变更再按 Parameter Id 恢复端点。
4. 名称与类型变化只刷新显示；新增、删除和重排在显式同步前只显示“需要同步”。

### EnumSwitch

1. 独立编辑或显式源选项同步更新 routes。
2. 尾部增删保留稳定前缀的原生槽；中间变更按 Route Id 保存真实端点，调整 `branch_1…branch_N` 后恢复未删除路由。
3. `graphToPrompt` 注入 Route Id、Branch Key 与协议输入的映射。
4. 后端只请求 selector 精确匹配的 lazy 分支；未知或未连接目标显式失败。

### QuickGroupManager

1. 全局 `graphChanged` 监听在动画帧内合并刷新，实例只读取当前图的组快照。
2. 用户开关先在纯模型中规划同 Manager 级联和节点模式变化。
3. 环路、缺失目标、路径冲突或重叠组冲突会在写入前中止。
4. 通过预检后，在一个图变更边界内提交全部模式；其它 Manager 只刷新显示。

### 节点强调色

1. `js/lib/node_accent.js` 从节点当前 `color` / `bgcolor` 解析 Node Color，并把派生 token 写入业务 DOM 根。
2. ParameterPanel 与 QuickGroupManager 在创建、加载、配置和业务重绘时同步初始颜色；ComfyUI 官方 `setColorOption()` 改色入口负责即时更新。
3. 共享层只提供 Node Color、Node Accent、柔色和对比色，不持有工作流状态，也不轮询节点。
4. 业务 CSS 决定哪些普通激活态消费 Node Accent；警告、危险、筛选颜色和多档业务状态继续使用 ComfyUI 语义 token。

### PromptCleaningMaid

1. 用户显式选择关闭、自然语言或标签列表模式；关闭模式原样透传，两种清理模式分别保存设置。
2. Switcher、设置 Toggle 与恢复默认都在图变更边界中即时写入 `node.properties`。
3. `graphToPrompt` 注入规范化 `config_json`，使配置参与后端执行与缓存。
4. 关闭模式不修改文本；自然语言模式只清理空白；标签模式只按顶层分隔符规范化和稳定去重。已支持的顶层分区控制词触发整段原样旁路，其余 Prompt 方言不解释。

### PromptSelector 与词库

1. Library Store 通过 HTTP 快照和服务端变更事件维护当前词库，不轮询。
2. 节点只保存有序词条 ID、权重与分隔符；词库编辑不会复制状态到节点。
3. `graphToPrompt` 按 ID 注入当前正文，使正文变化进入执行缓存键；缺失正文由后端校验明确阻止执行。
4. ZIP 只上传一次到有时效的磁盘暂存区，完成结构、路径、大小、图片和哈希预检后返回 token，再以 SQLite 事务应用冲突策略；导出先生成有时效文件并由浏览器原生流式下载。
5. Library View 与 PromptSelector 共享快照派生索引、定高虚拟列表和单例图片浮层，条目数量增长不会线性增加常驻 DOM、重复检索或预览监听器容器。

### DIY 左侧工作区

1. 官方 Sidebar Tab 挂载参数控制与词库工作区；页面布局随工作流序列化，参数值仍由节点拥有。
2. Control Provider Registry 分别解析通用 widget、Aaalice 稳定参数和子图整体公开 widget；绑定只按稳定 Host ID 与 Control ID 精确解析。
3. 节点右键添加参数始终可用；编辑模式只开放页面、分区和卡片布局操作。
4. 图变化在动画帧内合并刷新。失效或类型不兼容的绑定原样保留，预设导入跳过不兼容值并等待人工重绑。

## Classic、Nodes 2.0 与尺寸

- Canvas/native 层负责真实 slot、连线和静态布局；DOM overlay 负责交互、焦点、键盘、tooltip 与 aria。
- ParameterPanel、ParameterReceiver 与 EnumSwitch 的画布槽数组只包含当前业务项，槽 id 使用后端有界 Schema 的连续前缀。
- Nodes 2.0 concrete slot 对象在原生槽变化后同步名称、类型、颜色和位置；不得恢复隐藏槽数组。
- DOM widget 通过 `getMinHeight()` 声明内容下限。Classic 内容增长可以走 LiteGraph grow-only 路径；Nodes 2.0 尺寸由 DOM 测量持有。
- 全尺寸 DOM widget 必须让出 LiteGraph 原生缩放角；`computeSize()` 不得把当前节点尺寸当成最小值。
- QuickGroupManager 没有协议槽，最小高度由当前可见组数量决定且列表不使用内部滚动；`graphChanged` 不得替换为状态轮询。
- 节点 DOM 根不覆盖原生背景、外边框或圆角；Classic 使用 LiteGraph `bgcolor`，Nodes 2.0 保留原生容器轮廓。

## 可选依赖与公开边界

- KJNodes 只对 ParameterReceiver 的绑定、同步和 ParameterPanel 的 Set/Get 辅助功能可选依赖；缺失时明确报错，不模拟成功。
- Classic 与 Nodes 2.0 为支持范围；App Mode 暂不支持。
- ParameterReceiver 和 QuickGroupManager 只作用于当前图，不递归搜索或修改 Subgraph 内部图。
- DIY 侧边栏只投影 Subgraph 整体公开的兼容 widget，不遍历或绑定内部节点。
- SimpleNotify 只在发起执行的前端产生提醒，不表示并行分支、整个工作流或队列完成。
