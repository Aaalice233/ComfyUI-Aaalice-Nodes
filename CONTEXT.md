# Parameter Context

本文件定义 ParameterPanel 领域中需要稳定使用的术语，不记录字段名、文件路径或实现方案。

## Parameter authoring

- **ParameterPanel（参数面板）**：拥有一组有序参数并把可调值直接提供给工作流的图节点。避免使用 ParameterControlPanel、child-panel container。

- **Parameter（参数）**：一个具备稳定身份、名称、类型、当前值和可选说明的可调值。避免使用 Field、setting、slot。

- **Separator（分隔项）**：只用于组织参数显示、不产生值或输出的展示项。避免使用 Empty Parameter、heading Parameter。

- **Parameter Identity（参数身份）**：参数在所属 ParameterPanel 内的稳定身份；显示名称与顺序都不是身份。避免使用 Parameter name、output position。

- **Direct Parameter Output（参数直接输出）**：一个 Parameter 直接提供给工作流的值，不经过中间打包或拆包节点。避免使用 Parameter pack、break output。
