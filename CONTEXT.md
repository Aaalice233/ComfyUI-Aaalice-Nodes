# 项目领域词汇

本文件统一产品和工作流语境中的称呼，不记录字段名、路径、测试步骤或实现方案。

## 工作流控制与工具

- **Prompt Entry（提示词条）**：词库中具有稳定身份、正文和可选组织信息的一条可复用提示词。分类、收藏夹和显示标题都不是词条身份。避免使用 Prompt Snapshot、Node Prompt。

- **Prompt Library（词库）**：由用户独立维护、可被多个工作流引用的 Prompt Entry 集合。它不属于任何单个 PromptSelector 或工作流。避免使用 Node List、Workflow Prompts。

- **Category（分类）**：Prompt Entry 唯一归属的可嵌套主分类树节点，使用稳定 ID、单一可空父级、同级顺序和可编辑识别色；词条可直接归属任意层级。颜色与完整路径用于跨界面识别，但都不属于分类身份。避免使用 Folder、Collection。

- **Collection（收藏夹）**：对 Prompt Entry 进行多对多收藏并保留夹内顺序的人工集合；`Collection` 是备份与 API 中保持稳定的协议名。避免使用 Category、Tag Folder。

- **Prompt Selection（提示词选择）**：PromptSelector 持有的有序 Prompt Entry 引用及各自权重。它引用词条身份，不复制词条正文。

- **PromptSelector（提示词选择器）**：从 Prompt Library 中跨分类选择、排序并加权输出提示词的图节点。词库维护不是该节点的职责。
- **Booru Source（画廊来源）**：提供搜索、详情和可选账户能力的一个独立站点；来源身份是稳定英文协议值，不等于显示名称。

- **Gallery Capability（画廊能力）**：一个 Booru Source 明确声明的 Rating、分页、认证、标签分类、收藏和下载支持范围。避免使用 Cross-site fallback、Implicit support。

- **Gallery Page（画廊页）**：当前来源与频道中的一段一基页结果；界面统一使用从 1 开始的逻辑页码，站点的 `page`、`pid` 或 cursor 由适配器转换。它不是瀑布流 DOM、滚动像素或已选快照。

- **Gallery Selection Snapshot（画廊选择快照）**：BooruGalleryNode 按顺序保存的来源、帖子身份、媒体地址、原始分类标签和可选本地编辑标签。它是工作流状态，不是当前搜索结果引用。

- **Virtual Masonry（虚拟瀑布流）**：按图片自然比例和最短列排列、但只挂载视口附近卡片 DOM 的浏览布局。避免使用 Fixed-row grid、Full DOM gallery。

- **Control Host（控件宿主）**：在当前工作流中拥有一个或多个可投影控件的节点或子图整体。节点标题、位置和临时画布编号都不是宿主身份。

- **Control Binding（控件绑定）**：侧边栏控件卡片与一个 Control Host 上稳定控件身份之间的显式关系。显示名称不是绑定身份。

- **Control Binding Set（控件联动集）**：一张侧边栏控件卡片所控制的全部兼容 Control Binding；其中一个 Primary Binding 决定卡片展示，其余 Binding 只作为同一用户输入的目标。避免使用 Synced Cards、Copied Control。

- **Dashboard Page（控制页面）**：用户在侧边栏中直接组织控件卡片、分隔项和可选布局组的一个可切换页面。避免使用 Auto Page、Section。

- **Dashboard Control Card（侧边栏控件卡片）**：Control Binding Set 在控制页面中的可调投影；它可以控制一个或多个兼容控件，独立放置或加入一个布局组。避免使用 Section Item、Copied Control。

- **Component Note（组件说明）**：附着在单个侧边栏控件卡片或分隔项上的用户 Markdown 说明；它属于 Dashboard 布局内容，不属于节点参数定义或控件当前值。避免使用 Node Description、Parameter Value。

- **Layout Group（布局组）**：控制页面中对若干控件卡片进行命名、识别和整体移动的可选单层组合；删除布局组只解除成员关系。避免使用 Dashboard Section、Nested Group。

- **Grid Position（网格位置）**：控件卡片或布局组在控制页面细粒度结构化网格中的逻辑锚点，不代表像素坐标或控件身份。避免使用 Canvas Position、DOM Position。

- **Grid Footprint（网格占位）**：一个控件卡片或布局组在网格中实际占据的矩形单元范围；不同高度的卡片可以在彼此旁边独立填充剩余空间。避免使用 DOM Size、Visual Row。

- **Dashboard Preset（侧边栏预设）**：可移植的页面布局、Control Binding 与导出时控件值集合；它不包含 Prompt Library。

- **Missing Binding（失效绑定）**：目标宿主或控件身份无法精确解析、但仍被保留以供人工重新绑定的 Control Binding。避免使用 Auto Rebind、Name Match。

- **QuickGroupManager（快速组管理器）**：在当前图中按独立范围显示、排序和切换可视组的控制节点。避免使用 GroupMuteManager、GroupBypassManager。

- **Managed Group Scope（纳管组范围）**：一个 QuickGroupManager 当前显示并允许手动操作的组集合，由颜色筛选决定。避免使用 Global Group State、shared Manager scope。

- **Group Linkage Rule（组联动规则）**：用户直接切换某组时，由同一个 QuickGroupManager 规划的后续组状态变化。外部状态变化和其它 Manager 的操作不属于联动触发。避免使用 Cross-manager cascade、automatic graph sync。

- **ResolutionPreset（分辨率预设）**：通过内置预设、个人预设、精确输入或二维拖拽选择并输出确定宽高的工具节点。它不按百万像素推算尺寸，也不生成、裁剪或缩放图像。

- **Pixel Alignment（像素对齐）**：宽高必须落在指定像素步长的整数倍上；本节点支持 8、16、32 与 64 px。避免使用 Megapixel Scale、Model Resolution。

- **Krita Bridge（Krita 桥接器）**：随包提供、由用户显式安装到 Krita 的共享本机插件。它只负责执行短请求并交换请求关联的媒体快照，不负责启动、关闭或定位 Krita。

- **Krita Snapshot（Krita 快照）**：一次执行从 Krita 当前活动文档读取的可见合成图、文档元数据与选区蒙版。它是瞬时执行结果，不是工作流状态或可持续编辑会话。

- **Execution-point Alert（执行到达提醒）**：当执行到达工作流中的指定节点时，由前端发出的桌面通知或声音。它不表示其它并行分支完成。

- **Queue-complete Alert（队列完成提醒）**：整个队列清空后发出的提醒，与 Execution-point Alert 是不同职责；本项目当前不提供该能力。

- **Transparent Pass-through（透明透传）**：节点不改变输入值的类型、内容和顺序，只附加控制或界面副作用。

## 通用边界

- **Node Color（节点颜色）**：用户通过 ComfyUI 为单个节点选择的原生外观颜色，负责节点标题和主体的基础色。它不是警告、错误或业务模式状态。

- **Node Accent（节点强调色）**：从 Node Color 和当前主题对比色派生、用于节点内普通交互控件激活态的颜色。未选择 Node Color 时回退到 ComfyUI 主题强调色；语义状态色不属于 Node Accent。

- **Classic**：由 LiteGraph 原生节点和 slot 负责主要画布渲染的 ComfyUI 节点模式。

- **Nodes 2.0**：由 Vue 节点组件参与节点和 slot 渲染的 ComfyUI 节点模式。

- **App Mode**：面向应用化工作流的 ComfyUI 界面模式；当前项目不支持。
