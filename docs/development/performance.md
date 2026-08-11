# 前端性能优化规范

本文档规定本包在高密度 ComfyUI 画布中的性能边界，重点覆盖富 DOM widget、虚拟列表、虚拟瀑布流和 Nodes 2.0。目标是修复本包自身的工作量；不得通过修改 ComfyUI 内核或 monkey patch 其它插件来隐藏问题。

## 1. 归因与边界

- 先区分本包、ComfyUI 前端和其它插件的成本。节点选择、平移或缩放变慢时，至少分别检查本包 DOM 数量、长任务、虚拟连线和后端 CPU；不能把 KJNodes 的 `Show links` 或其它插件绘制归因给本包。
- 本包只能管理自己创建的 DOM、事件监听器、图片请求和虚拟化控制器。ComfyUI 的宿主 widget 必须保持注册和挂载，不能删除宿主持有的 widget、改写核心渲染器或接管图级单槽回调。
- 性能修复不得改变工作流序列化、节点身份、参数稳定 Id、Classic / Nodes 2.0 / Subgraph 兼容行为。状态继续以 `node.properties` 为真源，离屏只暂停派生视图和媒体资源。

## 2. 富 DOM widget

- 富 DOM widget 使用 `addLifecycleDOMWidget()` 同步挂载，并保留稳定的宿主元素；可将插件拥有的条目内容在离开视口后清空，再在返回视口时按持久状态恢复。
- 使用一个以宿主元素为目标的 `IntersectionObserver` 管理可见性，默认用有限 `rootMargin` 预热。禁止用 `setInterval`、持续轮询、每帧全图扫描或每个节点独立扫描文档。
- 可见性切换必须幂等且可销毁。节点移除、工作流重载和挂载失败时，必须断开 observer、取消 frame、释放图片引用并清理浮层和拖拽状态。
- 离屏状态不得继续创建卡片、列表行、缩略图 `src`、hover 详情或预取回调；搜索、分页和持久状态同步仍可继续，但只能更新模型和有界布局数据。
- `content-visibility: auto` 只能作为浏览器渲染降载，与内部虚拟化同时使用；必须提供稳定 `contain-intrinsic-size`，不能用当前 `scrollHeight`、DOM 高度或最后一次拉伸结果反推节点最小尺寸。
- 恢复可见后必须通过同一个 controller 重新绘制，保留滚动位置、选择顺序、焦点保护和当前查询；不能依赖用户手动刷新或重新执行工作流。

## 3. 虚拟列表与虚拟瀑布流

- 虚拟列表只挂载视口加固定 overscan 范围内的行；虚拟瀑布流只挂载可见 placement。布局数组可以保留，但卡片 DOM、事件闭包和媒体 `src` 必须有界。
- controller 必须提供 `setActive(boolean)`。切换为 inactive 时取消待处理 frame，释放已挂载条目和图片引用，同时保留足以计算滚动范围的 spacer；切换回 active 时强制一次完整可见范围绘制。
- `setItems()`、`append()`、尺寸变化和刷新在 inactive 时只能更新布局与模型，不得触发 `renderItem`、`onVisibleItemsChange`、`onNearEnd` 或预取。
- 可见范围变化使用 `requestAnimationFrame` 合并；不得在 `computeSize()`、`getMinHeight()`、`onDrawForeground()` 或 `onDrawBackground()` 中查询 DOM、遍历图或重建数组。
- 滚动帧只做一次可见区间计算与差量挂载；placement 几何不变时不得重写卡片 style 或 spacer 高度。布局对象用 revision 标记真实几何变化（`setItems` / `reflow` / 列数变化），只有 revision 变化才全量同步已挂载卡片的宽高与 transform。
- 可见项与首项索引上报（`onVisibleItemsChange` / `onVisibleIndexChange`）只在可见集合签名变化时触发一次，禁止每个滚动帧重复调用预取入口；预取本身在滚动停止后防抖执行，快速滚动期间不得创建图片下载任务。
- 快速滚动期间新挂载卡片只显示占位（不设置 `img.src`），滚动停止后统一补挂；同时暂停逐卡片 shimmer 动画。滚动帧中的图片请求、解码与无限动画都属于主线程/合成器开销，必须移到滚动停止后。
- 滚动跨页产生的持久状态同步（如页码）必须把图 dirty 信号合并到滚动停止后，禁止在滚动帧内调用 `graph.change()`（新版 litegraph 会强制全部画布前景+背景全量重绘）。
- 卡片级指针动效（倾斜、径向高光）由容器统一委托：单个 `pointermove` / `pointerleave` 监听、单 rAF、每帧至多一次 `getBoundingClientRect`，禁止每张卡片各挂一对监听器；卡片虚拟化卸载后待处理帧必须通过 `isConnected` 自然跳过。
- 删除条目时先调用业务 dispose，再移除媒体源；`destroy()` 必须幂等，且不遗留 `ResizeObserver`、scroll listener、animation frame 或 controller 引用。
- Gallery 的本地内容黑名单在每次列表响应边界一次性规范化为集合，并直接过滤响应已有标签，不得逐帖请求 Detail。过滤后补页只能在响应完成时读取瀑布流已缓存的 `totalHeight`、`scrollTop` 和 `clientHeight`，不得扫描卡片或进入滚动帧；自动补页必须有固定预算，超出后转为用户操作。

