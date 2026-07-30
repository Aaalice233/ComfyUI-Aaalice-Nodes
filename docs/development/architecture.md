# 架构

本文描述当前实现的模块边界、状态真源和运行时数据流。历史取舍见 `docs/adr/`，交互与视觉细节见 `docs/design/`。

## 已注册节点

| 节点 | Category | 执行职责 | 前端职责 |
|---|---|---|---|
| `ParameterPanel` | `Aaalice/control` | 根据本次 prompt payload 输出最多 32 个参数值 | 参数创作、控件、动态原生输出、结构编辑和 Seed 更新 |
| `ParameterReceiver` | `Aaalice/control` | 有界 AnyType 逐路透传 | 绑定面板、管理可见 Get、显式同步和动态输入输出 |
| `QuickGroupManager` | `Aaalice/control` | 无 Prompt I/O 和执行副作用 | 发现、过滤、排序并原子切换当前图的可视组 |
| `EnumSwitch` | `Aaalice/tools` | 按精确字符串 lazy 选通一个同类型分支 | 分支编辑、面板选项绑定、显式同步和动态分支输入 |
| `ResolutionPreset` | `Aaalice/tools` | 校验执行载荷并输出精确 width / height | 预设、精确输入、画幅拖拽、对齐和个人预设管理 |
| `SimpleStringSplit` | `Aaalice/tools` | 拆分字符串、清理空白并移除空段 | 无业务前端 |
| `SimpleNotify` | `Aaalice/tools` | 透明透传并返回提醒 payload | 在发起执行的页面发送桌面通知和提示音 |
| `PromptSelector` | `Aaalice/prompt` | 组合前缀与有序词条正文，校验缺失引用和权重 | 跨分类选择、筛选、排序、权重和实时词库 payload 注入 |
| `CharacterFeatureSwapNode` | `Aaalice/prompt` | 通过 DeepSeek 官方 API 迁移指定的单角色特征 | 复用 Tag List 编辑特征，并注入节点状态和配置版本 |
| `BooruGalleryNode` | `Aaalice/gallery` | 下载有序选择快照，原子解码并输出一一对应的 IMAGE/STRING list | 多站点搜索、虚拟瀑布流、选择排序、本地标签编辑、详情、收藏与设置 |
| `FetchFromKrita` | `Aaalice/krita` | 每次执行请求当前活动文档快照并输出 IMAGE/MASK | Bridge 连接、活动文档与最近获取状态，以及共享 Krita 设置入口 |

