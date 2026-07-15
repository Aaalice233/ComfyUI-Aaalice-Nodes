# Architecture

## 当前范围

仓库注册两个 V3 节点：

- `ParameterPanel`（`Aaalice/control`）：拥有一组有序参数并提供 32 个稳定直接输出。
- `SimpleStringSplit`（`Aaalice/tools`）：按逗号或竖线拆分字符串并移除空段。

根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`。`nodes/__init__.py` 按稳定域顺序加载 `NODE_CLASSES`；域导入失败必须保留原始异常。

## 后端边界

`nodes/control/parameter_panel.py` 定义 ParameterPanel schema，并把前端注入的参数 payload 转换为 32 路直接输出。解析、校验和类型转换位于 `nodes/_lib/parameter_values.py`，不依赖运行中的 ComfyUI，可直接单测。

参数定义和当前值的唯一真源是 `node.properties.parameters`。后端不保存进程全局参数状态；执行时由前端 `graphToPrompt` 注入内部 payload。Separator 和未使用位置仍保留协议槽位，但返回填充值且不在界面显示。

`SimpleStringSplit` 是独立的纯后端工具节点，不依赖 ParameterPanel 前端。

## 前端模块

| 模块 | 职责 |
|---|---|
| `js/extension.js` | 包入口、共享 CSS 与 i18n 初始化 |
| `js/parameter_panel.js` | 生命周期挂载、DOM 控件、结构编辑器、prompt 注入和队列后 Seed 行为 |
| `js/parameter_panel_kj.js` | 可选 KJ Set/Get 节点发现、创建和连线 |
| `js/lib/param_model.js` | 参数模型、默认值、校验、动态选项和变更事件 |
| `js/lib/parameter_layout.js` | 参数行、节点高度、真实输出位置和双模式 slot 同步 |
| `js/lib/parameter_controls.js` | 节点面与编辑器复用的无状态控件 |
| `js/lib/ui.js` / `ui.css` | 无业务状态的 DOM 组件和基础视觉 |
| `js/lib/theme.css` | ParameterPanel 节点面与编辑器布局 |

共享模块不得自行注册扩展或拥有工作流状态。

## 生命周期与数据流

ParameterPanel 在 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描中幂等挂载。DOM widget 同步创建；i18n 就绪后只更新文案和重绘，不能延迟首次挂载。

参数结构只由右键编辑器修改。保存时先统一校验，再确认受影响连线，并在一个图变更边界内原子应用。参数身份由稳定 id 决定；名称和顺序只影响显示。

执行前，`graphToPrompt` 从每个 ParameterPanel 的 properties 生成内部 payload。执行成功后按 Seed 配置进行 fixed、increment、decrement 或 randomize 更新，并通知节点面重绘。

## Classic 与 Nodes 2.0

Canvas/native 层负责静态表面、布局反馈和真实 slot；DOM overlay 负责输入、焦点、键盘、tooltip 与 aria。Classic 使用 LiteGraph slot，Nodes 2.0 使用 Vue slot DOM。

隐藏输出仍参与原生测量和命中映射。Nodes 2.0 重建 slot DOM 后由幂等 `MutationObserver` 恢复位置和可见性，不使用持续轮询。布局的唯一来源是 `js/lib/parameter_layout.js`。
