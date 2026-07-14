# Herdi-inspired UI 设计规范

本规范用于 ComfyUI-Aaalice-Nodes 的参数编辑器、侧栏、弹窗及后续 DOM 界面。视觉参考来自 [Herdi Landing Page](https://www.herdi.ng/lp)，只借鉴其信息层级、空间节奏和模块化表达，不复制品牌资产、字体或固定色板。

## 设计语言

- **同色系分层**：使用相近背景色区分画布、页面、卡片和控件，边框只承担必要的轮廓提示。
- **模块化卡片**：一个卡片表达一个完整任务或一组紧密相关的字段；避免把整页切成大量没有语义的小框。
- **克制圆角**：控件使用小圆角，卡片和弹窗使用中圆角，胶囊形只用于按钮、标签和 tabs。
- **清晰的文字层级**：标题高对比，正文保持可读，辅助文案降低权重但不能低到难以辨认。
- **响应式密度**：参数编辑器在宽屏舒展；侧栏在窄容器中紧凑；全屏使用自适应 Bento 栅格。
- **焦点属于内容**：高饱和色只来自主题强调色或图片预览。通用控件禁止使用装饰性渐变抢夺注意力。

## Token 映射

组件基础 token 定义在 `js/lib/ui.css`，必须先映射 ComfyUI token，再提供中性 fallback。

| 语义 | Aaalice token | ComfyUI 来源 |
|---|---|---|
| 正文 | `--aa-ui-text` | `--fg-color` / `--p-text-color` |
| 辅助文字 | `--aa-ui-muted` | `--descrip-text` / `--p-text-muted-color` |
| 页面画布 | `--aa-ui-canvas` | `--comfy-menu-bg` |
| 卡片表面 | `--aa-ui-surface` | `--comfy-menu-secondary-bg` / `--p-content-background` |
| 输入控件 | `--aa-ui-control` | `--comfy-input-bg` / `--p-form-field-background` |
| 边框 | `--aa-ui-border` | `--border-color` / `--p-content-border-color` |
| 强调色 | `--aa-ui-accent` | `--p-primary-color` / `--primary-color` |
| 危险色 | `--aa-ui-danger` | `--error-text` / `--p-red-400` |

禁止直接写死品牌紫色、Herdi 暖灰或只适用于暗色主题的正文颜色。派生层级使用 `color-mix()`，焦点环使用主题强调色的半透明混合。

## 尺度与状态

- 间距以 4px 为基准，常用间距为 6、8、10、12、16、20、24px。
- 圆角分为 `6px` 控件、`10px` 卡片、`14px` 弹窗/分区；胶囊组件使用 `999px`。
- 正文默认 13px，字段标签 12px，辅助信息 10–11px，弹窗标题 15px。
- Hover 只轻微提高表面亮度或抬升 1px；focus 必须显示强调色焦点环；disabled 降低透明度且不可点击。
- Danger 仅用于破坏性动作和真实错误；隐藏状态使用透明度与虚线边框，不能伪装成禁用。
- 动效控制在 140ms 左右，并在 `prefers-reduced-motion: reduce` 下关闭。

## 组件库

`js/lib/ui.js` 是节点包内部组件 API。组件只接收已经本地化的字符串，不导入 `t()`，不读写业务状态。

| 组件 | 用途 | 关键要求 |
|---|---|---|
| `el()` | 安全创建 DOM | 文本使用 `textContent`，不拼接不可信 HTML |
| `icon()` | 内置 SVG 图标 | 装饰图标隐藏于辅助技术；独立图标必须有名称 |
| `button()` | 文本或图文按钮 | variant 为 primary / secondary / ghost / danger |
| `iconButton()` | 紧凑操作 | 必须传入本地化 `label`，同时作为 aria-label 与 tooltip |
| `field()` | 字段标签、提示、错误 | 支持 stacked / inline；错误显式展示 |
| `badge()` | 类型和短元数据 | 不用颜色单独表达关键状态 |
| `card()` | 一组完整内容 | header / body / footer 各自有明确语义 |
| `tabs()` | 同级页面切换 | 自动设置 tablist、tab、aria-selected |
| `sectionHeader()` | 分区标题与操作 | 操作保持少量、同级且可访问 |
| `emptyState()` | 无内容状态 | 解释原因或下一步，不伪造成功 |
| `createDialog()` | 模态任务 | Escape、背景关闭、焦点圈定与关闭后恢复由组件统一处理 |

```javascript
import { badge, button, card, field } from "./lib/ui.js";

const name = document.createElement("input");
const save = button({ label: t("aaalice.common.save", "Save") });
const panel = card({
  title: t("aaalice.pcp.editor.general", "General"),
  meta: badge("slider", { tone: "accent" }),
  body: field({ label: t("aaalice.pcp.field.name", "Name"), control: name }),
});
```

业务页面可增加自己的布局 class，但不得重新实现按钮、字段、卡片、tabs、空状态或 dialog 的基础视觉与可访问行为。

## 页面模式

### ParameterPanel 编辑器

- 宽屏保持参数列表 + inspector 双栏；窄屏改为上下布局。
- 左栏只负责参数身份、选择、重排、复制、删除与新增。
- inspector 按“基础信息、取值规则、选项与行为”分组，仅显示当前类型适用的分组。
- footer 固定承载校验状态、取消和保存；草稿、断线确认与原子保存语义不得改变。

### Operation Panel

- 结构固定为页面 → 分区 → 卡片；侧栏不创建、删除或连线工作流节点。
- 窄侧栏中的字段允许上下堆叠，全屏卡片恢复 label/control 双列。
- 全屏使用自适应卡片栅格，并继续尊重用户设置的 row / col。
- Layout 模式必须显式提示其作用范围；隐藏、错误、禁用、选中四种状态需要视觉可区分。

## 禁止事项

- 禁止复制 Herdi logo、插画、字体或营销文案。
- 禁止在通用控件上使用固定渐变、固定品牌色或低对比正文。
- 禁止纯图标按钮缺少本地化可访问名称。
- 禁止新页面绕过组件库重复实现 modal、button、field 或 card。
- 禁止为了视觉效果改变 ParameterPanel payload、Operation Panel workflow schema 或双模式挂载生命周期。