根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`。`nodes/__init__.py` 按稳定域顺序加载 `NODE_CLASSES`；域导入错误保留原始异常。当前 Python 域为 `nodes/control`、`nodes/tools`、`nodes/prompt`、`nodes/gallery`、`nodes/krita` 与无 ComfyUI 运行时依赖的 `nodes/_lib`。

## 后端边界

- V3 `validate_inputs()` 运行在上游节点执行之前，只允许声明并校验当前 prompt 中已经存在的字面量或前端注入 payload。连接输入的真实值只在 `execute()` 可用，因此所有非空、内容结构和业务语义检查都在执行阶段完成。当前 `CharacterFeatureSwapNode`、`PromptSelector` 与 `EnumSwitch` 的自定义校验签名分别只暴露自己的注入 payload，不使用 `**kwargs` 接收无关连接输入。
- `nodes/control/parameter_panel.py` 声明最多 32 路输出，把前端注入的参数 payload 转换为有界值序列；解析和类型转换位于 `nodes/_lib/parameter_values.py`。图像参数通过 `nodes/_lib/parameter_images.py` 解析 ComfyUI 引用：未选择或文件不存在时输出单张 `512 × 512` 纯黑 IMAGE，已选择但解码、权限或其它读取错误仍明确失败；文件从缺失变为存在时会改变执行指纹，避免继续命中旧的黑图缓存。
- `nodes/control/parameter_receiver.py` 声明最多 32 路可选 AnyType 输入输出；`nodes/_lib/receiver_values.py` 只按协议顺序透传，不保存绑定状态。
- `nodes/control/quick_group_manager.py` 只注册无输入输出的 V3 节点；组发现和模式变化不进入后端。
- `nodes/tools/enum_switch.py` 声明 selector、最多 32 个 lazy MatchType 分支和一个同类型输出；`nodes/_lib/enum_switch.py` 校验 routes payload 并选择精确协议输入。
- `nodes/tools/resolution_preset.py` 没有可见输入，只接受前端注入的版本化 `resolution_json`，校验 ComfyUI 尺寸范围与基础 8 px 对齐后输出两个具名 INT。个人预设 Store 位于当前用户目录，使用线程锁、临时文件和原子替换；专用 HTTP 路由只负责 CRUD 和明确错误映射。
- `SimpleStringSplit` 是独立纯后端工具，不依赖参数系统。
- `SimpleNotify` 使用成对 MatchType 输入输出和 ComfyUI 默认 list 映射。后端只返回透传值与提醒 payload，浏览器副作用不进入执行层。
- `PromptSelector` 接收可选前缀并输出单一 STRING；纯逻辑校验有序词条 payload、0–20 权重和分隔符。词库领域服务使用用户目录中的 SQLite，HTTP 路由只负责 JSON、图片、ZIP 与变更事件传输。
- `CharacterFeatureSwapNode` 接收原提示词与参考角色提示词，读取前端注入的启用特征和配置版本，并使用当前用户目录中的 DeepSeek 配置异步生成单一 STRING。纯逻辑负责 payload、模板和响应校验；配置、模型查询和真实 Chat Completion 连接测试路由不把 API Key 返回前端或写入工作流。
- `BooruGalleryNode` 没有可见输入，执行版本化选择 payload，并并发下载最多三张原图；`asyncio.gather` 保持快照顺序，任一下载或解码失败则整体失败。站点适配器统一 Summary、Detail、Page 与 capability，路由只处理 JSON、流式媒体和错误映射；媒体代理逐次复核 HTTPS 白名单、Content-Type 和大小。
- `FetchFromKrita` 没有公开输入且标记为非幂等。执行层写入唯一请求、最多等待 15 秒并响应 ComfyUI 取消；`nodes/_lib/krita_snapshot.py` 校验协议、请求身份、受限路径、PNG、尺寸和选区语义，再规范化为 IMAGE/MASK。Bridge 状态、安装、启用、修复和测试路由与快照执行分离，启动时只检查；用户显式安装或修复时原子更新 Krita 插件开关，覆盖文件或配置前要求 Krita 已关闭。
- Discord 分享不新增执行节点。`nodes/tools/discord_share_routes.py` 只向前端公开中继和社区 URL，Webhook、OAuth Secret 与成员会话不进入 ComfyUI Python 进程；可信中继实现位于 `deploy/discord-share-worker/`，负责 OAuth、逐次成员/角色校验、限流和 Webhook 转发。

后端 32 路 Schema 是执行和校验上限，不是前端槽数组真源。ParameterPanel 的返回值仍填满有界输出协议；画布只物化当前参数对应的连续槽。

## 前端模块

| 模块组 | 文件 | 职责 |
|---|---|---|
| 包入口 | `js/extension.js`、`js/i18n.js` | 加载共享样式、业务扩展和双语资源 |
| 参数面板 | `js/parameter_panel.js`、`js/parameter_panel_kj.js` | 生命周期、控件、结构编辑、prompt 注入、Seed 行为和 KJ Set |
| 参数接收器 | `js/parameter_receiver.js` | Receiver Binding、Get 所有权、显式同步、菜单和状态显示 |
| 枚举选通 | `js/enum_switch.js` | 分支编辑、选项绑定、同步提示、保线和 routes payload 注入 |
| 分辨率预设 | `js/resolution_preset.js`、`js/lib/resolution_preset_model.js` | 状态规范化、预设匹配、二维映射、DOM 交互、个人预设请求和 width / height payload 注入 |
| 组管理与导航 | `js/quick_group_manager.js`、`js/lib/{group_navigation,group_navigation_model}.js` | 全局图事件、DOM、颜色范围、排序、原子模式事务、共享组边界导航，以及手工导航清单与组合键模型 |
| 提醒 | `js/simple_notify.js` | 执行结果消费、权限入口和右键测试 |
| 提示词选择 | `js/prompt_selector.js`、`js/lib/{prompt_selector_model,library_store,library_index,virtual_list,image_preview,prompt_entry_details,category_color,collection}.js` | 虚拟条目列表、词库索引与事件、共享图片及词条信息预览、分类颜色与收藏夹适配、选择状态与执行 payload |
| 角色特征交换 | `js/character_feature_swap.js`、`js/lib/character_feature_swap_model.js` | 共享 Tag List 特征编辑、ComfyUI LLM 设置入口、生命周期和执行 payload 注入 |
| 多站点画廊 | `js/booru_gallery.js`、`js/lib/{booru_gallery_model,virtual_masonry}.js` | 双行上下文工具栏、自然比例虚拟瀑布流、选择与详情、定高已选列表、设置入口和选择快照注入 |
| Krita 快照 | `js/fetch_from_krita.js` | 紧凑连接状态、活动文档、最近执行摘要、显式刷新与共享 Bridge 设置 |
| Discord 分享 | `js/discord_share.js`、`js/lib/{discord_share_capture,discord_share_client,discord_share_model}.js` | 工作区侧栏底栏/顶栏入口、社区链接、Preview Any 绑定、最新成功执行快照、成员验证和相册发送 |
| DIY 左侧工作区 | `js/workspace.js`、`js/lib/{dashboard_model,dashboard_presets,dashboard_preset_runtime,dashboard_sizing,dashboard_layout,dashboard_commands,dashboard_components,dashboard_interactions,control_providers,parameter_sections,native_output_controls,control_host_events,node_control_menu,workspace_controls,widget_control_adapters}.js` | Dashboard V2 页面、二维网格占位、稳定控件尺寸提示、可选布局组、参数投影、ComfyUI 内置只读执行预览、全图组导航、完整侧边栏预设、词库管理和便携备份；预设纯模型与运行时应用协调器分离，模型、尺寸、布局、命令、交互、DOM、Provider、菜单装饰、事件失效与第三方 widget 适配保持单向职责 |
| 参数控件 | `js/lib/controls/{contract,registry,specs,availability,aaalice,comfy,numeric,boolean,choice,text,taglist,image,image_compare,image_output,text_output}.js`、`js/lib/control_tones.js`、`js/api.js` | 统一 Control Spec / Port / View 契约、暂不可用状态、Aaalice 与 ComfyUI 两套渲染策略、只读图像/文本/图像对比视图、稳定展示色分配、无状态控件实现和第三方公开注册入口 |
| 纯模型 | `js/lib/{param_model,receiver_model,enum_switch_model,quick_group_manager_model,group_navigation_model,native_output_model}.js` | 状态规范化、校验、差异和可单测规划 |
| 动态槽与布局 | `js/lib/{dynamic_slots,parameter_layout,receiver_layout,enum_switch_layout,kj_set_layout}.js` | 原生槽数量、双模式位置、最小尺寸和 KJ Set 排列 |
| DOM 与媒体辅助 | `js/lib/{dom_widget_resize,node_accent,image_reference,image_upload,safe_markdown,simple_notify_runtime}.js`、`js/vendor/` | 缩放命中、节点强调色同步、图像引用与共享上传/拖放、安全 CommonMark/GFM、固定版本前端依赖和提醒运行时 |
| 共享 UI | `js/lib/ui.js`、`js/lib/ui.css`、`js/lib/theme.css` | 无业务按钮、Switcher、Toggle、Popover、主题 token 与节点专用布局 |

共享 `js/lib` 模块不得自行注册扩展或拥有工作流状态。业务入口负责生命周期和画布事务，纯模型保持无 DOM、无 ComfyUI 运行时依赖。

## 状态真源

| 功能 | 持久真源 | 实时派生数据 | 不得成为真源 |
|---|---|---|---|
| ParameterPanel | `node.properties.parameters` | 参数 meta、slot 布局、prompt payload | 服务端进程全局状态、DOM 控件值副本 |
| ParameterReceiver | `node.properties.receiverBinding` | 面板图身份、面板名称、参数类型、同步状态、Get 连线 | 面板标题、槽索引、Get 显示名 |
| EnumSwitch | `node.properties.enumSwitch` | 分支标签、源选项 diff、routes payload | Branch Key、槽位置、DOM 顺序 |
| ResolutionPreset | `node.properties.resolutionPresetState` | 预设匹配、坐标映射、比例与 MP 摘要、执行 payload | DOM 字段、`presetId`、个人预设缓存 |
| ResolutionPreset 个人预设 | 当前 ComfyUI 用户目录 JSON | 当前用户的名称、尺寸、alignment 和稳定 UUID | 工作流 JSON、节点属性或浏览器存储 |
| QuickGroupManager | `node.properties.quickGroupManagerState` | 组名、颜色、成员和实际模式 | 缓存的组快照、其它 Manager 状态 |
| PromptSelector | `node.properties.promptSelectorState` | 当前词条正文、缺失引用、执行 payload | 节点内正文快照、DOM 复选状态 |
| CharacterFeatureSwapNode | `node.properties.characterFeatureSwap` | 启用特征、配置版本和执行 payload | DOM 标签副本、全局活动预设、API Key 或模型配置 |
| BooruGalleryNode | `node.properties.booruGalleryState`（查询上下文、逻辑页码、选择模式与选择快照） | 搜索 Summary、详情、当前请求和执行 payload | 搜索结果、cursor、滚动像素、Hover、Dialog、凭据、缓存或图片 DOM |
| Booru Gallery 用户设置 | 当前 ComfyUI 用户目录配置文件 | 凭据、默认来源、黑名单、Prompt 默认值、超时与缓存预算 | 工作流 JSON、节点属性或搜索结果 |
| Character Feature Swap LLM | 当前 ComfyUI 用户目录配置文件 | DeepSeek API Key、模型、超时、思考强度、模板和配置版本 | 工作流 JSON、节点属性或前端缓存 |
| Krita Bridge | Krita 插件目录与本机专用临时目录 | 连接心跳、请求关联的 JSON/PNG 和最近执行摘要 | `node.properties`、工作流 JSON、浏览器存储或旧快照复用 |
| Discord 分享入口 | ComfyUI 应用设置 `Aaalice.DiscordShare.Placement` | 侧栏/顶栏 DOM 和验证状态点 | 多个布尔开关、工作流 JSON 或入口 DOM |
| Discord 提示词来源 | `app.graph.extra.aaaliceDiscordShare.promptSource` | Preview Any 的限定执行 Id 与本次输出文本 | 提示词正文副本、节点标题或裸 Node Id |
| Discord 最新运行 | 页面内存中的最后一次成功执行快照 | `/history/{prompt_id}` outputs、图片尺寸和当前选择 | 工作流 JSON、节点属性、浏览器持久缓存 |
| Discord 成员会话 | 浏览器当前 Origin 的可撤销会话 | 中继逐次成员/角色校验 | Webhook、OAuth Secret 或工作流 |
| DIY 侧边栏布局 | `app.graph.extra.aaaliceSidebar` | 参数值、目标解析和 Missing Binding 状态 | 侧边栏 DOM、节点标题或位置 |
| DIY 侧边栏预设 | `app.graph.extra.aaaliceSidebarPresets` | 当前完整 Dashboard 快照、参数值与基准预设身份 | 滚动、选区、编辑模式、图钉、搜索、词库与工作流节点结构 |
| Prompt Library | 用户目录 SQLite | 当前筛选、PromptSelector 引用解析 | 单个工作流、单个节点或浏览器缓存 |

Parameter 与 Route 分别使用稳定 id。显示名称、Branch Key 和排序位置不是身份；结构变化按稳定身份保存并恢复连线。

## 生命周期与数据流

交互节点覆盖 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描，并幂等挂载。DOM widget 同步创建；异步 i18n 就绪后只更新文案和重绘。

现有节点扫描必须覆盖根图和全部嵌套 Subgraph 定义。`graphToPrompt` 注入不得用裸 `node.id` 查找执行节点，必须按每条 Subgraph wrapper 路径生成 ComfyUI 的限定执行 ID，并覆盖共享 Subgraph 定义的每个实例；前端执行事件也必须用同一限定 ID 反向定位节点。

挂载和状态恢复是两个独立职责：`nodeCreated` 或 setup 可以先用默认状态建立 DOM，但 `onConfigure` 只能作为早期同步，不能假定此时工作流恢复已经结束。`loadedGraphNode` 必须即使在组件已挂载时也重新读取 `node.properties`，同步所有受持久状态控制的 DOM，并重新计算或请求派生内容。初始化期间已经发出的异步请求必须用 `AbortController` 或 generation 机制失效；否则默认请求可能晚于恢复请求返回，让界面看似回到默认值，而手动刷新后才恢复正确状态。

### FetchFromKrita

1. 前端生命周期只幂等挂载界面并读取 Bridge 状态；刷新不会提前抓取执行图像，任何状态都不写入工作流。
2. 每次执行生成唯一 `request_id`，原子写入 `fetch_snapshot` 请求并等待同身份响应；超时和取消终止本次等待。
3. Krita Bridge 从当前活动文档导出可见合成图和可选选区，恢复批处理状态，再原子发布响应。
4. ComfyUI 校验全部响应和媒体后生成 Tensor；无选区生成同尺寸全黑 MASK，存在的全黑选区仍按“有选区”处理。
5. 完成或失败后只清理当前请求文件；前端执行摘要仅用于反馈，下次执行不会复用。

### Discord 分享

1. Aaalice 工作区底栏提供 GitHub、Discord 社区链接和分享入口，固定按钮位于底栏右侧；用户也可将分享入口迁移到画布顶栏。入口位置只使用一个应用级三态设置，宿主重挂时由单一 MutationObserver 幂等恢复，不轮询 DOM。
2. Preview Any 右键菜单把 Graph Id、Node Id 和显示标签写入根图 `extra`。执行成功后按 `prompt_id` 读取历史 outputs，限定执行 Id 反查节点并生成页面会话快照；历史读取失败才使用本次 `executed` 事件缓存。
3. 首次点击且没有有效会话时直接在独立 OAuth 窗口完成 Discord 登录和目标 Guild 成员检测，不以是否已有运行图像为前置条件；中继签名状态绑定原 ComfyUI Origin、一次性 Nonce 和 challenge，回调结果通过精确 Origin 的 `postMessage` 与短时 verifier handoff 交回随机会话 Token。
4. 相册只展示最后一次成功执行的去重图像；尺寸由浏览器按需解码，当前缩略图和 Dialog 状态不持久化。提示词缺失时禁用发送并要求重新绑定、执行。
5. 发送前中继重新查询 Guild 成员和可选角色，执行用户级限流、图片类型/大小与提示词校验，再把图像和三反引号代码块发送到固定 Webhook；任何步骤失败都保持明确错误。

### ParameterPanel

1. 结构编辑器统一校验草稿并确认受影响连线。
2. 一个图变更边界内更新 `node.properties.parameters`；尾部增删保留稳定输出，中间变更按 Parameter Id 重塑并重连真实端点。
3. `graphToPrompt` 为本次执行注入参数 payload；节点面与侧边栏共用的图像值在执行时解析，空引用或已不存在的文件生成单张 `512 × 512` 纯黑 IMAGE。
4. 执行成功后按 fixed、increment、decrement 或 randomize 更新 Seed，并通知依赖节点刷新。

### ParameterReceiver

1. 首次绑定或用户显式同步时，从接收器当前图及父级图读取源面板参数身份；绑定同时保存稳定 Graph Id 与 Panel Node Id。
2. 创建或复用 KJ Set 与可见折叠 Get，按 Parameter Id 保存现有上下游连线；已有 Set/Get 位于下级子图时沿真实 Subgraph 输入输出槽追踪并在同一作用域补齐。
3. 在一个图变更边界内增量调整真实输入输出和 Get 排列；稳定前缀保持原 link，中间变更再按 Parameter Id 恢复端点。
4. 名称与类型变化只刷新显示；新增、删除和重排在显式同步前只显示“需要同步”。

### EnumSwitch

1. 独立编辑或显式源选项同步更新 routes。
2. 尾部增删保留稳定前缀的原生槽；中间变更按 Route Id 保存真实端点，调整 `branch_1…branch_N` 后恢复未删除路由。
3. `graphToPrompt` 注入 Route Id、Branch Key 与协议输入的映射。
4. 后端只请求 selector 精确匹配的 lazy 分支；未知或未连接目标显式失败。

### ResolutionPreset

1. `node.properties.resolutionPresetState` 保存版本、精确宽高、alignment、画布范围与可失效的显示提示 `presetId`；每次恢复都重新规范化和匹配。
2. 指针与连续键盘操作各自只建立一个图历史边界；拖拽中只预览，取消时恢复快照，完成后才按需要升高画布范围。
3. 个人预设异步请求使用 AbortController 与 generation 淘汰迟到结果。服务错误只禁用个人预设操作，不影响本地尺寸编辑和执行。
4. `graphToPrompt` 只注入版本化 width / height；后端再次校验并直接返回两个 INT，使尺寸变化进入 ComfyUI 执行缓存键。

### QuickGroupManager

1. 全局 `graphChanged` 监听在动画帧内合并刷新，实例只读取当前图的组快照。
2. 用户开关先在纯模型中规划同 Manager 级联和节点模式变化。
3. 环路、缺失目标、路径冲突或重叠组冲突会在写入前中止。
4. 通过预检后，在一个图变更边界内提交全部模式；其它 Manager 只刷新显示。
5. 节点行与侧边栏组导航共用组边界适配器；优先平滑适配完整边界，旧画布 API 回退到保持当前缩放的中心定位，均不修改图状态。

### 节点强调色

1. `js/lib/node_accent.js` 从节点当前 `color` / `bgcolor` 解析 Node Color，并把派生 token 写入业务 DOM 根。
2. ParameterPanel 与 QuickGroupManager 在创建、加载、配置和业务重绘时同步初始颜色；ComfyUI 官方 `setColorOption()` 改色入口负责即时更新。
3. 共享层只提供 Node Color、Node Accent、柔色和对比色，不持有工作流状态，也不轮询节点。
4. 业务 CSS 决定哪些普通激活态消费 Node Accent；警告、危险、筛选颜色和多档业务状态继续使用 ComfyUI 语义 token。

### PromptSelector 与词库

1. Library Store 通过 HTTP 快照和服务端变更事件维护当前词库，不轮询。
2. 节点只保存有序词条 ID、权重与分隔符；词库编辑不会复制状态到节点。
3. `graphToPrompt` 按 ID 注入当前正文，使正文变化进入执行缓存键；缺失正文由后端校验明确阻止执行。
4. ZIP 只上传一次到有时效的磁盘暂存区，完成结构、路径、大小、图片和哈希预检后返回 token，再以 SQLite 事务应用冲突策略；导出先生成有时效文件并由浏览器原生流式下载。
5. Library View 与 PromptSelector 共享快照派生索引、定高虚拟列表和单例图片浮层，条目数量增长不会线性增加常驻 DOM、重复检索或预览监听器容器。
6. Category 识别色由 SQLite 持久化；新分类优先分配未使用的稳定色板项，旧库与旧版导入自动补色。前端共享适配器只消费颜色，不另建配色真源。
7. Collection 保持备份与 API 的稳定协议名，产品界面统一称为“收藏夹”；后端保证稳定身份的默认收藏夹存在并拒绝删除，节点收藏按钮只从词库快照派生状态和提交关系变更。
8. 多选移动、收藏关系更新和删除都进入词库领域事务；批量删除先校验全部稳定词条 ID，再统一删除关系并按最后引用清理预览资源，不允许前端逐条请求形成部分成功。
9. PromptSelector 排队后按实际 payload 批量写入词条最近使用时间；列表默认以该用户级元数据降序显示，同批与未使用词条继续保持词库顺序。最近使用时间不进入工作流状态或词库导出。

### CharacterFeatureSwapNode

1. 节点以 `node.properties.characterFeatureSwap` 保存版本化特征列表；共享 Tag List 负责启用、停用、增删和排序，修改进入正常图历史边界。
2. `graphToPrompt` 只注入特征 payload 和当前配置版本，使节点状态及 LLM 设置变化参与执行缓存；API Key、Base URL、模型和模板不进入工作流。
3. 后端用固定占位符替换构建兼容自然语言与 Tag 列表的请求，通过 DeepSeek 官方 `/chat/completions` 执行，并对空输入、无启用特征、配置、HTTP、超时和响应结构错误显式失败。
4. ComfyUI 设置页通过专用路由维护用户目录配置、查询模型和测试连接；读取设置只公开 API Key 是否存在，空 Key 更新保留原值，清除必须显式请求。
5. 每次请求都显式发送 DeepSeek `thinking` 开关；默认关闭思考，启用时只发送官方实际区分的 `high` 或 `max` `reasoning_effort`。服务地址固定为 DeepSeek 官方端点，不保存或接受自定义 Base URL。

### BooruGalleryNode

1. `node.properties.booruGalleryState` 只保存来源、查询筛选、Prompt 处理和有序 Detail 快照；浏览结果、详情请求与 DOM 都是会话派生状态。用户目录中的全局内容黑名单由 Service 注入适配器并进入页面缓存键：传统 Booru 同时发送远端排除查询并对轻量响应复核，AI TAG 使用列表响应自带的标签本地过滤；任何来源都不得为了黑名单逐帖 hydrate Detail。
2. 搜索只获取 Summary。Hover、详情或选择才按需补全 Detail 和分类标签；页面、详情、标签分类和原图分别进入有界缓存。
3. 独立虚拟瀑布流按最短列增量放置，ResizeObserver 只观察容器；滚动由单一 rAF 计算可见区并差量挂载卡片，离开 overscan 的图片移除 `src`。
4. 用户编辑只改本地分类标签。`graphToPrompt` 为每次排队复制当前有序选择和最终 Prompt，后续节点编辑不回写已经排队的任务。
5. capability 控制 Rating、排行榜、直接跳页、认证和收藏按钮。排行榜走适配器独立入口；逻辑页码统一从 1 开始，远端 `page` / `pid` 转换不进入前端。Gelbooru 的搜索、详情和标签分类必须使用官方 User ID / API Key，Rating 只暴露站点实际支持的 Safe、Questionable、Explicit；它不写收藏。Safebooru 与 AI TAG 不显示账户收藏；AI TAG 直接使用公开搜索、月榜与作品详情 API，并从公开图片元数据生成 Prompt，不把它伪装成传统 Booru Rating/标签分类。AI TAG 列表只提供推导缩略图时保留资源目录大小写；若首图并非 `_p0`，卡片仅在图片失败时按需请求详情恢复真实首图，不把逐帖详情请求恢复到搜索主路径。所有来源都不使用 Cookie、HTML 会话或验证码兼容层。

### DIY 左侧工作区

1. 官方 Sidebar Tab 挂载参数控制与词库工作区；页面布局随工作流序列化，参数值仍由节点拥有。
2. Control Provider Registry 分别解析简单 ComfyUI 原生 widget、内置只读执行预览、Aaalice 稳定参数和子图整体公开 widget；绑定只按稳定 Host ID、Control ID 与可选 Adapter ID 精确解析。原生 fallback 仅接受由 `INT`、`FLOAT`、`BOOLEAN`、`STRING`、`COMBO` 及其 LiteGraph 运行时别名组成的简单节点，并统一映射为 `numeric`、`boolean`、`text`、`choice`；`PreviewImage` 与 `PreviewAny` 由独立 `comfy-output` Provider 显式读取官方执行消息、恢复后的 `node.images` / `preview_text` 与显示模式，不把临时媒体或文本写入 Dashboard 或预设。出现未知自定义面板时不做部分猜测。结构支持、运行可用性和绑定健康度是三个独立维度：空选项或未赋值控件仍可建立绑定，并以 `ready`、`empty`、`unset`、`unavailable`、`error` 表示瞬时可用性，不得伪装成 `missing` 或 `incompatible`。
3. 节点菜单装饰不依赖创建时的 widget 完备性；每个节点只安装一次菜单入口，在右键菜单实际打开时通过 Provider Registry 重新发现当前能力，以覆盖连接后才生成 widget 的 Primitive 节点和挂载后才生成公开投影的子图节点。Provider 可为每个控件声明通用来源组提示；ParameterPanel Provider 先按 Separator 划分有序分区，再用 Separator 的稳定 Parameter Id 生成可选 `scopeId`。Dashboard 命令层只消费该提示，不理解 ParameterPanel 结构：有真实 Separator 的面板按非空分区自动建组，单参数分区也保留组；无 Separator 的面板继续在同源卡片达到两个时按面板标题建组。后续新增卡片按完整来源身份加入原组，且不覆盖用户改名或重排既有布局。节点右键添加参数始终可用；编辑模式只开放页面、十二列细分网格、布局组和卡片布局操作。卡片宽高以整数网格单位持久化，窄侧栏的一列投影只改变显示，不反写规范布局。
4. 图变化在动画帧内合并刷新。失效或类型不兼容的绑定原样保留，布局备份导入跳过不兼容值并等待人工重绑。
5. 侧边栏预设纯模型保存完整 Dashboard 与按稳定 Binding Key 索引的可序列化参数 payload，并从当前 Working Copy 与基准快照计算“已修改”状态；不存在基准时界面只显示中性占位。运行时协调器负责去重、捕获、预检以及布局与参数的共同应用和失败回滚；工作区入口负责 ComfyUI 图事务、对话框、切换保护和工作流序列化，Provider 继续是唯一写回节点的边界。预设集合与基准身份位于 `app.graph.extra.aaaliceSidebarPresets`，随工作流文件分发（含 Workflow Hub 的打包与安装，该插件原样保留 `extra`），跨插件契约是“不得剥离未知 extra 键”，Hub 侧零耦合。图同步签名同时覆盖看板与预设 extra，结构相同但持久状态不同的工作流切换标签页时必须刷新。
6. “组导航”只显示用户手动加入的可视组；版本化导航清单、唯一组合键、每项 X/Y 目标偏移和目标缩放写入 `app.graph.extra` 并随工作流保存，组状态与边界从当前图实时解析。定位时偏移实时边界的目标中心并按条目倍率计算目标画布缩放；搜索和定位只属于会话视图，导航范围不受 QuickGroupManager 的颜色筛选或排序影响。

#### 第三方节点适配

- 简单原生节点无需注册适配器，节点右键菜单会直接提供可序列化的基础控件。子图公开控件使用 ComfyUI 的非序列化 `PromotedWidgetView` 作为视图，真实状态仍由内部 widget 持有，因此只在子图 Provider 路径允许该视图进入适配。已转换为输入的 widget 和原生 linked widget 不作为独立侧边栏参数，也不会阻断同节点其它基础控件。
- ComfyUI 内置 `PreviewImage`、`PreviewAny` 与 `ImageCompare` 使用显式只读适配，不进入普通 widget fallback。执行结果与纯文本/Markdown 显示模式变化通过宿主回调触发一次控制面板失效；图像 URL 在同一批结果内保持稳定，禁止轮询或把输出快照持久化进侧边栏预设。
- 只要普通节点包含未知 widget、DOM 面板、图片上传、预览或自定义操作控件，内置 fallback 就不接管该节点的原生控件，避免把自定义状态拆成不完整的侧边栏副本。此类节点必须由节点作者或本包使用显式适配器逐项接入。
- 第三方扩展从 `/extensions/ComfyUI-Aaalice-Nodes/api.js` 导入 `registerWidgetControlAdapter()`；适配器只负责识别 widget，并描述稳定 `controlId`、显示名、控件 `kind`、稳定 `valueType`、当前值、选项、可用性和写回函数。动态选项变化后可调用 `invalidateControlHost(node)` 请求事件驱动刷新，不得轮询。普通标量自动进入侧边栏预设；领域值需要自定义序列化时可选实现同步 `readPresetValue()`、`validatePresetValue(entry)` 和 `applyPresetValue(entry)`，三者组成同一 codec，payload 必须可写入工作流 JSON。
- 适配器使用稳定英文 `id` 和显式 `priority`。Dashboard Binding 保存 Adapter ID，重载后不会因新增适配器或优先级变化而漂移到另一实现。
- 已有 `numeric`、`boolean`、`choice`、`text` 使用 ComfyUI 控件族。特殊类型可再用 `registerControlRenderer("comfy", kind, renderer)` 注册渲染器；renderer 只消费 Control Spec / Port，并返回 `controlView()`，不得持有工作流状态。
- Provider 负责图事务、节点 dirty 和绑定解析；适配器不得直接操作侧边栏 DOM，渲染器不得发现节点。适配器卸载函数应在第三方扩展销毁时调用。

```js
import { registerWidgetControlAdapter } from "/extensions/ComfyUI-Aaalice-Nodes/api.js";

