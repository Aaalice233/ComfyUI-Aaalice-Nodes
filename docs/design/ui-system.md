# UI 设计系统

本规范定义 Aaalice 前端界面的共同视觉语言、组件边界和可访问性要求。ParameterPanel 与 Operation Panel 的专用规则分别见 [ParameterPanel](parameter-panel.md) 和 [Operation Panel](operation-panel.md)。

## 设计原则

- **信息优先**：标题、正文、辅助信息和状态必须有稳定层级，装饰不能抢过参数与结果。
- **同色系分层**：画布、表面和输入区使用主题色派生的明暗差区分；边框只承担必要轮廓。
- **适度模块化**：卡片表达一项完整任务或一组紧密内容，不为每个字段制造独立卡片。
- **克制形状**：普通按钮和输入使用小圆角，卡片与弹窗使用中圆角；胶囊只用于 Badge、Switch 轨道和轮播圆点展开态。
- **主题原生**：颜色跟随 ComfyUI token，不复制外部品牌色、字体、插画或固定暗色方案。
- **状态可辨**：错误、禁用、隐藏和选中不能只依赖颜色。

## Token

基础 token 定义在 `js/lib/ui.css`。先映射 ComfyUI token，再提供中性 fallback。

| 语义 | Aaalice token | ComfyUI 来源 |
|---|---|---|
| 正文 | `--aa-ui-text` | `--fg-color` / `--p-text-color` |
| 辅助文字 | `--aa-ui-muted` | `--descrip-text` / `--p-text-muted-color` |
| 页面画布 | `--aa-ui-canvas` | `--comfy-menu-bg` |
| 内容表面 | `--aa-ui-surface` | `--comfy-menu-secondary-bg` / `--p-content-background` |
| 输入控件 | `--aa-ui-control` | `--comfy-input-bg` / `--p-form-field-background` |
| 边框 | `--aa-ui-border` | `--border-color` / `--p-content-border-color` |
| 强调 | `--aa-ui-accent` | `--p-primary-color` / `--primary-color` |
| 危险 | `--aa-ui-danger` | `--error-text` / `--p-red-400` |
| 焦点环 | `--aa-ui-focus` | 主题强调色的半透明混合 |

派生层级使用 `color-mix()`。禁止写死品牌紫色、固定渐变或只适用于暗色主题的正文颜色。

## 尺度与文字

- 间距以 4px 为基准，常用值为 6、8、10、12、16、20、24px。
- 按钮与输入圆角约 6px，卡片约 10px，弹窗约 14px。
- 正文以 13px、`1.45–1.6` 行高为基准；字段标签 12px，辅助信息 10–11px，弹窗标题 15px。
- 交互目标至少 32px 高；主要动作和移动环境中的目标优先达到 40px。
- Badge 至少 22px 高并保留水平内边距，不能缩成难以阅读或点击的微型文字。
- 动效控制在约 140ms，并在 `prefers-reduced-motion: reduce` 下关闭。

## 基础组件

`js/lib/ui.js` 是无业务状态的 DOM 组件层。组件接收已本地化字符串，不导入 `t()`，不读写工作流状态。

| 组件 | 职责 |
|---|---|
| `el()` | 安全创建 DOM，普通文本使用 `textContent` |
| `icon()` | 渲染内置 SVG；独立图标必须有可访问名称 |
| `button()` | primary / secondary / ghost / danger 文本或图文按钮 |
| `iconButton()` | 带本地化 `label`、aria-label 和 tooltip 的紧凑按钮 |
| `field()` | 字段标签、提示、控件与错误信息 |
| `badge()` | 类型或短元数据，不单独承担关键状态 |
| `emptyState()` | 解释空状态原因和下一步 |
| `contextMenu()` | 统一上下文菜单的焦点、关闭和键盘行为 |
| `createDialog()` | 统一 Escape、背景关闭、焦点圈定与恢复 |

业务模块可以增加布局 class，但不得重复实现这些基础视觉和交互语义。业务卡片、页面导航和轮播属于各自模块，不下沉为无差别通用组件。

## 状态与反馈

- Hover 只轻微提亮表面；focus 必须显示主题焦点环；active 反馈短而明确。
- Disabled 降低透明度并禁止交互；隐藏态使用透明度、虚线或图标，不能伪装成 disabled。
- Danger 只用于破坏性动作和真实错误。
- 保存、加载、渲染或 adapter 错误必须显式展示，不用静默降级制造成功。
- 纯图标按钮必须有本地化可访问名称；表单错误必须与对应字段建立视觉和语义联系。

## 禁止事项

- 不复制外部产品的 logo、插画、字体或营销文案。
- 不为“现代感”把普通按钮、页面导航或整排工具做成胶囊。
- 不用 CSS 圆点模拟 ComfyUI socket。
- 不为视觉效果改变工作流 schema、参数 payload 或生命周期。
