# Parameter Context

本文件定义 ParameterPanel 领域中需要稳定使用的术语，不记录字段名、文件路径或实现方案。

## Parameter authoring

- **ParameterPanel（参数面板）**：拥有一组有序参数并把可调值直接提供给工作流的图节点。避免使用 ParameterControlPanel、child-panel container。

- **Parameter（参数）**：一个具备稳定身份、名称、类型、当前值和可选说明的可调值。避免使用 Field、setting、slot。

- **Separator（分隔项）**：只用于组织参数显示、不产生值或输出的展示项。避免使用 Empty Parameter、heading Parameter。

- **Parameter Identity（参数身份）**：参数在所属 ParameterPanel 内的稳定身份；显示名称与顺序都不是身份。避免使用 Parameter name、output position。

- **Direct Parameter Output（参数直接输出）**：一个 Parameter 直接提供给工作流的值，不经过中间打包或拆包节点。避免使用 Parameter pack、break output。

- **ParameterReceiver（参数接收器）**：绑定一个 ParameterPanel，把对应 Get 值收束为一组同名直接输出的图节点。避免使用 Breaker、Parameter pack。

- **Receiver Binding（接收器绑定）**：ParameterReceiver 与一个 ParameterPanel 及其稳定参数身份之间的显式关系。面板标题、参数名称与槽位顺序都不是绑定身份。

- **Managed Get（托管 Get）**：由 ParameterReceiver 创建或认领、专门把一个参数送入接收器的 KJ Get；存在其他消费者时不能随接收器同步而删除。

- **Receiver Sync（接收器同步）**：由用户显式触发，把新增、删除和重排应用到托管 Get 与接收器槽位的结构操作。名称变化不属于结构同步。