const unregister = registerWidgetControlAdapter({
  id: "vendor-strength",
  priority: 100,
  matches: ({ widget }) => widget.type === "VENDOR_STRENGTH",
  describe: ({ widget }) => ({
    controlId: `strength:${widget.name}`,
    label: widget.label || widget.name,
    kind: "numeric",
    valueType: "number",
    getValue: () => widget.model.value,
    getAvailability: () => ({ state: widget.model.ready ? "ready" : "unavailable", reason: "vendor-loading" }),
    options: { min: 0, max: 10, step: 0.1 },
    setValue: (value) => { widget.model.value = value; },
	readPresetValue: () => ({ strength: widget.model.value }),
	validatePresetValue: (entry) => Number.isFinite(entry.payload?.strength) || "invalid-strength",
	applyPresetValue: (entry) => { widget.model.value = entry.payload.strength; },
  }),
});
```

## Classic、Nodes 2.0 与尺寸

- Canvas/native 层负责真实 slot、连线和静态布局；DOM overlay 负责交互、焦点、键盘、tooltip 与 aria。
- ParameterPanel、ParameterReceiver 与 EnumSwitch 的画布槽数组只包含当前业务项，槽 id 使用后端有界 Schema 的连续前缀。
- Nodes 2.0 concrete slot 对象在原生槽变化后同步名称、类型、颜色和位置；不得恢复隐藏槽数组。
- DOM widget 通过 `getMinHeight()` 声明与当前几何无关的稳定内容下限。Classic 只有内容本身定义最小高度且界面不要求再次缩短时才可走 LiteGraph grow-only 路径；可手动缩放的列表节点使用固定下限和内部滚动。Nodes 2.0 尺寸继续由原生 DOM 测量持有。
- `computeSize()`、`getMinHeight()` 和布局刷新不得读取当前 `node.size`、已拉伸 wrapper 或 `scrollHeight` 后再作为最小值，否则会形成只增不减的尺寸反馈环。
- 全尺寸 DOM widget 的 wrapper 与业务根不接收指针，只让真实控件命中；缩放期间全部 DOM 后代让出事件，保证 LiteGraph 左右下角原生缩放手柄持续可用。
- QuickGroupManager 没有协议槽，最小高度由当前可见组数量决定且列表不使用内部滚动；`graphChanged` 不得替换为状态轮询。
- ResolutionPreset 使用固定内容下限、内部坐标板和两个真实原生输出槽；空白画布不接收指针，只有三个控制柄和表单控件命中。
- 节点 DOM 根不覆盖原生背景、外边框或圆角；Classic 使用 LiteGraph `bgcolor`，Nodes 2.0 保留原生容器轮廓。

## 可选依赖与公开边界

- KJNodes 只对 ParameterReceiver 的绑定、同步和 ParameterPanel 的 Set/Get 辅助功能可选依赖；缺失时明确报错，不模拟成功。跨图绑定只允许面板位于接收器当前图或父级图，保持 KJNodes 的词法作用域。
- Classic 与 Nodes 2.0 为支持范围；App Mode 暂不支持。
- ParameterReceiver 的节点与真实槽只作用于自身所在图，但可沿已绑定 Set/Get 的真实 Subgraph 边界维护下级子图节点；QuickGroupManager 仍只作用于当前图，不递归修改 Subgraph 内部图。
- DIY 侧边栏只投影 Subgraph 整体公开的兼容 widget，不遍历或绑定内部节点。
- SimpleNotify 只在发起执行的前端产生提醒，不表示并行分支、整个工作流或队列完成。
- ResolutionPreset 只输出精确宽高；比例与 MP 为只读摘要，不负责图像、Latent、模型推荐、裁剪、缩放或 batch。
