# 架构

## 当前范围

仓库注册五个 V3 节点：

- `ParameterPanel`（`Aaalice/control`）：拥有一组有序参数并提供 32 个稳定直接输出。
- `ParameterReceiver`（`Aaalice/control`）：提供 32 路固定可选输入与输出，绑定面板后逐路透传对应 Get 值。
- `EnumSwitch`（`Aaalice/tools`）：按精确字符串 key 惰性选通 1–32 路同类型输入。
- `SimpleStringSplit`（`Aaalice/tools`）：按逗号或竖线拆分字符串并移除空段。
- `SimpleNotify`（`Aaalice/tools`）：执行到达时按独立开关提醒，并原样透传同类型值。

根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`。`nodes/__init__.py` 按稳定域顺序加载 `NODE_CLASSES`；域导入失败必须保留原始异常。

## 后端边界

`nodes/control/parameter_panel.py` 定义 ParameterPanel schema，并把前端注入的参数 payload 转换为 32 路直接输出。解析、校验和类型转换位于 `nodes/_lib/parameter_values.py`，不依赖运行中的 ComfyUI，可直接单测。

`nodes/control/parameter_receiver.py` 定义固定的 32 路可选 AnyType 输入和输出。`nodes/_lib/receiver_values.py` 只按协议顺序透传值；KJ Set/Get 的发现、创建和同步全部属于前端图操作，不进入后端状态。

`nodes/tools/enum_switch.py` 定义 selector、32 个固定 lazy `MatchType` 分支与同类型输出。`nodes/_lib/enum_switch.py` 负责解析路由 payload、校验稳定 route id 与唯一 key，并返回精确匹配的协议输入；未知 selector 和未连接目标分支均显式失败。

参数定义和当前值的唯一真源是 `node.properties.parameters`。后端不保存进程全局参数状态；执行时由前端 `graphToPrompt` 注入内部 payload。Separator 和未使用位置仍保留协议槽位，但返回填充值且不在界面显示。

`SimpleStringSplit` 是独立的纯后端工具节点，不依赖 ParameterPanel 前端。

`SimpleNotify` 使用成对的 V3 MatchType 输入输出，并沿用 ComfyUI 默认的逐项 list 映射，使原生 widget 保持标量。映射产生的提醒 payload 会合并到一次节点执行结果中，前端只消费第一项，因此每个 prompt、每个节点实例只提醒一次。它是强制重执行的 output node；后端只返回透传值与提醒 payload，浏览器通知和音频副作用由发起执行的前端处理。

## 前端模块

| 模块 | 职责 |
|---|---|
| `js/extension.js` | 包入口、共享 CSS 与 i18n 初始化 |
| `js/parameter_panel.js` | 生命周期挂载、DOM 控件、结构编辑器、prompt 注入和队列后 Seed 行为 |
| `js/parameter_panel_kj.js` | 可选 KJ Set/Get 节点发现、创建和连线 |
| `js/parameter_receiver.js` | 接收器生命周期、绑定菜单、显式同步、Get 所有权和状态显示 |
| `js/enum_switch.js` | 分支编辑、面板枚举绑定、同步提示、真实槽位保线和 prompt 注入 |
| `js/simple_notify.js` | 执行结果提醒、浏览器权限入口和节点右键测试操作 |
| `js/lib/simple_notify_runtime.js` | 可单测的桌面通知、提示音和错误分类 |
| `js/lib/param_model.js` | 参数模型、默认值、校验、动态选项和变更事件 |
| `js/lib/enum_switch_model.js` | EnumSwitch 状态归一化、路由校验、差异计算和同步合并 |
| `js/lib/parameter_layout.js` | 参数行、节点高度、真实输出位置和双模式 slot 同步 |
| `js/lib/receiver_model.js` | 接收器绑定归一化和按 Parameter Id 的结构差异计算 |
| `js/lib/receiver_layout.js` | 接收器输入/输出行、状态区高度和双模式真实 slot 同步 |
| `js/lib/parameter_controls.js` | 节点面与编辑器复用的无状态控件 |
| `js/lib/ui.js` / `ui.css` | 无业务状态的 DOM 组件和基础视觉 |
| `js/lib/theme.css` | ParameterPanel 节点面与编辑器布局 |

共享模块不得自行注册扩展或拥有工作流状态。

## 生命周期与数据流

ParameterPanel 在 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 现有节点扫描中幂等挂载。DOM widget 同步创建；i18n 就绪后只更新文案和重绘，不能延迟首次挂载。

参数结构只由右键编辑器修改。保存时先统一校验，再确认受影响连线，并在一个图变更边界内原子应用。参数身份由稳定 id 决定；名称和顺序只影响显示。

执行前，`graphToPrompt` 从每个 ParameterPanel 的 properties 生成内部 payload。执行成功后按 Seed 配置进行 fixed、increment、decrement 或 randomize 更新，并通知节点面重绘。

ParameterReceiver 的唯一状态真源是 `node.properties.receiverBinding`。身份由面板节点 id 与参数 id 共同决定。名称与类型自动刷新；新增、删除和重排只更新“需要同步”状态，首次绑定或右键显式同步才允许增删、排列和重连真实 Get。同步在一个图变更边界内完成，并按参数 id 保留下游连线。

EnumSwitch 的唯一状态真源是 `node.properties.enumSwitch`。分支连接身份由稳定 route id 决定，字符串 key 只负责精确匹配与显示。直接连接 ParameterPanel 或 ParameterReceiver 的 enum/dropdown 输出时记录面板节点 id 与参数 id；源选项变化只显示同步图标，用户显式同步后才按 key 增删和重排分支。执行前由 `graphToPrompt` 注入路由 payload，后端不保存面板绑定或枚举配置。

## Classic 与 Nodes 2.0

Canvas/native 层负责静态表面、布局反馈和真实 slot；DOM overlay 负责输入、焦点、键盘、tooltip 与 aria。Classic 使用 LiteGraph slot，Nodes 2.0 使用 Vue slot DOM。

隐藏协议槽仍保留序列化位置；可见输入输出使用原生真实 socket。ParameterPanel 布局真源是 `js/lib/parameter_layout.js`，ParameterReceiver 布局真源是 `js/lib/receiver_layout.js`。EnumSwitch 复用固定 32 路协议并只显示当前分支，交互式同步图标由 DOM widget 承担。
