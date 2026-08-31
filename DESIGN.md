---
name: ComfyUI-Aaalice-Nodes
description: 与 ComfyUI 原生体验一致的精密创作工作台
colors:
  text: "var(--fg-color, var(--p-text-color, #e5e7eb))"
  muted: "var(--descrip-text, var(--p-text-muted-color, #9ca3af))"
  canvas-depth: "var(--comfy-menu-bg, var(--p-surface-950, #111))"
  work-surface: "var(--comfy-menu-secondary-bg, var(--p-content-background, #222))"
  raised-surface: "color-mix(in srgb, var(--aa-ui-surface) 88%, var(--aa-ui-text))"
  control-surface: "var(--comfy-input-bg, var(--p-form-field-background, #18181b))"
  field-surface: "color-mix(in srgb, var(--aa-ui-control) 88%, var(--aa-ui-canvas))"
  soft-edge: "color-mix(in srgb, var(--border-color, var(--p-content-border-color, #444)) 60%, transparent)"
  host-accent: "var(--p-primary-color, var(--primary-color, #0b8ce9))"
  accent-wash: "color-mix(in srgb, var(--aa-ui-accent) 13%, transparent)"
  accent-contrast: "var(--p-primary-contrast-color, #fff)"
  media-foreground: "var(--p-surface-0, #fff)"
  danger: "var(--error-text, var(--p-red-400, #d66d75))"
  warning: "var(--warning-text, var(--p-amber-400, #d6a84f))"
  success: "var(--success-text, var(--p-green-400, #6fbf73))"
  library-identity: "var(--p-purple-400, var(--aa-ui-warning))"
  group-identity: "var(--p-cyan-400, var(--aa-ui-accent))"
typography:
  headline:
    fontFamily: "var(--comfy-font, Inter, system-ui, sans-serif)"
    fontSize: "18px"
    fontWeight: "740"
    lineHeight: "1.25"
    letterSpacing: "-0.018em"
  title:
    fontFamily: "var(--comfy-font, Inter, system-ui, sans-serif)"
    fontSize: "15px"
    fontWeight: "720"
    lineHeight: "1.35"
  body:
    fontFamily: "var(--comfy-font, Inter, system-ui, sans-serif)"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.45"
  label:
    fontFamily: "var(--comfy-font, Inter, system-ui, sans-serif)"
    fontSize: "11px"
    fontWeight: "650"
    lineHeight: "1.35"
  meta:
    fontFamily: "var(--comfy-font, Inter, system-ui, sans-serif)"
    fontSize: "10px"
    fontWeight: "500"
    lineHeight: "1.4"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Cascadia Mono, Consolas, monospace"
    fontSize: "10px"
    fontWeight: "650"
    lineHeight: "1.4"
rounded:
  shared-sm: "6px"
  control: "8px"
  shared-md: "10px"
  shared-lg: "14px"
  pill: "999px"
spacing:
  hair: "2px"
  compact: "4px"
  control: "6px"
  snug: "8px"
  standard: "10px"
  section: "12px"
  panel: "16px"
  dialog: "18px"
  overlay: "24px"
components:
  button-primary:
    backgroundColor: "{colors.host-accent}"
    textColor: "{colors.accent-contrast}"
    typography: "{typography.label}"
    rounded: "{rounded.shared-sm}"
    padding: "6px 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.control-surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.shared-sm}"
    padding: "6px 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.shared-sm}"
    padding: "6px 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.field-surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "36px"
  badge:
    backgroundColor: "{colors.control-surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
    height: "22px"
  dialog:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.shared-lg}"
    padding: "16px 18px 20px"
---

# Design System: ComfyUI-Aaalice-Nodes

## Overview

**Creative North Star: "主题光晕下的精密工作台"**

界面像嵌入 ComfyUI 的一张精密创作工作台：宿主主题决定基础材质，节点或领域强调色像局部工作灯，只照亮当前对象、状态与操作。它紧凑、精确、有触感、克制但不单调；品牌感来自可靠的层级、恰到好处的色彩身份和短促反馈，而不是另造一套脱离 ComfyUI 的外壳。