## 4. 局部更新与交互

- 节点选中、移动、平移和缩放不应重建无关 widget。值变化使用已挂载控件的定向 `update()`；结构变化才重建列表、槽或布局。
- 文本输入、IME、滚轮、拖拽、Popover 和 Dialog 期间不得整体替换包含交互元素的根 DOM。筛选只更新结果区域，并保留输入元素的 identity、焦点和选区。
- 可见性回调只切换富内容 controller，不修改 `node.properties`，不触发 graph-wide redraw，不同步 KJ Set/Get 名称，也不改变节点尺寸真源。
- Nodes 2.0 的滚轮捕获继续遵守当前 ComfyUI 前端协议：使用 `data-capture-wheel="true"`、`pointerenter` 预先聚焦和外部编辑保护；不得在 wheel 回调中阻止事件或伪造事件。

## 5. Dashboard 与 Subgraph 参数投影

- Dashboard 必须把值域和结构域分开。boolean、numeric、seed、choice、text、taglist 与 image 的预览/提交只通过稳定 Binding Key 通知已挂载 Control View 的 `update()`；不得执行 `renderWorkspace()`、`root.replaceChildren()`、全页 Binding 解析或 Dashboard Preset 全量捕获。
- ComfyUI 自定义 Sidebar 的 render 回调可能因 widgetValueStore 等响应式依赖重复进入。若根仍拥有原工作区树，重复调用必须是 no-op；完整渲染只能由页面、布局、绑定、控件类型、动态选项、可用性、工作流恢复或显式 Host 失效触发。
- Subgraph Provider 解析单个 Binding 时只适配目标 promoted widget。允许按 Node、widget 列表身份、Adapter Revision 和 Control Id 缓存结构索引，但值、availability、options 与 preset payload 必须实时读取；注册/卸载 Adapter、`graphChanged`、工作流恢复和 `CONTROL_HOST_INVALIDATED_EVENT` 必须使相关索引失效。
- 嵌套 promoted widget 的定义 owner 可按宿主与 promoted view identity 缓存，失效边界同上。禁止在每张卡片解析时为同一 view 重复沿最多 100 层 Subgraph 链创建 Set、WeakMap 或扫描兄弟 widgets。
- 连续手势期间若发生真实结构失效，只记录一次待处理完整渲染；手势结束后补一次。值提交本身不得制造待处理结构渲染。
- Dashboard 布局拖拽只允许一个边缘自动滚动 `requestAnimationFrame` 循环；每帧复用当前选区几何与指针位置，更新一个落点预览和实际碰撞链中的有限 DOM，不扫描 graph、不重建 Control View。卡片内部随宽高变化的排布使用 CSS Container Query，禁止为每张卡片新增 `ResizeObserver`、窗口监听或尺寸写回。

## 6. 验收门槛

- 静态检查必须确认所有富 DOM 入口使用生命周期挂载器；虚拟 controller 有 inactive 路径；observer 和 controller 在移除时清理；不存在新增轮询或全局 monkey patch。
- 自动测试覆盖：可见性 entry 判定、active/inactive 往返、inactive 更新不创建条目、图片源释放、controller 销毁幂等，以及 Classic / Nodes 2.0 入口契约。Dashboard 另需锁定值提交不调度完整渲染、重复 Sidebar render 为 no-op、同 Binding 多投影只定向更新一次、单 Binding 解析不重复适配兄弟 widgets、Host 失效后缓存确实重建。
- 浏览器验收使用同一工作流、缩放、窗口尺寸和节点可见范围，对比离屏节点数、DOM 后代数、长任务和选中响应；静态测试通过不能代替真实 FPS 或响应延迟结论。
- 若仍然卡顿，关闭 KJNodes 虚拟连线或其它第三方富 DOM 后分别复测；只有确认成本来自本包，才继续在本包内优化。
