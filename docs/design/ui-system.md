# UI 设计系统

本规范定义 Aaalice 前端界面的共同视觉语言、渲染分层、颜色语义、组件边界和可访问性要求。业务节点的专用布局分别见 [参数系统](parameter-system.md) 和 [QuickGroupManager](quick-group-manager.md)。后端协议、状态真源和生命周期不在本文件定义。

## 1. 设计原则

- **原生节点优先**：节点标题、底色、外轮廓、圆角和真实 socket 由 ComfyUI 原生层负责；扩展不重复绘制一套节点外壳。
- **信息优先**：标题、正文、辅助信息和状态保持稳定层级，装饰不能抢过参数与结果。
- **同色系分层**：内容块和控件通过原生节点色、半透明表面及明暗差建立层级，边框只承担必要轮廓。
- **克制形状**：普通按钮和输入使用小圆角，卡片使用中圆角；胶囊只用于 Badge 和 Switch 轨道。
- **主题原生**：颜色从 ComfyUI token 和当前节点颜色派生，不复制品牌色或只适用于暗色主题的固定值。
- **状态可辨**：错误、禁用、隐藏、选中和混合状态不能只依赖颜色，还要有位置、图标、文字或形态差异。
- **双模式同义**：Classic 与 Nodes 2.0 可以由不同渲染层实现，但信息、交互、颜色语义和尺寸结果必须一致。

## 2. 节点渲染分层

| 层级 | 负责内容 | 不应负责 |
|---|---|---|
| ComfyUI native / Canvas | 节点标题、背景、外边框、圆角、选中框、真实 socket 和连线 | DOM 控件的焦点、aria 和复杂输入 |
| 节点 DOM overlay | 输入、按钮、Switcher、列表、tooltip、键盘和 aria | 覆盖整块节点背景、复制外轮廓或绘制伪 socket |
| Dialog / Popover | 独立编辑、筛选、确认和错误反馈 | 继承节点透明底层导致内容不可读 |

- 节点 DOM 根层必须透明，不绘制重复背景、边框、阴影或外圆角；条目和控件可以使用半透明局部表面。
- Classic 不用固定菜单色覆盖 LiteGraph 的 `bgcolor`。Nodes 2.0 不强制重写原生节点容器或标题容器的顶部圆角。
- 内容需要分区时只绘制内部卡片、gutter 或分隔线，不再包一圈与节点边缘重合的外框。
- Dialog 与 Popover 使用不透明主题表面，保证离开节点背景后仍可读。

## 3. 颜色 token

共享 token 与无业务组件样式定义在 `js/lib/ui.css`；节点专用映射和布局定义在 `js/lib/theme.css`。两者先映射 ComfyUI token，再提供中性 fallback。

| 语义 | Aaalice token | 来源或规则 |
|---|---|---|
| 正文 | `--aa-ui-text` | `--fg-color` / `--p-text-color` |
| 辅助文字 | `--aa-ui-muted` | `--descrip-text` / `--p-text-muted-color` |
| 页面画布 | `--aa-ui-canvas` | `--comfy-menu-bg` |
| 内容表面 | `--aa-ui-surface` | `--comfy-menu-secondary-bg` / `--p-content-background` |
| 输入控件 | `--aa-ui-control` | `--comfy-input-bg` / `--p-form-field-background` |
| 边框 | `--aa-ui-border` | `--border-color` / `--p-content-border-color` |
| 主题强调 | `--aa-ui-accent` | `--p-primary-color` / `--primary-color` |
| 媒体前景 | `--aa-ui-on-media` | `--p-surface-0`；用于图片上的浅色图标或文字 |
| 节点原色 | `--aa-ui-node-color` | 当前节点 `color`；无自定义颜色时回退主题强调色 |
| 节点强调 | `--aa-ui-node-accent` | 节点原色向当前主题正文色自适应混合 |
| 节点柔色 | `--aa-ui-node-accent-soft` | 节点强调色的低透明度表面 |
| 节点对比色 | `--aa-ui-node-accent-contrast` | 节点强调色上的控件对比色 |
| 警告 | `--aa-ui-warning` | `--warning-text` / `--p-amber-400` |
| 危险 | `--aa-ui-danger` | `--error-text` / `--p-red-400` |

派生层级使用 `color-mix()`。禁止写死品牌色、固定渐变或只适用于一种主题的正文色。

## 4. 节点颜色驱动规则

