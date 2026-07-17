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

- **Prompt Entry（提示词条）**：词库中具有稳定身份、正文和可选组织信息的一条可复用提示词。分类、合集和显示标题都不是词条身份。避免使用 Prompt Snapshot、Node Prompt。

- **Prompt Library（词库）**：由用户独立维护、可被多个工作流引用的 Prompt Entry 集合。它不属于任何单个 PromptSelector 或工作流。避免使用 Node List、Workflow Prompts。

- **Category（分类）**：Prompt Entry 唯一归属的扁平主分类。避免使用 Folder、Collection。

- **Collection（合集）**：对 Prompt Entry 进行多对多组织并保留合集内顺序的人工集合。避免使用 Category、Tag Folder。

- **Prompt Selection（提示词选择）**：PromptSelector 持有的有序 Prompt Entry 引用及各自权重。它引用词条身份，不复制词条正文。

- **PromptSelector（提示词选择器）**：从 Prompt Library 中跨分类选择、排序并加权输出提示词的图节点。词库维护不是该节点的职责。

- **Control Host（参数宿主）**：在当前工作流中拥有一个或多个可投影参数的节点或子图整体。节点标题、位置和临时画布编号都不是宿主身份。

- **Control Binding（参数绑定）**：侧边栏参数卡片与一个 Control Host 上稳定参数身份之间的显式关系。显示名称不是绑定身份。

- **Dashboard Page（控制页面）**：用户在侧边栏中手工组织分区和参数卡片的一个可切换页面。避免使用 Auto Page、Node Group。

- **Dashboard Preset（侧边栏预设）**：可移植的页面布局、Control Binding 与导出时参数值集合；它不包含 Prompt Library。

- **Missing Binding（失效绑定）**：目标宿主或参数身份无法精确解析、但仍被保留以供人工重新绑定的 Control Binding。避免使用 Auto Rebind、Name Match。

- **Prompt Cleaning（提示词清理）**：按照用户明确选择的关闭、自然语言或标签列表模式执行原样透传或保守、确定性的文本规范化。它不猜测提示词类型，也不修复权重、LoRA 或第三方语法；识别到已支持的分区控制语法时整段原样旁路。

- **Tag-list Deduplication（标签列表去重）**：在保持首次出现形式和原顺序的前提下，按配置的大小写与下划线等价规则移除重复顶层标签。避免使用 Prompt semantic repair、automatic prompt detection。

- **QuickGroupManager（快速组管理器）**：在当前图中按独立范围显示、排序和切换可视组的控制节点。避免使用 GroupMuteManager、GroupBypassManager。

- **Managed Group Scope（纳管组范围）**：一个 QuickGroupManager 当前显示并允许手动操作的组集合，由颜色筛选决定。避免使用 Global Group State、shared Manager scope。

- **Group Linkage Rule（组联动规则）**：用户直接切换某组时，由同一个 QuickGroupManager 规划的后续组状态变化。外部状态变化和其它 Manager 的操作不属于联动触发。避免使用 Cross-manager cascade、automatic graph sync。

- **EnumSwitch（枚举选通）**：根据一个精确字符串 key，只执行并输出对应分支的控制节点。避免使用 Fallback Switch、Value Switch。

- **Branch Key（分支键）**：用户可见、区分大小写并用于精确选择分支的稳定字符串。避免使用 Branch Index、display label。

- **Route Identity（路由身份）**：分支连接在重命名和重排中的稳定身份；Branch Key 和槽位顺序都不是身份。

- **Execution-point Alert（执行到达提醒）**：当执行到达工作流中的指定节点时，由前端发出的桌面通知或声音。它不表示其它并行分支完成。

- **Queue-complete Alert（队列完成提醒）**：整个队列清空后发出的提醒，与 Execution-point Alert 是不同职责；本项目当前不提供该能力。

- **Transparent Pass-through（透明透传）**：节点不改变输入值的类型、内容和顺序，只附加控制或界面副作用。

## 通用边界

- **Node Color（节点颜色）**：用户通过 ComfyUI 为单个节点选择的原生外观颜色，负责节点标题和主体的基础色。它不是警告、错误或业务模式状态。

- **Node Accent（节点强调色）**：从 Node Color 和当前主题对比色派生、用于节点内普通交互控件激活态的颜色。未选择 Node Color 时回退到 ComfyUI 主题强调色；语义状态色不属于 Node Accent。

- **Classic**：由 LiteGraph 原生节点和 slot 负责主要画布渲染的 ComfyUI 节点模式。

- **Nodes 2.0**：由 Vue 节点组件参与节点和 slot 渲染的 ComfyUI 节点模式。

- **App Mode**：面向应用化工作流的 ComfyUI 界面模式；当前项目不支持。
