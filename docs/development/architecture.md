# 架构

本文描述当前实现的模块边界、状态真源和运行时数据流。历史取舍见 `docs/adr/`，交互与视觉细节见 `docs/design/`。

## 已注册节点

| 节点 | Category | 执行职责 | 前端职责 |
|---|---|---|---|
| `QuickGroupManager` | `Aaalice/control` | 无 Prompt I/O 和执行副作用 | 发现、过滤、排序并原子切换当前图的可视组 |
| `ResolutionPreset` | `Aaalice/tools` | 校验执行载荷并输出精确 width / height | 预设、精确输入、画幅拖拽、对齐和个人预设管理 |
| `SimpleStringSplit` | `Aaalice/tools` | 拆分字符串、清理空白并移除空段 | 无业务前端 |
| `SimpleNotify` | `Aaalice/tools` | 透明透传并返回提醒 payload | 在发起执行的页面发送桌面通知和提示音 |
| `PromptSelector` | `Aaalice/prompt` | 组合前缀与有序词条正文，校验缺失引用和权重 | 跨分类选择、筛选、排序、权重和实时词库 payload 注入 |
| `BooruGalleryNode` | `Aaalice/gallery` | 下载有序选择快照，原子解码并输出一一对应的 IMAGE/STRING list | 多站点搜索、虚拟瀑布流、选择排序、本地标签编辑、详情、收藏与设置 |
| `FetchFromKrita` | `Aaalice/krita` | 每次执行请求当前活动文档快照并输出 IMAGE/MASK | Bridge 连接、活动文档与最近获取状态，以及共享 Krita 设置入口 |