工作台以信息密度服务操作效率，但不会用更小的文字、更多的线或同时展开更多区域换取容量。表面、空间聚合、圆角轮廓和柔和边缘阴影共同建立结构；焦点、选择、危险和业务分级拥有不同且可辨的语义。

**Key Characteristics:**

- 宿主主题驱动，明暗主题与节点强调色自然继承
- 紧凑的参数密度，清晰的主次行动和稳定几何
- 半透明工作表面、柔和边缘阴影与局部状态光晕
- English、简体中文、繁体中文下保持同一信息层级
- Classic、Nodes 2.0 与 Subgraph 共享同一视觉语言

## Colors

颜色系统以宿主主题为底，以一个当前强调色建立操作焦点，再用领域身份色和状态色帮助扫读；颜色始终是结构和语义，不是装饰。

### Primary

- **宿主强调色（Host Accent）：** 当前 ComfyUI 主题或节点强调色，服务唯一主操作、焦点、当前选择和必要的局部光晕。
- **强调浅洗（Accent Wash）：** 用于选中表面、悬停反馈和低强度身份提示，不形成大面积实心色块。

### Secondary

- **Library 身份紫（Library Identity）：** 标识 Prompt Library 工作区及其当前上下文。
- **Groups 身份青（Group Identity）：** 标识 Dashboard 与 Group 导航上下文。

### Tertiary

- **成功、警告、危险：** 仅表达对应状态；Gallery 来源、Rating、标签类别和 Dashboard 控件类型使用各自稳定的领域色映射。

### Neutral

- **深层画布（Canvas Depth）：** 最深的宿主背景和内容后方空间。
- **工作表面（Work Surface）：** Dialog、Popover 与业务容器的主表面。
- **抬升表面（Raised Surface）：** Hover、聚焦或需要从同层表面浮出的对象。
- **控件表面（Control Surface）：** 字段、分段控件、紧凑卡片和内部轨道。
- **正文 / 弱化文字（Text / Muted）：** 正文保证可读，辅助信息后退但不低于可访问性底线。
- **媒体前景（Media Foreground）：** 深色或品牌色实心媒体表面的浅色图标与标记。

### Named Rules

**The Host Theme Rule.** 基础文字、表面、控件和强调色必须从 ComfyUI token 解析；fallback 只保证未挂载环境可读，不能成为第二主题。

**The One Spotlight Rule.** 一个独立任务区原则上只有一个实心强调色主操作；其余导航、刷新、设置和取消使用低强度表面。

**The Semantic Color Rule.** 身份色、状态色、类别色和元数据色各司其职；颜色不是唯一信号，也不能互相借用。

## Typography

**Display Font:** 不单设展示字体；页面标题沿用宿主字体。
**Body Font:** `var(--comfy-font, Inter, system-ui, sans-serif)`
**Label/Mono Font:** 宿主字体用于标签；`ui-monospace` 栈用于快捷键、路径、短 ID 与精确读数。

**Character:** 字体系统紧凑、清晰、数字稳定。层级主要通过字重、有限字号阶梯和空间组织建立，不使用宣传式大标题或弱化副标题制造重复层级。

### Hierarchy

- **Headline**（740，18px，1.25）：Dashboard 当前页面等最高层级操作上下文。
- **Title**（720，15px，1.35）：Dialog 标题和局部主标题。
- **Body**（400，13px，1.45）：说明、表单内容和一般交互文字。
- **Label**（650，11px，1.35）：按钮、字段、导航和列表主标签。
- **Meta**（500，10px，1.4）：计数、来源、时间和次级状态；空间不足时先隐藏信息，不继续缩小。
- **Mono**（650，10px，1.4）：快捷键、路径、数值和技术身份。

### Named Rules

**The Ten Pixel Floor.** 用户可见文字不得低于 10px；按钮、输入、导航、列表主标签和表单标签原则上不低于 11px。

**The One Title Rule.** 每个区域只保留一个可独立理解的主标题或标签，不在其下堆叠同义副标题。