节点颜色到 CSS token 必须由单一共享同步层负责。业务节点只绑定自己的 DOM 根，不分别计算颜色，也不轮询节点状态；具体模块和生命周期见 [架构](../development/architecture.md#节点强调色)。

- 颜色来源优先使用用户当前选择的 `node.color`，必要时回退 `node.bgcolor`；未设置节点色时使用 ComfyUI 主题强调色。
- 节点强调色由节点原色向主题正文色混合，使暗色节点上的控件适度提亮，并在亮色主题中自然反向。
- 用户改色、清除颜色、创建和加载节点后，控件颜色必须即时或在同一渲染周期内同步。
- 普通选中态、滑条进度和滑块、布尔开关开启态、联动标记及普通焦点反馈使用节点强调色。
- 关闭态、未选择态和剩余轨道保持中性，不能把整个节点所有控件染成同一种颜色。
- 警告、危险、成功、混合状态、实际颜色筛选，以及具有独立业务含义的多档 Switcher 保留各自语义色，不能被节点色覆盖。
- 颜色不能成为唯一状态信号；开关位置、Switcher 文案、图标、aria 状态和禁用形态必须继续存在。

## 5. 控件状态映射

| 控件或状态 | 常态 | 激活或选中 | 例外 |
|---|---|---|---|
| Slider | 中性剩余轨道 | 节点强调色进度和滑块 | 错误范围使用危险语义 |
| Boolean Switch | 中性轨道和弱化滑块 | 节点柔色底、节点强调色滑块 | Mixed 使用警告色 |
| 普通选择 / Focus | 主题输入表面 | 节点强调色边框或焦点环 | Danger 操作使用危险色 |
| 多档 Switcher | 中性底面 | 当前档位自己的主题语义色 | 不统一替换为节点色 |
| 颜色过滤 | 中性图标 | 当前实际筛选颜色 | 多颜色需保留可理解的组合状态 |
| Linkage / Badge | 中性图标 | 节点强调色标记 | 错误和缺失目标使用警告或危险语义 |

## 6. 尺度、文字与密度

- 间距以 4px 为基准，常用值为 2、4、6、8、10、12、16、20、24px；节点条目优先使用紧凑档位。
- 按钮与输入圆角约 6–8px，卡片约 8–10px，弹窗约 14px。
- 节点正文以 11–13px 为主；字段标签和辅助信息保持层级，不使用过重字重。
- 交互目标通常不小于 32px；受原生标题栏高度限制的紧凑按钮必须仍有明确命中区和 aria 名称。
- 同级条目使用小间距聚合，节点底部只保留必要收口空间，不能用大块空白代替布局。
- 动效控制在约 140–180ms，并在 `prefers-reduced-motion: reduce` 下关闭。

## 7. 共享组件边界

`js/lib/ui.js` 是无业务状态的 DOM 基础组件层；`js/lib/workspace_components.js` 是工作区复合组件层。两层都只接收数据、已本地化字符串和回调，不导入 `t()`，不读写工作流或词库状态。业务入口负责状态、生命周期与画布事务。

| 组件 | 职责 |
|---|---|
| `el()` | 安全创建 DOM，普通文本使用 `textContent` |
| `icon()` | 渲染内置 SVG；独立图标必须有可访问名称 |
| `button()` / `iconButton()` | 统一按钮视觉、状态、aria-label 和 tooltip |
| `field()` | 字段标签、提示、控件与错误信息 |
| `badge()` | 类型或短元数据，不单独承担关键状态 |
| `emptyState()` | 解释空状态原因和下一步 |
| `createDialog()` | 统一 Escape、背景关闭、焦点圈定与恢复 |
| `segmentedControl()` | 2–4 个平级互斥模式、稳定 thumb、radiogroup 与方向键 |
| `toggleSwitch()` | 单一布尔设置、disabled 和 aria 状态 |
| `selectControl()` | 单选下拉、统一右侧安全间距、展开状态、旋转箭头、键盘与 ARIA |
| `createAnchoredPopover()` | 锚定按钮的非模态浮层、外部关闭、焦点圈定与恢复 |
| `createTooltip()` | 统一内容提示；通过 `contentMode` 支持 `auto`、`text`、安全 CommonMark/GFM `markdown` 和 `dom`。默认使用非交互 Tooltip；`interactive` 模式提供可悬停、可聚焦链接的非模态悬浮卡片，并管理延迟关闭、Escape、焦点返回和 ARIA 关系 |

Tooltip 使用接近实色的主题表面、单层边框、克制的分层投影和内侧高光，并用跟随实际锚点的小箭头建立空间关系；业务内容不得在 Tooltip 内重复套无语义的卡片表面。
Markdown 使用随插件固定版本的 `marked` 解析，并由 `DOMPurify` 按 Tooltip HTML 白名单净化；支持 CommonMark 与 GFM 的标题、列表、引用、分割线、表格、任务列表、删除线、代码、图片和链接等语法。链接与图片资源只允许 HTTP(S) 协议；含链接的提示必须使用 `interactive` 模式，鼠标从锚点移入浮层时不能消失。

信息型 Tooltip 默认使用非交互模式，由共享组件统一设置鼠标穿透；图片预览和只读详情不得在业务 CSS 中重复覆盖 `pointer-events`。只有确实包含链接、按钮或可选文本的内容才显式使用 `interactive` 模式，并由共享组件统一开启命中与焦点管理。

### 7.1 复合组件

| 组件 | 职责 |
|---|---|
| `createWorkspaceShell()` | 工作区切换、当前主题和内容挂载边界 |
| `createWorkspaceToolbar()` | 紧凑同排操作及可访问标签 |
| `createCollapsibleSearch()` | 侧栏内同排展开的搜索入口、输入和关闭 |
| `createPageTabs()` / `createSectionCard()` / `createControlCard()` | Dashboard 页面、分区和参数投影的纯视图 |
| `createTransferHero()` / `createTransferStats()` / `createTransferSection()` / `createTransferResult()` | 导入导出的文件摘要、预检统计、冲突区和结果反馈 |

业务模块可以增加布局 class 和语义色映射，但不得复制基础组件或让共享层持有工作流状态。依赖连续动画的 thumb 必须保留 DOM identity，只更新 class、data、ARIA 和 transform。

### 7.2 交互契约

- 两档及以上互斥状态优先使用 `segmentedControl()`。滑动指示器保持同一 DOM 元素，通过 transform 在约 140–180ms 内移动；不同业务状态可使用不同主题语义色，同时保留文字、图标和 `radiogroup` 状态。
- 单选下拉优先使用 `selectControl()`。箭头与右边缘保留安全间距，展开时旋转 180°；选择、失焦、`Escape` 或收起后复位，并同步 `aria-expanded`。
- 窄侧栏和节点中的次级搜索优先使用折叠入口。展开后搜索框占用原工具栏同一行，不新增一行或推动内容区；空间不足时可暂时隐藏同排次要操作。展开后自动聚焦，`Escape`、关闭或退出搜索时收起并清除不可见筛选。
- 输入、筛选和局部状态变化只更新受影响内容，不重建仍有效的输入、Dialog、Popover 或焦点锚点。
- 上述动效均在 `prefers-reduced-motion: reduce` 下关闭。

## 8. 状态、反馈与可访问性

- Hover 只轻微提亮表面；focus 必须清晰且不被 overflow 裁切；active 反馈短而明确。
- Disabled 降低透明度并禁止交互；隐藏态使用透明度、虚线或图标，不能伪装成 disabled。
- Danger 只用于破坏性动作和真实错误；保存、加载或渲染错误必须显式展示。
- 纯图标按钮必须有本地化可访问名称；表单错误必须与对应字段建立视觉和语义联系。
- 文本与关键图形应保持足够对比；无法仅从颜色保证时，增加边框、位置、图标或文字。

## 9. Classic / Nodes 2.0 验收

- 两种模式下节点原生背景、外轮廓和顶部圆角连续，没有第二圈方框或错位边缘。
- 用户改节点颜色后，普通控件强调色即时更新；清除节点颜色后回退主题强调色。
- 暗色和亮色主题下，滑条、开关、文字、边框、焦点和语义色均可辨。
- DOM overlay 不遮挡节点拖拽、首次放置、原生缩放角、socket 或连线命中。
- 内容最小高度来自真实条目和控件，不重复叠加标题、slot 栈或 DOM widget 占位。

## 10. 禁止事项

- 不覆盖节点整块原生背景，不复制节点外边框或顶部圆角。
- 不用 CSS 圆点模拟 ComfyUI socket。
- 不把警告、危险、颜色筛选或多档业务状态统一改成节点色。
- 不用持续轮询同步颜色、尺寸或状态。
- 不为视觉效果改变工作流 schema、参数 payload、状态真源或执行生命周期。
