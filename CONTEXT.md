# 项目领域词汇

本文件统一产品和工作流语境中的称呼，不记录字段名、路径、测试步骤或实现方案。

## 参数创作

- **ParameterPanel（参数面板）**：拥有一组有序参数并把可调值直接提供给工作流的图节点。避免使用 ParameterControlPanel、child-panel container。

- **Parameter（参数）**：一个具备稳定身份、名称、类型、当前值和可选说明的可调值。避免使用 Field、setting、slot。

- **Separator（分隔项）**：只用于组织参数显示、不产生值或输出的展示项。避免使用 Empty Parameter、heading Parameter。

- **Parameter Identity（参数身份）**：参数在所属 ParameterPanel 内的稳定身份；显示名称与顺序都不是身份。避免使用 Parameter name、output position。

- **Direct Parameter Output（参数直接输出）**：一个 Parameter 直接提供给工作流的值，不经过中间打包或拆包节点。避免使用 Parameter pack、break output。

- **ParameterReceiver（参数接收器）**：绑定一个 ParameterPanel，把对应 Get 值收束为一组同名直接输出的图节点。避免使用 Breaker、Parameter pack。

- **Receiver Binding（接收器绑定）**：ParameterReceiver 与一个 ParameterPanel 及其稳定参数身份之间的显式关系。面板标题、参数名称与槽位顺序都不是绑定身份。

- **Managed Get（托管 Get）**：由 ParameterReceiver 创建或认领、专门把一个参数送入接收器的 KJ Get；存在其他消费者时不能随接收器同步而删除。

- **Receiver Sync（接收器同步）**：由用户显式触发，把新增、删除和重排应用到托管 Get 与接收器槽位的结构操作。名称变化不属于结构同步。

## 工作流控制与工具

- **EnumSwitch（枚举选通）**：根据一个精确字符串 key，只执行并输出对应分支的控制节点。避免使用 Fallback Switch、Value Switch。

- **Branch Key（分支键）**：用户可见、区分大小写并用于精确选择分支的稳定字符串。避免使用 Branch Index、display label。

- **Route Identity（路由身份）**：分支连接在重命名和重排中的稳定身份；Branch Key 和槽位顺序都不是身份。

- **Execution-point Alert（执行到达提醒）**：当执行到达工作流中的指定节点时，由前端发出的桌面通知或声音。它不表示其它并行分支完成。

- **Queue-complete Alert（队列完成提醒）**：整个队列清空后发出的提醒，与 Execution-point Alert 是不同职责；本项目当前不提供该能力。

- **Transparent Pass-through（透明透传）**：节点不改变输入值的类型、内容和顺序，只附加控制或界面副作用。

## 通用边界

- **Classic**：由 LiteGraph 原生节点和 slot 负责主要画布渲染的 ComfyUI 节点模式。

- **Nodes 2.0**：由 Vue 节点组件参与节点和 slot 渲染的 ComfyUI 节点模式。

- **App Mode**：面向应用化工作流的 ComfyUI 界面模式；当前项目不支持。