根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`。`nodes/__init__.py` 按稳定域顺序加载 `NODE_CLASSES`；域导入错误保留原始异常。当前 Python 域为 `nodes/control`、`nodes/tools`、`nodes/prompt`、`nodes/gallery`、`nodes/krita` 与无 ComfyUI 运行时依赖的 `nodes/_lib`。

## 后端边界

- V3 `validate_inputs()` 运行在上游节点执行之前，只允许声明并校验当前 prompt 中已经存在的字面量或前端注入 payload。连接输入的真实值只在 `execute()` 可用，因此所有非空、内容结构和业务语义检查都在执行阶段完成。当前 `PromptSelector` 的自定义校验签名只暴露自己的注入 payload，不使用 `**kwargs` 接收无关连接输入。
- `nodes/control/quick_group_manager.py` 只注册无输入输出的 V3 节点；组发现和模式变化不进入后端。
- `nodes/tools/resolution_preset.py` 没有可见输入，只接受前端注入的版本化 `resolution_json`，校验 ComfyUI 尺寸范围与基础 8 px 对齐后输出两个具名 INT。个人预设 Store 位于当前用户目录，使用线程锁、临时文件和原子替换；专用 HTTP 路由只负责 CRUD 和明确错误映射。
- `SimpleStringSplit` 是独立纯后端工具，不依赖参数系统。
- `SimpleNotify` 使用成对 MatchType 输入输出和 ComfyUI 默认 list 映射。后端只返回透传值与提醒 payload，浏览器副作用不进入执行层。
- `PromptSelector` 接收可选前缀并输出单一 STRING；纯逻辑校验有序词条 payload、0–20 权重和分隔符。`nodes/_lib/prompt_library.py` 拥有 SQLite 词库领域服务，`prompt_library_archive.py` 独立负责 ZIP 导入导出与图片归档，HTTP 路由只负责 JSON、图片、ZIP 与变更事件传输。
- `BooruGalleryNode` 没有可见输入，执行版本化选择 payload，并并发下载最多三张原图；`asyncio.gather` 保持快照顺序，任一下载或解码失败则整体失败。站点适配器统一 Summary、Detail、Page 与 capability（Summary 携带 Sample / Large Preview 地址供前端直接预取），路由只处理 JSON、流式媒体和错误映射；媒体代理（`nodes/gallery/media.py`）复用共享连接池，按 URL 磁盘缓存并去重并发请求，瞬时失败退避重试、客户端断开不中断共享下载，逐次复核 HTTPS 白名单、Content-Type 和大小，并使用适配器声明的站点请求头处理媒体源约束（Gelbooru 必须携带站点 Referer，否则上游会把图片重定向到 HTML 帖子页）。缓存与执行原图统一受 `cacheBudgetMiB` 预算修剪。
- `FetchFromKrita` 没有公开输入且标记为非幂等。执行层写入唯一请求、最多等待 15 秒并响应 ComfyUI 取消；`nodes/_lib/krita_snapshot.py` 校验协议、请求身份、受限路径、PNG、尺寸和选区语义，再规范化为 IMAGE/MASK。Bridge 状态、安装、启用、修复和测试路由与快照执行分离，启动时只检查；用户显式安装或修复时原子更新 Krita 插件开关，覆盖文件或配置前要求 Krita 已关闭。
- Discord 分享不新增执行节点。`nodes/tools/discord_share_routes.py` 只向前端公开中继和社区 URL，Webhook、OAuth Secret 与成员会话不进入 ComfyUI Python 进程；可信中继实现位于 `deploy/discord-share-worker/`：`worker.js` 只负责环境校验与路由装配，`auth.js` 拥有 OAuth、会话和逐次成员/角色校验，`share.js` 拥有限流、公开 Target、消息规划和 Webhook 事务，`http.js` 统一 JSON、CORS 与配置错误。频道配置以 Worker Secret 中的 `{ id, label, url, default, prefer_prompt_file }` 数组为真源，浏览器只接收不含 URL 的公开字段并提交 Target Id。`prefer_prompt_file` 只驱动客户端推荐状态，不强制覆盖用户最终选择。KV 只保存短时 OAuth handoff 与带 TTL 的会话；每次发送的用户级滥用保护由 Cloudflare 原生 Rate Limiting binding 承担，避免分享吞吐受 KV 每日写入额度限制。


## 前端模块

| 模块组 | 文件 | 职责 |
|---|---|---|
| 包入口 | `js/extension.js`、`js/i18n.js` | 加载共享样式、业务扩展和双语资源 |
| 分辨率预设 | `js/resolution_preset.js`、`js/lib/resolution_preset_model.js` | 状态规范化、预设匹配、二维映射、DOM 交互、个人预设请求和 width / height payload 注入 |
| 组管理与导航 | `js/quick_group_manager.js`、`js/workspace/{group_navigation,group_navigation_wheel}.js`、`js/lib/{quick_group_manager_runtime,quick_group_manager_popovers,group_navigation,group_navigation_model,group_navigation_wheel_model}.js` | 节点生命周期与紧凑 DOM、独立颜色/联动浮层、原子模式事务、共享组边界导航、版本化手工清单与轮盘几何模型；轮盘 DOM 生命周期由工作区入口装配并按 owner 清理 |
| 提醒 | `js/simple_notify.js` | 执行结果消费、权限入口和右键测试 |
| 提示词选择 | `js/prompt_selector.js`、`js/lib/{prompt_selector_model,library_store,library_index,virtual_list,image_preview,prompt_entry_details,category_color,collection}.js` | 虚拟条目列表、词库索引与事件、共享图片及词条信息预览、分类颜色与收藏夹适配、选择状态与执行 payload |
| 多站点画廊 | `js/booru_gallery.js`、`js/lib/{booru_gallery_{model,cards,controller,dialogs,media,settings},virtual_masonry}.js` | 入口装配与选择快照注入；模型、卡片（含仅持有 detached 图片的会话解码图池）、控制器、弹窗、媒体交互、设置和自然比例虚拟瀑布流按职责分离 |
| Krita 快照 | `js/fetch_from_krita.js` | 紧凑连接状态、活动文档、最近执行摘要、显式刷新与共享 Bridge 设置 |
| Discord 分享 | `js/discord_share.js`、`js/lib/discord_share_{capture,client,model,picker,image_viewer,prompt_file,target_picker}.js` | 入口与发送流程装配；执行快照、网络客户端、纯模型、选择器、图像查看、提示词附件和 Target 选择按职责分离 |
| DIY 左侧工作区 | `js/workspace.js`、`js/workspace/*.js`、`js/lib/{dashboard_*,control_binding_set,control_providers,native_output_controls,control_host_events,node_control_menu,workspace_controls,widget_control_adapters,image_preview,lora_preview}.js` | `workspace.js` 只装配生命周期；视图、滚动、绑定、预设、来源组、图签名、组导航、词库、注释、数值范围和侧栏偏好位于 `js/workspace/`，纯模型、布局命令、Provider、事件和第三方 widget 适配位于 `js/lib/` |
| 参数控件 | `js/lib/controls/{contract,registry,specs,availability,comfy,quick_group_manager,numeric,boolean,choice,text,taglist,tag_pills,image_choice,image_compare,image_output,markdown,text_output}.js`、`js/lib/control_tones.js`、`js/api.js` | 统一 Control Spec / Port / View 契约、暂不可用状态、ComfyUI 控件策略、QuickGroupManager 整体控件、只读图像/文本/图像对比视图、稳定展示色分配、无状态控件实现和第三方公开注册入口 |
| 纯模型 | `js/lib/{quick_group_manager_model,group_navigation_model,native_output_model}.js` | 状态规范化、校验、差异和可单测规划 |
| 节点缩放 | `js/node_resize.js`、`js/lib/{native_widget_resize,dom_widget_resize}.js` | 精确 node type 的原生 widget 角区让渡、全尺寸 DOM 缩放期失效和生命周期清理 |
| 打开时聚焦 | `js/focus_on_open.js`、`js/lib/focus_on_open_model.js`、`js/lib/theme-focus-on-open.css` | 通用节点右键菜单、唯一工作流标记、目标视图设置、加载代际、静默子图导航和 Classic / Nodes 2.0 标记图标；撤销/重做触发的图重载（`loadGraphData` 以 `clean === false && restore_view === false` 调用）只同步标记视觉，不执行自动聚焦 |
| DOM 与媒体辅助 | `js/lib/{node_accent,image_reference,image_upload,safe_markdown,markdown_editor,simple_notify_runtime,dom_widget_visibility}.js`、`js/vendor/` | 节点强调色同步、图像引用与共享上传/拖放、安全 CommonMark/GFM 渲染与编辑变换、富 DOM 视口降载、固定版本前端依赖和提醒运行时 |
| 共享 UI | `js/lib/ui.js`、`js/lib/ui/{primitives,transient_surfaces,overlays,controls}.js`、`js/lib/ui.css`、`js/lib/theme.css`、`js/lib/theme-*.css` | `ui.js` 保持稳定公开入口；内部按基础 DOM/图标、Tooltip/滚动手势、Popover/Dialog、表单控件的单向依赖拆分。`theme.css` 是唯一功能样式入口并按稳定级联顺序导入控件、工作区和各领域样式分片 |

共享 `js/lib` 模块不得自行注册扩展或拥有工作流状态。业务入口负责生命周期和画布事务，纯模型保持无 DOM、无 ComfyUI 运行时依赖。

第一方代码以单一职责维持模块边界：600 个物理行是主动拆分目标，800 行是自动检查阻止的硬上限。固定上游依赖只允许通过精确目录豁免；入口文件不得重新吸收已经分离的模型、DOM、路由或领域样式。

### 模块入口与导出契约

`js/extension.js` 是浏览器端唯一入口，工作区等业务入口只负责装配生命周期；拆分后的视图、模型和辅助模块通过明确的 named export 连接。相对路径导入必须指向本包公开挂载路径或 ComfyUI `/scripts/`，不能依赖目录自动执行或隐式全局变量。模块新增、移动或 barrel re-export 变更时，由 `tests/frontend_import_paths.test.js` 静态解析本包 named import/export 链，运行时行为仍由 `npm test` 与 GUI 主路径共同验证。

## 状态真源

| 功能 | 持久真源 | 实时派生数据 | 不得成为真源 |
|---|---|---|---|
| ResolutionPreset | `node.properties.resolutionPresetState` | 预设匹配、坐标映射、比例与 MP 摘要、执行 payload | DOM 字段、`presetId`、个人预设缓存 |
| ResolutionPreset 个人预设 | 当前 ComfyUI 用户目录 JSON | 当前用户的名称、尺寸、alignment 和稳定 UUID | 工作流 JSON、节点属性或浏览器存储 |
| QuickGroupManager | `node.properties.quickGroupManagerState` | 组名、颜色、成员和实际模式 | 缓存的组快照、其它 Manager 状态 |
| PromptSelector | `node.properties.promptSelectorState` | 当前词条正文、缺失引用、执行 payload | 节点内正文快照、DOM 复选状态 |
| BooruGalleryNode | `node.properties.booruGalleryState`（查询上下文、逻辑页码、选择模式与选择快照） | 搜索 Summary、详情、当前请求和执行 payload | 搜索结果、cursor、滚动像素、Hover、Dialog、凭据、缓存或图片 DOM |
| Booru Gallery 用户设置 | 当前 ComfyUI 用户目录配置文件 | 凭据、默认来源、黑名单、Prompt 默认值、超时与缓存预算 | 工作流 JSON、节点属性或搜索结果 |
| Krita Bridge | Krita 插件目录与本机专用临时目录 | 连接心跳、请求关联的 JSON/PNG 和最近执行摘要 | `node.properties`、工作流 JSON、浏览器存储或旧快照复用 |
| Discord 分享入口 | ComfyUI 应用设置 `Aaalice.DiscordShare.Placement` | 侧栏/顶栏 DOM 和验证状态点 | 多个布尔开关、工作流 JSON 或入口 DOM |
| Discord 提示词来源 | `app.graph.extra.aaaliceDiscordShare.promptSource` | Preview Any 的限定执行 Id 与本次输出文本 | 提示词正文副本、节点标题或裸 Node Id |
| Discord 最新运行 | 页面内存中的最后一次成功执行快照 | `/history/{prompt_id}` outputs、图片尺寸、当前选择和 Dialog 内本次分享的临时提示词草稿 | 工作流 JSON、节点属性、浏览器持久缓存 |
| Discord 成员会话 | 浏览器当前 Origin 的可撤销会话 | 中继逐次成员/角色校验 | Webhook、OAuth Secret 或工作流 |
| Discord 频道选择 | 浏览器 `localStorage` | 中继公开的 Target Id 子集 | Webhook URL、工作流 JSON 或节点属性 |
| Discord 长 Prompt 文件偏好 | 浏览器 `localStorage` | 是否把超过单 Embed 限制的 Prompt 改为 TXT 附件 | Prompt 正文、工作流 JSON 或频道密钥 |
| 打开时聚焦 | 根图及嵌套 Subgraph 节点的 `node.properties.aaaliceFocusOnOpen` | 目标节点、X/Y 画布偏移、目标视图缩放 | 节点标题、裸 Node Id、浏览器已读状态或 DOM 按钮 |
| DIY 侧边栏布局 | `app.graph.extra.aaaliceSidebar` | 页面、组、卡片布局、稳定 Binding、来源组身份、`groupSource` 纳管关系、源标题快照、用户覆盖、卡片 tone 和卡片/分隔项 Component Note；控件值、目标解析和 Missing Binding 状态为实时派生 | 侧边栏 DOM、节点标题或位置、同步状态本身 |
| DIY 侧边栏预设 | `app.graph.extra.aaaliceSidebarPresets` | 当前完整 Dashboard 快照、控件值与基准预设身份 | 滚动、选区、编辑模式、图钉、搜索、词库与工作流节点结构 |
| Dashboard 参数调整档案 | 浏览器 `localStorage`（`aaalice.workspace.valueProfiles`） | 档案列表与规则（卡片主绑定的稳定 Binding Key、快照式目标值 payload、回退匹配用的控件名与宿主标题） | 工作流 JSON、节点属性、布局与选区状态 |
| Prompt Library | 用户目录 SQLite | 当前筛选、PromptSelector 引用解析 | 单个工作流、单个节点或浏览器缓存 |


## 生命周期与数据流

交互节点覆盖 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描，并幂等挂载。DOM widget 同步创建；异步 i18n 就绪后只更新文案和重绘。本包新增的节点右键菜单项必须以语义明确的 emoji 开头，并在 `locales/en/main.json` 与 `locales/zh/main.json` 中同步维护；同一动作的启用、设置与取消项都遵循此规则。

现有节点扫描必须覆盖根图和全部嵌套 Subgraph 定义。`graphToPrompt` 注入不得用裸 `node.id` 查找执行节点，必须按每条 Subgraph wrapper 路径生成 ComfyUI 的限定执行 ID，并覆盖共享 Subgraph 定义的每个实例；前端执行事件也必须用同一限定 ID 反向定位节点。

挂载和状态恢复是两个独立职责：`nodeCreated` 或 setup 可以先用默认状态建立 DOM，但 `onConfigure` 只能作为早期同步，不能假定此时工作流恢复已经结束。`loadedGraphNode` 必须即使在组件已挂载时也重新读取 `node.properties`，同步所有受持久状态控制的 DOM，并重新计算或请求派生内容。初始化期间已经发出的异步请求必须用 `AbortController` 或 generation 机制失效；否则默认请求可能晚于恢复请求返回，让界面看似回到默认值，而手动刷新后才恢复正确状态。

### Canvas 性能边界

1. LiteGraph 在拖拽和平移期间会逐帧调用尺寸、排列和绘制回调。QuickGroupManager 的可见组快照只在事件驱动的 `render()` 中生成，逐帧高度回调只读取缓存；GroupLogicProbe 的规范化状态按原始对象身份复用。节点位置和无关高度变化不使这些缓存失效。
2. Dashboard 控件值通过已挂载 `controlView().update()` 定向更新，不替换 DOM、不重算布局；结构变化才重建控件并刷新依赖链。
3. 所有顶层节点 DOM widget 使用宿主 `hideOnZoom` 低质量变换路径，画布平移或缩放期间临时绘制占位，稳定后仍用同一持久状态恢复。
4. Booru Gallery 和 PromptSelector 的宿主 widget 保持注册，插件内部富内容由 `dom_widget_visibility` 以有限视口预热范围切换 active；离屏时虚拟列表/瀑布流释放条目 DOM 和图片源，只保留模型与 spacer 布局，返回视口后按同一 controller 恢复。该机制不修改 ComfyUI 核心、其它插件或工作流持久状态。
5. Workspace 图签名只读取 widget/options 的静态 own data property；accessor-backed 动态选项由 `CONTROL_HOST_INVALIDATED_EVENT` 失效，加载、撤销和重做由 `afterConfigureGraph` 强制恢复，不在签名阶段执行第三方 getter。
6. KJ Set/Get 的虚拟连线绘制属于 KJNodes 自身：其 Show links、单节点 `drawConnection` 和 Performance 设置可能独立增加每帧图扫描与连线绘制。本包只通过公开 Set/Get API 做事件驱动的结构同步，不改写 KJNodes 的 canvas renderer。
7. Dashboard 参数值按稳定 Binding Key 进入进程内 value channel，直接调用现有 Control View 的 `update()` 同步同卡片、重复卡片与多根投影；普通值提交不调用 `renderWorkspace()`，也不重新解析 Provider。Subgraph Provider 按稳定 Control Id 缓存“绑定到哪个 promoted widget”的结构索引，值仍逐次实时读取；嵌套定义 owner 只在图结构或 Control Host 明确失效时清空。自定义 Sidebar 的重复 render 回调在仍拥有原 DOM 树时为 no-op，结构重绘在连续手势期间延后到提交后执行一次。

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
4. 相册只展示最后一次成功执行的去重图像；尺寸由浏览器按需解码，当前缩略图、Dialog 状态和提示词编辑草稿不持久化。提示词缺失时禁用发送并要求重新绑定、执行；有提示词时可在发送前进入多行编辑态，保存或放弃修改，且编辑只影响本次分享。
5. 发送前中继重新查询 Guild 成员和可选角色，执行用户级限流、Target Id、图片类型/大小与提示词校验。一般 Prompt 以连续 fenced Embed 排在图像之前；关闭文件化时超过单个 Embed 的内容按顺序拆成最多十条消息，图像只附在最后一条；启用文件化且超过 1,500 字符时，改为 UTF-8 TXT 与图像同消息附件。首个 Embed 使用会话用户或当前 Guild Member 的昵称与 Discord CDN 头像表达作者身份，但不覆盖 Webhook 自身头像和名称；后续分段不重复作者。任一分段失败时中继尽力删除该频道已发出的分段，任何步骤失败都保持明确错误，部分频道失败会返回独立目标结果。

### ResolutionPreset

1. `node.properties.resolutionPresetState` 保存版本、精确宽高、alignment、画布范围与可失效的显示提示 `presetId`；每次恢复都重新规范化和匹配。
2. 指针与连续键盘操作各自只建立一个图历史边界；拖拽中只预览，取消时恢复快照，完成后才按需要升高画布范围。
3. 个人预设异步请求使用 AbortController 与 generation 淘汰迟到结果。服务错误只禁用个人预设操作，不影响本地尺寸编辑和执行。
4. `graphToPrompt` 只注入版本化 width / height；后端再次校验并直接返回两个 INT，使尺寸变化进入 ComfyUI 执行缓存键。

### QuickGroupManager

1. `quick_group_manager_runtime.js` 是节点 DOM 与侧边栏整体控件共用的唯一状态快照、级联预检和图事务边界；两种表面不复制 Manager 状态。
2. QuickGroupManager 通过 Control Provider 以单一稳定 binding 暴露到 Dashboard，侧边栏卡片只投影该节点，不复制另一份组管理状态。
3. 全局 `graphChanged` 监听在动画帧内合并刷新，节点实例和侧边栏控件只读取所属 graph 的实时组快照；组成员优先使用官方 `recomputeInsideNodes()`，图恢复期间为空时再从当前 `children` / 几何边界恢复实时节点，不把空缓存当成永久事实。
4. 用户开关先在纯模型中规划同 Manager 级联和节点模式变化；环路、缺失目标、路径冲突或重叠组冲突会在写入前中止。节点面和侧边栏都通过同一 runtime 提交模式，并在图事务完成后刷新另一表面。
5. 通过预检后，在一个 Manager 所属 graph 的变更边界内提交全部模式；Dashboard 预设通过同一整体 codec 只保存和恢复当前组开关状态。颜色范围、排序、关闭模式与联动规则继续以 Manager 节点状态为共享真源，不随侧边栏预设切换。

### 节点强调色

1. `js/lib/node_accent.js` 从节点当前 `color` / `bgcolor` 解析 Node Color，并把派生 token 写入业务 DOM 根。
2. QuickGroupManager 在创建、加载、配置和业务重绘时同步初始颜色；ComfyUI 官方 `setColorOption()` 改色入口负责即时更新。
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

### BooruGalleryNode

1. `node.properties.booruGalleryState` 只保存来源、查询筛选、Prompt 处理和有序 Detail 快照；浏览结果、详情请求与 DOM 都是会话派生状态。用户目录中的全局内容黑名单由 Service 注入适配器并进入页面缓存键；每个来源都只对轻量列表响应自带的标签做本地精确过滤，不向远端查询发送排除标签、不改变来源认证要求，也不得为黑名单逐帖 hydrate Detail。若连续页面因本地过滤不足以填满视口，前端只根据瀑布流已有布局几何有限补页，达到预算后由用户显式继续。
2. 搜索只获取 Summary。Hover、详情或选择才按需补全 Detail 和分类标签；页面、详情、标签分类和原图分别进入有界缓存。
3. 独立虚拟瀑布流按最短列增量放置，ResizeObserver 只观察容器；滚动由单一 rAF 计算可见区并差量挂载卡片，离开 overscan 的图片移除 `src`。滚动帧不重写未变化的卡片样式，布局对象以 revision 标记真实几何变化（`setItems`、`reflow`、列数变化），仅 revision 变化时全量同步已挂载卡片的宽高与 transform；可见项上报只在可见集合变化时触发，卡片倾斜动效由容器统一委托（单监听、单 rAF、每帧至多一次 `getBoundingClientRect`）。快速滚动期间新挂载卡片只占位、滚动停止后统一补挂图片源，sample 预取防抖到停止后，滚动跨页的图 dirty 信号（`graph.change()`，会强制全画布重绘）合并到停止后。
4. 用户编辑只改本地分类标签。`graphToPrompt` 为每次排队复制当前有序选择和最终 Prompt，后续节点编辑不回写已经排队的任务。
5. capability 控制 Rating、排行榜、直接跳页、认证、原图下载和收藏按钮。排行榜走适配器独立入口；逻辑页码统一从 1 开始，远端 `page` / `pid` 转换不进入前端。Gelbooru 的搜索、详情和标签分类必须使用官方 User ID / API Key；设置边界接受账户页复制的 `&api_key=…&user_id=…` 凭据片段并规范化保存，不能改动其它来源凭据。其 Rating 使用站点当前的 General、Sensitive、Questionable、Explicit；单选分级发送远端 metatag，多选分级因远端不支持同类 metatag OR 而在真实分页结果上本地过滤。Gelbooru 不写收藏。Safebooru 与 AI TAG 不显示账户收藏；AI TAG 直接使用公开搜索、月榜与作品详情 API，并从公开图片元数据生成 Prompt，不把它伪装成传统 Booru Rating/标签分类。AI TAG 列表只提供推导缩略图时保留资源目录大小写；若首图并非 `_p0`，卡片仅在图片失败时按需请求详情恢复真实首图，不把逐帖详情请求恢复到搜索主路径。所有来源都不使用 Cookie、HTML 会话或验证码兼容层。
6. Gallery 的搜索、过滤列表和本地标签编辑通过 Autocomplete-Plus 的 `raw-tag` 外部输入模式接入补全；站点原始标签身份在插件边界保持不变，面向生成提示词的空格替换、括号转义、画师前缀和自动分隔符不得进入搜索与精确匹配路径。

### DIY 左侧工作区

1. 官方 Sidebar Tab 挂载控件与词库工作区；页面布局及页面顺序随工作流序列化，控件值仍由节点拥有。页码菜单通过专用拖拽手柄和键盘移动页面，不把排序状态藏在 DOM 或会话状态中。
2. Control Provider Registry 分别解析简单 ComfyUI 原生 widget、内置只读执行预览和子图整体公开 widget；绑定只按稳定 Host ID、Control ID 与可选 Adapter ID 精确解析。原生 fallback 仅接受由 `INT`、`FLOAT`、`BOOLEAN`、`STRING`、`COMBO` 及其 LiteGraph 运行时别名（包括 `number`、`slider`、`knob`）组成的简单节点，并统一映射为 `numeric`、`boolean`、`text`、`choice`；`PreviewImage` 与 `PreviewAny` 由独立 `comfy-output` Provider 显式读取官方执行消息、恢复后的 `node.images` / `preview_text` 与显示模式，不把临时媒体或文本写入 Dashboard 或预设。出现未知自定义面板时不做部分猜测。结构支持、运行可用性和绑定健康度是三个独立维度：空选项或未赋值控件仍可建立绑定，并以 `ready`、`empty`、`unset`、`unavailable`、`error` 表示瞬时可用性，不得伪装成 `missing` 或 `incompatible`。数值卡片可另外持久化侧边栏专用的 `numericRange`（最小值、最大值、步长）；它只覆盖当前卡片的交互投影，不改写 Provider Control Spec、原 widget 定义、多目标兼容签名或节点当前值。设置必须满足 Integer / Float 域并位于 Provider 已声明的有限边界内；未设置、失效或重置时使用节点原始范围。
3. 节点菜单装饰不依赖创建时的 widget 完备性；每个节点只安装一次菜单入口，在右键菜单实际打开时通过 Provider Registry 重新发现当前能力，以覆盖连接后才生成 widget 的 Primitive 节点和挂载后才生成公开投影的子图节点。枚举路径要求 Provider 在不支持当前节点时返回空列表，避免先调用 `supportsNode()` 再重复列举；绑定解析仍只重新适配命中的目标控件。Provider 可为每个控件声明通用来源组提示；Dashboard 命令层只消费该通用描述，不读取节点私有结构。后续新增卡片按完整来源身份加入原组，且不覆盖用户改名或重排既有布局。节点右键添加控件始终可用；添加控件时以节点标题和所属（含嵌套祖先）可视组标题对页面名做去装饰、后缀归一化和保守模糊匹配；只有达到可信分数才自动切换目标页面，否则保留当前页面。编辑模式只开放页面、十二列细分网格、布局组和卡片布局操作。Dashboard tone 系统由 `js/lib/dashboard_color_system.js` 统一提供可扩展预设色板、Hex 规范化和安全 CSS 值解析；`page.tone`、`group.tone` 与控件卡片可选的 `item.tone` 共用同一套语义色和 `#rrggbb` 自定义色编码。页面和卡片通过共享 tone 编辑器/菜单选择颜色，组仍通过组级 tone 编辑；只有选中非中性色时才写入对应字段，默认色通过缺省值表达；渲染层只为预设色使用稳定语义，用户色通过已校验的 CSS 变量注入，避免把输入拼入选择器。Dashboard V4 持久化 12 列整数网格：控件 `columnSpan` 可取 3–12 的任意整数，`rowSpan` 可取不小于 13 的任意整数；Provider 未声明宽度的新建绑定统一以 6 列进入默认左、右双列布局，显式 Provider 尺寸和既有卡片跨度不被覆盖。拖拽、键盘和命令继续按整数单位自由调整宽高，窄侧栏的一列投影只改变显示，不反写规范布局。V2/V3 在读取时自动迁移为 V4；V2 旧双列的列位置与列跨度等比映射到 12 列，V3 十二列布局原样保留，原有有效整数行跨度保持不变。“整理布局”按完整矩形占位和稳定视觉顺序执行确定性紧凑排列，重复整理结果不变。
4. Dashboard V4 的控件卡片以 `binding` 保存唯一主参数，并以有序 `linkedBindings` 保存附加目标；主参数唯一拥有标题、描述、控件形态和读值语义。`control_binding_set.js` 是联动兼容性、运行时解析和原子写入的唯一边界：只接受同一图中均显式可写、可进入预设且 Control Spec 类型与值域一致的目标；数值必须区分 Integer / Float，图像选择还要匹配目录语义，Seed 必须同时支持数值与执行后行为 codec。一次侧边栏写入先快照全部目标，在一个 graph history 边界内逐项写入；任何返回失败、抛错或部分写入都会逆序回滚全部已触达目标，禁止在 renderer、Dashboard 模型或 Provider 外层散落循环写入。绑定到已有卡片时，确认操作先重新枚举源节点、以最新 Host Id 重建 source binding，并重新匹配目标卡片；兼容性预检、Dashboard 提交和首次主值同步必须复用这同一次实时解析快照，不得在同一个同步事件中再次解析 promoted widget。这样复制子图后的身份修复与 Subgraph 公开视图的瞬时对象身份都由同一事务计划覆盖，不会把刚通过预检的有效目标误判为不可用。Workspace 在每次 `graphToPrompt` 序列化前及整次 `queuePrompt` 完成后，以主 Seed 的数值和执行后行为收敛附加 Seed；这样 `before` 与 `after` 更新策略、多批队列、工作流切换及 `randomize` 都不会让同一卡片的目标在实际 prompt 或下一次值中漂移。运行时 `availability` 与绑定健康分离：动态选项为空、未赋值或临时不可用只暂停整卡写入并显示可恢复状态，不能把持久联动判坏。节点右键菜单仅在存在兼容目标时提供绑定入口；“添加参数”列表使用 Provider control descriptor 展示，但身份判断必须在 `createControlBindingMatcher()` 这一边界解包 `control.binding`，不能把 descriptor 直接交给 binding matcher。已保存的旧 promoted-widget Control ID 通过解析到同一 widget owner 认定为已添加；已添加行必须禁用并从全选候选集中排除，避免重复创建卡片目标。卡片右键在有附加目标时管理联动，并保留主参数重绑。重绑与联动对话框位于 `js/workspace/dashboard_linking.js`，候选选择统一使用 `js/lib/searchable_select.js` 的多关键词模糊匹配；重绑预选以卡片标题和原控件身份对候选参数标签及其所属节点标题打分（纯逻辑在 `js/lib/rebind_match.js`），主分相同时用节点标题消歧，并在对话框挂载后把列表滚动定位到预选参数。页面菜单的批量重绑（`js/workspace/dashboard_batch_rebind.js`）复用同一打分对整页失效卡片给出预选，每行可按置信徽章（精确/建议/未匹配/手动）审阅、内联更改或跳过，确认后在 `commitDashboardBindingSet` 的单次图事务内完成全部替换并按需同步主值。联动目标枚举把主绑定失效的卡片作为显式重绑目标（broken 标记，以持久化 valueType 作为契约代理），选中后走 `replacePrimaryBinding` 而不是追加联动。失效卡片在 Dashboard 中以独立错误态区块呈现状态原因与最后绑定身份（`bindingControlIdLabel()` 把 promoted 元组还原为来源 widget 名）。持久化 promoted 元组的 `sourceNodeId` 因果因子图内部重建而失效时，`resolveAdaptedWidgetControl()` 与 `findAdaptedControl()` 按（来源 widget 名 + 消歧 Id）再按唯一来源名两级回退解析，任一级别存在多个候选时保持失效，绝不猜测。预设捕获和应用按字段元组编码的稳定 Binding Key 展开并全局去重所有目标，读取时迁移旧冒号 Key；来源同步只把主 binding 当作来源身份，来源删除或类型漂移不得删除含附加目标的整张卡片。宿主节点被替换（删除原节点、粘贴副本被重发 hostId 等）导致 hostId 失效时，`controlProviders.resolve` 经 `js/lib/binding_relocation.js` 用剩余身份（provider + controlId）在全图候选中重定位：promoted 元组携带内部节点身份，在不同子图定义间唯一，恰好一个候选时解析照常成功并标记 `relocatedHostId`，多个或零个候选保持 missing 绝不猜测；`resolvePageControls` 收集自愈结果并把新 hostId 一次性写回持久绑定（带 toast 反馈），避免每次解析重复全图扫描。
5. Dashboard 卡片和来源组把源名称快照与用户显式改名分开保存：`labelSource` / `nameSource` 只记录最近一次来源同步，`labelOverride` / `nameOverride` 一旦存在就拥有展示优先级。自动来源组和其纳管卡片分别保存 `group.source` 与 `item.groupSource`（Provider、Host Id、Scope Id）；手动移出、入普通组、删除组和复制页面/卡片会清除或隔离纳管身份。Provider 通过 `sourceSnapshot()` 返回有序、稳定 Binding、当前类型和来源标题，`dashboard_source_sync.js` 只消费该通用描述，不读取节点私有结构。
   控件卡片可另存可选 `tone` 作为卡片强调色，使用统一 Dashboard tone codec 规范化并随 Dashboard 规范化、复制、预设和便携备份保留；卡片和分隔项还可另存可选 `note` 作为用户 Component Note；它随 Dashboard 规范化、复制、预设和便携备份保留，但不参与 Binding 身份、Provider 解析、联动兼容或控件值比较。编辑与预览统一走 vendored `marked` 和 DOMPurify 的安全 CommonMark/GFM 路径，非 HTTP(S) 链接和图片不进入渲染结果；说明徽章只负责显式打开完整内容，不把长 Markdown 注册为整张卡片的悬浮层。
6. 来源变化只刷新来源组的派生状态，不自动改写 Dashboard。来源组标题右侧显示 `synced`、`needs-sync`、`syncing`、`missing-source` 或 `error` 状态；用户可执行单组同步，页面右键菜单只同步当前页来源组。纯模型同步按稳定 Binding / Scope Id 原子计算新增、删除、类型更新和重排，保留卡片尺寸、手动成员、组位置/宽度和用户覆盖；只删除明确由当前来源组纳管且来源快照确认已删除的卡片。旧布局首次同步只保守认领精确匹配项，无法确认来源的旧成员保留。
7. 图变化在动画帧内合并刷新。失效或类型不兼容的绑定原样保留，布局备份导入跳过不兼容值并等待人工重绑。
8. 侧边栏预设纯模型保存完整 Dashboard 与按稳定 Binding Key 索引的可序列化参数 payload，并从当前 Working Copy 与基准快照计算“已修改”状态；不存在基准时界面只显示中性占位。运行时协调器负责去重、捕获、预检以及布局与参数的共同应用和失败回滚；工作区入口负责 ComfyUI 图事务、对话框、切换保护和工作流序列化，Provider 继续是唯一写回节点的边界。预设集合与基准身份位于 `app.graph.extra.aaaliceSidebarPresets`，随工作流文件分发（含 Workflow Hub 的打包与安装，该插件原样保留 `extra`），跨插件契约是“不得剥离未知 extra 键”，Hub 侧零耦合。图同步签名同时覆盖看板与预设 extra，结构相同但持久状态不同的工作流切换标签页时必须刷新。预设保存规范化后的 V4 整数跨度；Provider 的运行时投影不进入持久快照。
9. “组导航”只显示用户手动加入的可视组；版本 3 的导航清单、轮盘激活键、每项 X/Y 目标偏移和目标缩放写入 `app.graph.extra` 并随工作流保存，v1/v2 读取时迁移为 v3，旧条目上的单组快捷键字段不再读取。组状态与边界从当前图实时解析，轮盘打开时只建立一次当前清单快照，提交时再按当前 graph 的实时组 ID 解析目标；搜索、轮盘选择和定位只属于会话视图，导航范围不受 QuickGroupManager 的颜色筛选或排序影响。纯几何和分页规划位于 `js/lib/group_navigation_wheel_model.js`，document-level 浮层、真实 button 扇区、焦点/键盘/指针生命周期位于 `js/workspace/group_navigation_wheel.js`；pointermove 只更新已有扇区状态，不重建 DOM 或重新扫描图。工作流切换、侧栏根隐藏/销毁、窗口失焦和可见性变化都关闭轮盘，避免旧 graph、焦点或监听器跨工作流残留。
10. Dashboard 页面滚动只作用于当前页面，不再把滚动边界解释为页面切换请求。页面切换由页眉左侧页面按钮、右侧独立 Page Rail 的胶囊点击或键盘操作触发；Page Rail 常态占用 Dashboard body 右侧固定 38px 独立列显示圆点，圆点列不覆盖 Scroll Surface 或控件；收起态圆点使用紧凑间距，只在圆点簇中央的动态命中区响应指针，圆点上下两侧的空白不触发展开；指针进入后圆点间距平滑增大，并始终以 Rail 的垂直中心作为唯一几何基准，扩展 gap 从中心向两侧对称分配；悬停、焦点和指针移动不改变中心，当前 `activePageId` 的 marker 只随所属条目渲染，不创建独立游标；胶囊展开时允许越出该列显示名称，透明悬浮区覆盖胶囊之间的间隙，收起由稳定的 Rail 外边界统一负责，并在布局帧确认已离开整体包络后收回；持久 Rail 被重新挂入页面渲染壳时不得把瞬时 pointerleave 当作真实离开；Dashboard body 必须以固定 flex/grid 轨道提供稳定高度，离场页面快照脱离轨道尺寸计算，避免切页过渡改变 Rail 中心；以选中整体强调光晕表达当前页。Page Rail 不消费滚轮，滚轮不会切换页面。每个侧栏根独立持有 Page Rail、当前页 marker 和过渡状态，根卸载、隐藏或切换工作区时只清理自身展开状态；页面请求按当前 `activePageId` 解析，多根同帧回到原 Page Id 时折叠为无过渡 no-op。`v-show` 隐藏根休眠且不重建 Provider/控件，首次挂载已隐藏的根只建立空占位与生命周期观察，重新可见时由 ResizeObserver 补一次完整渲染，搜索焦点只由发起操作的可见根消费；每个根生成独立 DOM 控件 id，禁止跨根 `label[for]` 命中。自定义页签宿主被 Vue 或其它 custom renderer 替换时，由根与父级所有权观察器清理旧实例及其挂到 `document.body` 的锚定浮层；销毁、隐藏与重绘只关闭锚定于对应根的 Tooltip、Popover 和 Context Menu，不得关闭其它 Graph View、画布节点或扩展的表面；所有脱离根挂到 `document.body` 的菜单必须保存显式 owner，控件销毁同时移除自身浮动编辑器并闭合尚未提交的图事务。
11. Dashboard 的完整重建只服务结构域：页面/布局、Binding Set、控件类型、动态选项、可用性和来源结构。参数值、Seed after-generate 行为及连续数值预览属于值域；写入完成后保持卡片、输入元素、焦点、Popover 和动画元素 identity。Provider 的 promoted widget 索引只缓存对象身份映射，不缓存值、可用性或预设 payload；`graphChanged`、工作流恢复及 `CONTROL_HOST_INVALIDATED_EVENT` 负责失效，避免以过期 descriptor 代替实时状态。
12. 画布绑定高亮由 `js/lib/canvas_control_binding_highlight.js` 维护；Classic 对 native/promoted widget 安装绘制包装，标记集合新增、替换或移除后必须调用 ComfyUI `LGraphCanvas.setDirty(true, true)`，因为安装包装不会自动重绘已经保留的画布帧。含 `PreviewAny` / `PreviewImage` 的子图首次恢复也遵守该契约，进入/退出子图触发的重绘不能作为修复手段。高亮解析只依赖绑定的 node/widget 身份，与控件实时值无关，因此按（Dashboard 模型引用 + 图结构签名）备忘解析结果，结构未变时同步只重放 DOM/标记差异；备忘录不按当前图过滤，图导航后重新过滤，`beforeConfigureGraph` 必须调 `invalidateCanvasControlBindingResolution()` 防止同签名重载后命中旧节点对象。Nodes 2.0 的行映射候选列表读取新协议投影 widget 的响应式 store 访问器，只能在真实重解析时刷新，DOM mutation 触发的行重映射必须复用缓存。
13. Dashboard 搜索只匹配参数组件的实时显示标题，搜索索引覆盖全部页面，不把页面名、布局组名或其它上下文元数据加入匹配；打开搜索后结果按页面分组挂载真实 Control View，查询输入只切换已有结果的可见性，不销毁搜索输入或控件 DOM；搜索结果与正常页面通过现有 value channel、Provider 写回和 controlView().update() 共享真实值，允许连续批量修改，并保留卡片菜单、联动、数值范围、图像上传、Seed 行为和可用性错误态。搜索会话不进入工作流持久化，搜索滚动独立于各页面 Scroll Surface，关闭后恢复当前页面原位置。

#### 第三方节点适配

- 简单原生节点无需注册适配器，节点右键菜单会直接提供可序列化的基础控件。子图公开控件是宿主投影，真实状态仍由内部 widget 持有，因此只在子图 Provider 路径允许该投影进入适配。前端两代协议由 `js/lib/promoted_widget_source.js` 统一屏蔽：旧协议投影（`PromotedWidgetView`）自带 `sourceNodeId` / `sourceWidgetName`（嵌套时另有 `disambiguatingSourceNodeId`）；新协议（frontend >= 1.47，上游 ADR 0009）普通宿主 widget 是由非枚举 `widgetId` 寻址的 widgetValueStore 投影；官方多行 `STRING` 则会物化为不携带 `widgetId` 的宿主 DOM widget，必须先按宿主 input 的 `_widget` 对象身份认领，再沿同一 input 的 `_subgraphSlot` 链路解析来源，不能把 DOM widget 当作未公开控件过滤。Promoted widget 的 Control ID 在两代协议下由同一源身份元组（`sourceNodeId`、`sourceWidgetName`、可选 `disambiguatingSourceNodeId`）生成，不使用公开名称或显示标签，旧工作流绑定在新协议下继续命中；同名的采样器、调度器等公开控件仍保持独立绑定。已转换为输入的 widget 和原生 linked widget 不作为独立侧边栏参数，也不会阻断同节点其它基础控件。
- ComfyUI 内置 `PreviewImage`、`PreviewAny` 与 `ImageCompare` 使用显式只读适配，不进入普通 widget fallback。执行结果与纯文本/Markdown 显示模式变化通过宿主回调触发一次控制面板失效；图像 URL 在同一批结果内保持稳定，禁止轮询或把输出快照持久化进侧边栏预设。
- 只要普通节点包含未知 widget、DOM 面板、图片上传、预览或自定义操作控件，内置 fallback 就不接管该节点的原生控件，避免把自定义状态拆成不完整的侧边栏副本。此类节点必须由节点作者或本包使用显式适配器逐项接入。
- ComfyUI 原生 fallback 在适配边界统一处理通用控件名称：`Value`、`值`、`数值`、`text`、`文本`、`string`、`字符串`（含尾随冒号）使用节点实时 `getTitle()`，明确的 widget 显示名保持不变；领域适配器可在 descriptor 中声明 `labelPolicy: "node-title"`，内置 `LoraManager` 的 LoRA 列表 widget 使用该策略统一显示节点实时标题。
- 第三方扩展从 `/extensions/ComfyUI-Aaalice-Nodes/api.js` 导入 `registerWidgetControlAdapter()`；适配器只负责识别 widget，并描述宿主内唯一的稳定 `controlId`、显示名（必要时用 `labelPolicy: "node-title"` 指向节点标题）、控件 `kind`、稳定 `valueType`、当前值、选项、可用性和写回函数。重复 `controlId` 会显式失败；可变宿主状态应通过 `getValue()` 实时读取，不能把一次性 `value` 快照当作长期真源；`matches()` 与 `describe()` 必须同步，`describe()` 返回 `null` 表示不公开该 widget，异步返回会显式报错。固定 `widget.type` 的适配器可直接声明 `widgetTypes: "VENDOR_TYPE"` 或字符串数组，框架会先做大小写归一化的类型过滤，再执行可选的 `matches(context)`，需要根据节点、Subgraph 或 widget 属性判断时再使用 `matches`。混合自定义面板与普通原生控件的节点可在已完整适配自定义 widget 的适配器上声明 `allowNativeFallback: true`，只为该适配器实际覆盖的 widget 放开其它简单原生控件；未知 widget 仍会阻断 fallback。`numeric` 控件若要参与联动还必须用 `numericDomain: "integer" | "float"` 声明数值域。自定义 DOM 控件可在 descriptor 中提供 `subscribeValueChange(listener)`，把节点侧的真实值变化定向广播给已挂载的侧边栏控件；动态选项变化后可调用 `invalidateControlHost(node)` 请求事件驱动刷新，不得轮询。适配器注册或卸载会触发注册表变更事件，工作区会清理适配缓存并重新发现当前节点能力，因此第三方扩展无需要求用户重载工作流。普通标量自动进入侧边栏预设；领域值需要自定义序列化时可选实现同步 `readPresetValue()`、`validatePresetValue(entry)` 和 `applyPresetValue(entry)`，三者组成同一 codec，payload 必须可写入工作流 JSON。可安全加入 Dashboard 多目标卡片的控件还必须提供可回滚的同步写入，并显式声明 `linkable: true`；同步写入的 `false`、`{ ok: false }`、Promise 与抛错都必须原样越过 Provider 边界供协调器判定，未知、自定义 DOM、只读输出或缺少完整 preset codec 的控件默认不得参与联动。
- 适配器使用稳定英文 `id` 和显式 `priority`。Dashboard Binding 保存 Adapter ID，重载后不会因新增适配器或优先级变化而漂移到另一实现。
- 已有 `numeric`、`boolean`、`choice`、`text` 使用 ComfyUI 控件族。特殊类型可再用 `registerControlRenderer("comfy", kind, renderer)` 注册渲染器；renderer 只消费 Control Spec / Port，并必须通过 `controlView()` 返回完整的 `root`、`headerAccessories`、匹配 spec 的 `kind`、`update` 和 `destroy`，不得持有工作流状态。渲染器注册或卸载会触发工作区结构刷新，使热加载和第三方扩展卸载不会留下旧控件视图。
- `ResolutionPreset` 与 `PromptSelector` 的侧边栏卡片复用节点自身的状态控制器和完整交互表面；`LoraManager` 优先显式适配其 LoRA 列表 widget，侧边栏以列表项和真实 `active` 状态为控制值，不再把同一节点的文本 widget 作为绑定面。没有列表 widget 的兼容节点仍可保留 LoRA 文本适配。LoRA 列表可由 descriptor 的运行时 `previewResolver` 提供异步预览地址；当前 LoraManager 解析本机 `/lm/loras/preview-url`，侧边栏通过共享 `bindAsyncImagePreview()` 延迟加载、有限 LRU 缓存、悬浮/焦点生命周期和迟到请求淘汰显示状态。预览地址、加载状态和失败状态都不进入节点值或 Dashboard 预设，列表重建/控件销毁会释放预览监听器；没有预览服务时只显示明确的不可用状态，不阻断 LoRA 值绑定。复合控件通过独立 renderer 工厂挂载，预设 codec 仍由节点属性与 Provider 负责。
- LoraManager 的 `lora-list` renderer 是节点列表的侧边栏投影：每项保留 `active`、顺序、模型/CLIP 强度与 `expanded` 状态，支持拖拽/键盘排序、展开独立 CLIP 强度、预览和共享右键菜单。菜单中的 Civitai、备注、触发词、配方操作只通过 LoraManager 已有的本机 `/lm` / `/api/lm` 路由执行；“添加 LoRA”是显式用户操作，只打开 LoraManager 页面，不把外部 URL、预览或临时菜单状态写入节点值或 Dashboard 预设。
- 删除当前侧边栏预设时，纯预设模型优先选择删除位置的后继预设，末尾才选择前一个预设；工作区入口在同一个图事务中应用该快照并删除旧基准。删除最后一个预设则同时写入 `emptyDashboard()` 并清空活动页面，只有确实没有预设时才显示无预设/空画布；删除非当前预设不改变当前工作副本。
- Provider 负责图事务、节点 dirty 和绑定解析；适配器不得直接操作侧边栏 DOM，渲染器不得发现节点。适配器卸载函数应在第三方扩展销毁时调用。
```js
import { registerWidgetControlAdapter } from "/extensions/ComfyUI-Aaalice-Nodes/api.js";

const unregister = registerWidgetControlAdapter({
  id: "vendor-strength",
  priority: 100,
  widgetTypes: "VENDOR_STRENGTH",
  describe: ({ widget }) => ({
    controlId: `strength:${widget.name}`,
    label: widget.label || widget.name,
    kind: "numeric",
    valueType: "number",
    getValue: () => widget.model.value,
    getAvailability: () => ({
      state: widget.model.ready ? "ready" : "unavailable",
      reason: "vendor-loading",
    }),
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
- 动态槽变化由共享提交器原子发布：先更新所属图的公开 slot 数组，再刷新 LiteGraph concrete snapshot，并在节点所属 `graph` 发布官方槽标签事件；布局模块不得直接维护私有 concrete 数组或劫持 `_setConcreteSlots()`。不得恢复隐藏槽数组。
- DOM widget 通过 `getMinHeight()` 声明与当前几何无关的稳定内容下限。Classic 只有内容本身定义最小高度且界面不要求再次缩短时才可走 LiteGraph grow-only 路径；可手动缩放的列表节点使用固定下限和内部滚动。Nodes 2.0 尺寸继续由原生 DOM 测量持有。
- `computeSize()`、`getMinHeight()` 和布局刷新不得读取当前 `node.size`、已拉伸 wrapper 或 `scrollHeight` 后再作为最小值，否则会形成只增不减的尺寸反馈环。
- Classic 的 `LGraphCanvas` 先解析 `getWidgetOnPos()`，再检查 `findResizeDirection()`；底部原生控件即使没有自绘 DOM 也会压缩或吞掉角区。`js/node_resize.js` 只在 `beforeRegisterNodeDef` 对 `SimpleNotify`、`GroupIsEnabled` 与 `SimpleStringSplit` 的精确 `nodeType` 安装 `native_widget_resize.js`，不注册全局实例生命周期、不扫描图、不用名称 fallback，也不修改宿主缩放能力。全尺寸 DOM 节点仍由各自业务入口安装 `dom_widget_resize.js`。
- 两类 `getWidgetOnPos()` 包装都只是纯命中查询：角区返回未命中，其余位置原样委托；查询期间不读取全局指针状态、不切换 DOM、不挂 document 监听器。DOM 失效只在 `onResize` 确认当前节点为宿主 `resizing_node` 后开始，避免其它拖拽经过节点时触发跨节点副作用。
- 固定节点的 `resizable = false` 属于 ComfyUI 宿主契约，缩放支持不覆盖该状态。Nodes 2.0 的四个原生 DOM 手柄同样由宿主拥有；业务层不绘制替代手柄，只保证控件不覆盖命中，并同步真实内容层与布局尺寸。全尺寸 DOM widget 的 wrapper 与业务根默认不接收指针，只让真实控件命中；缩放期间全部 DOM 后代让出事件。
- Provider 可返回非持久的 `layoutProjection`（`rowSpan` / `columnSpan`）描述当前内容占位；Dashboard 使用同一矩形投影算法在页面和组内消解碰撞并重排后续项，但渲染元素的 `data-drop-*` 与工作流中的规范布局仍保留原值。QuickGroupManager 复用该通用投影，按当前可见组数量生成临时高度，不写回持久尺寸；组列表不建立内部滚动，`graphChanged` 不得替换为状态轮询。
- ResolutionPreset 使用固定内容下限、内部坐标板和两个真实原生输出槽；空白画布不接收指针，只有三个控制柄和表单控件命中。
- 节点 DOM 根不覆盖原生背景、外边框或圆角；Classic 使用 LiteGraph `bgcolor`，Nodes 2.0 保留原生容器轮廓。

## 可选依赖与公开边界

- Classic 与 Nodes 2.0 为支持范围；App Mode 暂不支持。
- QuickGroupManager 节点及其 Dashboard 整体控件只修改自身所属 graph，不跨作用域聚合或递归改写其它 Manager 的状态。
- DIY 侧边栏只投影 Subgraph 整体公开的兼容 widget，不遍历或绑定内部节点。
- SimpleNotify 只在发起执行的前端产生提醒，不表示并行分支、整个工作流或队列完成。
- ResolutionPreset 只输出精确宽高；比例与 MP 为只读摘要，不负责图像、Latent、模型推荐、裁剪、缩放或 batch。