## Layout

主布局使用 Flex 与 Grid，并以 `minmax(0, 1fr)`、`min-height: 0` 和明确的滚动表面维持复杂内容的可收缩链。Dashboard 使用 12 列整数跨度几何；常见控件以 4px 节奏组织，并用更细的 2px 间隔处理紧凑图标组或列表状态。

响应优先跟随组件实际容器而非只看 viewport。卡片和节点在窄宽度下按“详情行 → 辅助文案 → 图标徽章”的顺序收敛；Gallery 与复杂设置在小窗口下由多列转为单列，工具栏将明确的工具操作收敛为带 Tooltip 的图标按钮。

Classic 由 LiteGraph 原生层负责节点外壳、标题、socket 和尺寸，DOM 只承载交互内容；Nodes 2.0 由 Vue 节点表面和真实内容层拥有尺寸。两种模式可以有不同实现，但信息层级、可见尺寸、状态语义和交互反馈必须一致。

**The One Scroll Surface Rule.** 页面内容区承担主要纵向滚动；局部滚动必须有稳定高度和完整的可收缩父链，不能形成多个互相竞争的完整表单滚动区。

**The Container Owns Response Rule.** 控件根据自身可用宽高收敛，不假设理想节点尺寸，也不通过延迟测量或重复重建制造适配。

## Elevation & Depth

系统采用分层式深度：半透明或混合表面定义材质，柔和外阴影分离浮层，内阴影塑造字段和轨道，强调色光晕只在焦点、选择和活跃状态出现。阴影同时承担结构和交互反馈；静态节点外壳仍由宿主负责，不由 DOM 重画。

### Shadow Vocabulary

- **Soft Edge：** 低层卡片、徽章和静态容器使用双层柔和投影，建立轻微触感。
- **Working Edge：** Hover、Popover 与需要独立于相邻表面的对象使用更深的双层边缘阴影。
- **Inset Well：** 输入、分段轨道和 Toggle 轨道使用内阴影，表现可操作凹面。
- **Active Glow：** 当前强调色混入工作阴影，表达焦点、选择或激活，而不依赖彩色边框。
- **Dialog Depth：** Backdrop 模糊、工作边缘和深层投影共同建立最高层级。

### Named Rules

**The Edge, Not Line Rule.** 普通区域不依赖连续细分割线或密集 1px 边框建立层级；优先用表面、间距和边缘阴影。

**The Stable Geometry Rule.** Hover、Focus 和 Active 不改变组件占位；透明边框可保留几何，但可见反馈由表面和深度承担。

## Shapes

形态从紧凑控件到高层浮层逐级放松：按钮使用轻微圆角，字段和卡片使用中等圆角，Dialog 使用更完整的圆角；Switch、计数与短状态使用胶囊或圆形。图标保持轻量线性轮廓，只有官方 Discord 标志等必要品牌图形使用填充。

媒体预览允许更紧的裁切圆角，操作命中面不得因视觉缩小而变得难点。DOM 根不复制节点外壳，不覆盖宿主标题圆角；状态变化也不通过扩大轮廓制造布局抖动。

**The Radius Hierarchy Rule.** 控件、容器和浮层按 6px、8–10px、14px 逐级组织；999px 只用于 Switch、圆点和真正的短胶囊。

## Components

### Buttons

按钮精密且有触感，层级先于装饰。

- **Shape:** 轻微圆角（6px），标准高度 32px；图标按钮通常为 30px 方形命中面。
- **Primary:** 宿主强调色实心表面，只用于当前区域唯一主操作。
- **Secondary:** 控件表面与柔和边缘阴影，用于同级次要操作。
- **Ghost / Utility:** 透明或低强度表面，服务刷新、设置、导航、关闭等高频工具动作。
- **Danger:** 危险色 tonal 表面，只有破坏性动作使用。
- **Hover / Focus:** Hover 可上移 1px；Focus 使用明确强调光环；Disabled 保持可辨但不响应位移。

### Inputs / Fields

