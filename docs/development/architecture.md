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
| `js/parameter_panel.js` | ParameterPanel 挂载、结构编辑、序列化与节点菜单 |
| `js/parameter_sidebar.js` | Operation Panel 页面、分区、卡片与值预设 |
| `js/parameter_panel_kj.js` | 可选 KJ Set/Get 创建、连线和命名同步 |

`js/lib/ui.js` + `ui.css` 是无业务状态的 DOM 组件层；`theme.css` 只负责业务布局与主题映射。

## 状态真源

| 状态 | 真源 | 执行时去向 |
|---|---|---|
| 参数定义、值、顺序、稳定身份 | ParameterPanel `node.properties` | `graphToPrompt` 注入 `parameters_json` |
| 输出与参数身份绑定 | ParameterPanel slot metadata | 前端重排时按稳定身份重绑 |
| Operation Page / Section / Card / layout | 命名空间化 workflow properties | 仅供前端操作界面 |
| Page Value Preset | ComfyUI `user` 存储 | 用户选择时写回 adapter 暴露值 |

任何新状态必须先确定唯一真源，并验证保存、加载、复制节点、撤销/重做与执行路径。

## 双模式渲染

ParameterPanel 只有一份 DOM 控件树。经典模式和 Nodes 2.0 共用值控件与可访问语义，区别仅在节点壳和原生输出绘制：

- Classic：LiteGraph 原生 slot 绘制和命中。
- Nodes 2.0：Vue slot DOM 绘制和命中。
- Canvas 层：静态表面和布局反馈，不承担输入语义。
- DOM overlay：输入、焦点、键盘、tooltip 和 aria。

详细组件与尺寸规则见 [`../design/herdi-inspired-ui.md`](../design/herdi-inspired-ui.md)。
