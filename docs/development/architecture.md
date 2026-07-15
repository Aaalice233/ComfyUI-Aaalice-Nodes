# Architecture

## 当前范围

仓库当前只注册两个 V3 节点：

| 节点 | Python | 前端 | category |
|---|---|---|---|
| `SimpleStringSplit` | `nodes/tools/simple_string_split.py` | 无专用前端 | `Aaalice/tools` |
| `ParameterPanel` | `nodes/control/parameter_panel.py` | `js/parameter_panel.js` | `Aaalice/control` |

`js/parameter_sidebar.js` 提供 Operation Panel，`js/parameter_panel_kj.js` 提供可选 KJ Set/Get 集成；它们不是独立后端节点。

未来域只有出现真实节点时才建立并注册，不在聚合器或文档中保留空规划槽位。

## 后端边界

```text
__init__.py
  └─ nodes.iter_node_classes()
       ├─ nodes.tools.NODE_CLASSES
       └─ nodes.control.NODE_CLASSES

ParameterPanel.execute()
  └─ parse_parameters_json()
       └─ parameters_to_outputs()
            ├─ validate_parameters_list()
            ├─ coerce_parameter_value()
            └─ 固定补齐 32 个直接输出
```

- 根入口只注册 `WEB_DIRECTORY` 和 V3 节点列表。
- 域包导出 `NODE_CLASSES`，缺失域或缺失导出应显式失败。
- `nodes/_lib/parameter_values.py` 是纯逻辑，不依赖运行中的 ComfyUI；图片值只通过调用方提供的 resolver 接入 `LoadImage`。
- 后端不构造或保存参数包，不维护进程全局参数状态。

## 前端模块

| 模块 | 职责 |
|---|---|
| `js/extension.js` | 加载样式与业务模块，注册包级初始化 |
| `js/i18n.js` | 读取 ComfyUI locale 与本包翻译目录 |
| `js/lib/param_model.js` | 参数默认值、校验、稳定身份和事件 |
| `js/lib/parameter_layout.js` | 参数行、节点高度、真实输出映射和静态绘制 |
| `js/lib/parameter_controls.js` | 节点面与侧栏共享的输入控件 |
| `js/lib/operation_state.js` | v3 Page / Module 状态、容器深度与原子删除 |
| `js/lib/operation_layout.js` | 锚点换算、吸附、智能锚点、碰撞落位与分布 |
| `js/lib/operation_registry.js` | `aaaliceOperationPanel.v1` adapter 注册与公共渲染组件 |
| `js/lib/operation_preset_store.js` | v3 Value Preset 的 user-data 读写 |
| `js/lib/safe_markdown.js` | Heading、说明与 Markdown Module 共用的安全渲染 |
| `js/parameter_panel.js` | ParameterPanel 挂载、结构编辑、序列化与节点菜单 |
| `js/parameter_sidebar.js` | Operation Panel 覆盖工作区、页面、模块编辑、预设与 Subgraph 卡片 |
| `js/parameter_panel_kj.js` | 可选 KJ Set/Get 创建、连线和命名同步 |

`js/lib/ui.js` + `ui.css` 是无业务状态的 DOM 组件层；`theme.css` 只负责业务布局与主题映射。

## 前端加载与数据流

```text
extension.js
  ├─ parameter_panel.js
  │    ├─ ParameterPanel DOM widget / editor / graphToPrompt
  │    └─ parameter_panel_kj.js（可选集成，不单独注册扩展）
  └─ parameter_sidebar.js
       ├─ Operation Panel sidebar toggle + single workspace portal
       ├─ native toolbar backdrop / unified command bar
       ├─ Page / Module layout editor
       └─ Operation adapter API installation
```

ParameterPanel 在 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描中幂等挂载。Operation Panel 通过 ComfyUI sidebar API 注册入口，但 sidebar render container 只承担原生 toggle 生命周期。展开时隐藏该 tab 对应的 `SplitterPanel` 和相邻 gutter，把一层背景及唯一工作区 portal 挂到 `document.body`；背景位于原生顶部工具之下，页面与编辑命令只占用原生面包屑和右侧 actionbar 之间的空间。收起时必须同时卸载 portal、背景并恢复 Splitter 元素，不能留下紧凑侧栏版本或第二套布局外壳。

参数变化通过命名事件通知节点面和 Operation Panel 重绘。Operation Panel 对普通节点使用受支持 widget 的通用 adapter，对 ParameterPanel 使用稳定参数身份，对 Subgraph 使用其公开 widgets；第三方 adapter 只覆盖卡片渲染和 preset 项。

## 状态真源

| 状态 | 真源 | 执行时去向 |
|---|---|---|
| 参数定义、值、顺序、稳定身份 | ParameterPanel `node.properties` | `graphToPrompt` 注入 `parameters_json` |
| 输出与参数身份绑定 | ParameterPanel slot metadata | 前端重排时按稳定身份重绑 |
| Operation Page / Module / Anchor Frame | workflow property `aaalice_operation_panel` v3 | 仅供前端操作界面；旧版本直接重置 |
| Value Preset | ComfyUI `user` 存储 | 按当前页面或所选 Root Modules 的范围写回 adapter 暴露值 |

任何新状态必须先确定唯一真源，并验证保存、加载、复制节点、撤销/重做与执行路径。

Operation Panel 的编辑态、选择、当前浏览页面和当前轮播页只存在于前端内存。节点和 Subgraph 只通过自身右键菜单注册；移除 Module 或 Page 只修改 workflow property，不删除工作流节点。第三方 adapter 的高级 DOM 渲染必须在重绘或关闭工作区时执行清理函数。

v3 workflow state 的稳定关系为：

```text
Operation Panel
  └─ Page[]
       ├─ design size + default page identity
       ├─ Root Module[]（使用 Anchor Frame）
       └─ child Module[]（由 Group / Carousel 自动排版）
```

Page 和 Module 使用稳定 ID。Node Card 保存工作流节点 ID、显示覆盖、adapter 和 preset key；Group 保存有序 Node Card；Carousel 保存有序 slides 和默认 slide。旧版本 Operation Panel 状态直接重置，原因见 [ADR 0006](../adr/0006-anchored-modular-operation-panel.md)。

Operation Panel 的版本化 adapter 契约见 [`operation-panel-adapters.md`](operation-panel-adapters.md)。adapter 只能读写节点自身公开控件与结果，不能借 Operation Panel 创建、删除、连线节点或更改参数定义。

## 双模式渲染

ParameterPanel 只有一份 DOM 控件树。经典模式和 Nodes 2.0 共用值控件与可访问语义，区别仅在节点壳和原生输出绘制：

- Classic：LiteGraph 原生 slot 绘制和命中。
- Nodes 2.0：Vue slot DOM 绘制和命中。
- Canvas 层：静态表面和布局反馈，不承担输入语义。
- DOM overlay：输入、焦点、键盘、tooltip 和 aria。

共同组件规则见 [`../design/ui-system.md`](../design/ui-system.md)，两个界面的专用规则见 [`../design/parameter-panel.md`](../design/parameter-panel.md) 与 [`../design/operation-panel.md`](../design/operation-panel.md)。