- **Style:** 轻微凹入的混合控件表面、8px 圆角、稳定内边距和宿主字体。
- **Hover:** 表面略抬升，保持几何不变。
- **Focus:** 工作边缘与柔和强调光环共同出现，caret 跟随强调色。
- **Error / Disabled:** 错误使用危险色和就近说明；禁用降低不透明度并保留可读标签。

### Segmented Controls

- 单一 Thumb 在稳定轨道中平移，Active 由浅洗表面和较高字重表达。
- 极窄空间可只保留当前项文字，其余项保持可理解图标和键盘导航。
- 不以重建选项或切换整体布局表现状态变化。

### Switches & Checkboxes

- Toggle 为紧凑胶囊轨道与圆形 Thumb，Active 使用强调色轨道和短促弹性位移。
- Checkbox 使用 18px 方形凹面；选中后图标淡入并缩放到位。
- 两者都有明确 Focus、Disabled 和 ARIA 状态，颜色不是唯一反馈。

### Chips

- **Style:** 独立、可命中的 tonal 胶囊；数字 Badge 使用轻阴影而非描边。
- **State:** 来源、Rating、类别和元数据使用各自语义色，背景低饱和，文字与边缘同源。
- **Behavior:** 标签保留类别结构和单项操作，不退化成逗号文本。

### Cards / Containers

- **Corner Style:** 控件卡片通常为 8–10px；媒体卡片允许更紧裁切。
- **Background:** 工作表面与控件表面的低强度混合。
- **Shadow Strategy:** 默认 Soft Edge，Hover 或 Focus 升为 Active Glow。
- **Internal Padding:** 常用 7–10px，按真实内容密度调整。
- **State:** 选中、缺失、混合和错误同时通过表面、图标/文案或结构标记表达。

### Dialogs, Popovers & Context Menus

- Dialog 使用 14px 圆角、固定 Header/Footer 和唯一可滚动 Body；尺寸档位只决定最大工作宽度。
- Popover 与 Context Menu 紧贴锚点，使用抬升表面、深层边缘和 9–11px 圆角。
- 后打开的确认、编辑和帮助层进入同一浮层栈；锚点失效时立即清理。

### Workspace Page Rail

- Dashboard 右侧保留固定 38px 圆点列，不覆盖内容滚动面。
- Hover 或键盘 Focus 时向内容外侧展开页面名称；Active 胶囊使用强调浅洗、边缘光晕和完整标签。
- 页面切换只由点击和键盘触发，滚轮不承担导航。

### Gallery Cards

- 媒体为主角；默认投影克制，Hover 可轻微浮起、倾斜并显露操作。
- 选择同时使用印章、表面变化和状态反馈，不只依赖彩色描边。
- Source、Rating、Category 和 Meta 分层着色，长内容保持可滚动和可选取。

## Do's and Don'ts

### Do:

- **Do** 从 ComfyUI token 派生所有基础颜色，并在真实挂载位置验证计算样式。
- **Do** 使用一个稳定状态真源定向更新现有 DOM，保留焦点、光标、动画元素和滚动位置。
- **Do** 用表面、间距、圆角、局部身份色和柔和边缘阴影建立清晰层级。
- **Do** 在最窄和最矮支持尺寸下检查中英文文案、主要行动、命中面和滚动可达性。
- **Do** 同时保证 Classic、Nodes 2.0、Subgraph、明暗主题和 `prefers-reduced-motion`。

### Don't:

- **Don't** 使用大片空白、密集细分割线、默认浏览器控件或整块单调灰色信息面充当正式设计。
- **Don't** 用更小文字、压扁控件、嵌套完整表单滚动或同时展开多套配置硬塞内容。
- **Don't** 重画 ComfyUI 节点外壳、伪造 socket、遮挡原生缩放角或让 DOM 与 Canvas 重复表达同一状态。
- **Don't** 为普通导航、刷新、设置和取消使用高饱和实心按钮，也不要让危险色承担非危险操作。
- **Don't** 用颜色作为唯一状态信号，或把来源色、类别色、Rating 色和成功/警告/危险色混为一套。
