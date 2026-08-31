# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是使用 ComfyUI 构建、调试和复用复杂图像生成工作流的创作者与高级用户。他们需要频繁调整模型、提示词、尺寸和执行参数，管理节点组、Subgraph 与多页面控制面板，并在 Prompt Library、Booru 图片参考、Krita 和 Discord 等创作环节之间保持上下文连续。

## Product Purpose

ComfyUI-Aaalice-Nodes 为 ComfyUI 提供紧凑、原生一致且可持久化的参数控制与工作流工具，减少用户在复杂工作流中反复定位节点、重复配置参数、管理提示词和处理外部创作素材的成本。

产品成功意味着：用户可以在不建立第二份隐藏状态的前提下，从统一工作区可靠地操作真实节点与公开 Subgraph 控件，并能保存、恢复、分享和继续编辑自己的工作流与创作资产。

## Positioning

产品不是零散节点或独立参数面板的简单堆叠，而是与 ComfyUI 工作流状态、生命周期和序列化契约深度结合的创作控制层：

- Dashboard Control Card 绑定真实 Control Host，不复制独立参数状态。
- Stable Binding Identity 不依赖节点标题、位置或临时画布编号。
- Classic、Nodes 2.0 与 Subgraph 保持同等信息、交互和恢复语义。
- Prompt Library、Booru Gallery、Krita Snapshot、图像元数据和 Discord 分享围绕同一执行链路协作。
- 缺失、歧义、损坏、不可用和不支持状态明确失败，不通过猜测或静默降级掩盖问题。

## Operating Context

- 用户在 ComfyUI 画布和 Aaalice Workspace 中构建并操作工作流。
- Aaalice Workspace 提供参数控制、组导航和词库相关能力。
- 参数卡片可按 Dashboard Page、Layout Group 和 Dashboard Preset 组织，并直接写回节点或公开 Subgraph 控件。
- Prompt Entry 由独立 Prompt Library 管理，可通过 Category、Collection、标签和预览图组织，并被多个工作流引用。
- Booru Gallery 用于搜索、筛选和排序图片参考，并按稳定顺序输出成对的图像与 Prompt。
- Krita Bridge 在同一台机器上按执行请求获取活动文档的可见合成图、选区与可用生成参数。
- ConditionalSaveImage 与 LoadImageWithMetadata 支持在图像处理链中明确传递或清空生成参数。
- Discord 分享从最近一次含图像执行中选择结果，经受信任中继发送到已配置的频道。

## Capabilities and Constraints

- 提供工作流组控制、组逻辑探测、精确分辨率、执行到达提醒、字符串处理、条件保存、图像元数据读取、Prompt 选择、多站点 Gallery 和 Krita Snapshot 等节点能力。
- Dashboard 支持十二列布局、页面、Layout Group、Control Binding Set、Preset、数值范围覆盖和本机调整档案。
- Prompt Library 支持嵌套 Category、Collection、标签、预览图、归档导入导出和受支持旧格式迁移。
- Booru Gallery 支持 Danbooru、Gelbooru、Safebooru 与 AI TAG；站点能力、凭据要求和可用性以各自公开能力为准。
- 支持 English、简体中文和繁体中文；其它界面语言回退到 English。
- 支持 Classic 与 Nodes 2.0，暂不支持 App Mode。
- QuickGroupManager 只控制所属 graph 中的可视组，不穿透 Subgraph。
- SimpleNotify 只表示执行到达，不表示并行分支或整个队列完成。
- Prompt Library、Gallery 凭据、内容黑名单和缓存等用户级数据不进入工作流 JSON；Dashboard 布局与 Preset 按各自协议随工作流保存。
- Krita、ComfyUI 与 Bridge 必须运行在同一台机器；缺失 Bridge 或无有效活动文档时明确失败。
- Discord Webhook、OAuth Secret 和成员验证逻辑只存在于受信任中继，不进入 ComfyUI Python 进程或工作流。
- 未知自定义控件与 DOM 面板不得被自动猜测适配，必须通过显式 Adapter 接入。
- 不得与 ComfyUI-Danbooru-Gallery 同时安装；AIGODLIKE-COMFYUI-TRANSLATION 会破坏 Subgraph 自定义参数名称。
- 当前发布阶段不承诺为旧版包工作流提供自动兼容层。

## Brand Commitments

- 产品名称保持为 **ComfyUI-Aaalice-Nodes**，Registry 包 ID 为 `comfyui-aaalice-nodes`，Publisher 为 `aaalice`。
- 对外文案保持简洁、事实明确、可操作，并同步维护 English、简体中文和繁体中文。
- 现有品牌资产为 `assets/banner.png`、`assets/icon.png` 与 `js/assets/aaalice-workspace.svg`。
- 尊重 ComfyUI 的原生交互、主题和节点身份；扩展界面服务于工作流，不伪造另一套宿主体验。
- 尊重用户资产与控制权：不意外覆盖工作流、Preset、Prompt Library、源图参数或生成结果。
- 安全、可恢复和透明失败是产品承诺，包括事务化写入、失败回滚、凭据隔离和持续 TLS 校验。

## Evidence on Hand

- `README.md` 与 `README.en.md`：安装、已发布能力、使用方法与公开限制。
- `CONTEXT.md`：统一产品术语和身份概念。
- `docs/development/architecture.md`：当前模块边界、状态真源、生命周期和数据流。
- `docs/design/*.md`：各功能域的交互、视觉和可访问性契约。
- `assets/banner.png`、`assets/icon.png`、`js/assets/aaalice-workspace.svg`：现有品牌资产。
- `js/assets/notify.mp3`：执行到达提醒使用的现有音频资产。
- 仓库中没有可作为产品证明的客户名单、用户评价、采用规模、性能基准或商业声明；后续设计与文案不得虚构这些内容。

## Product Principles

1. **Workflow truth first**：侧边栏、Preset 和视图投影必须服务于真实节点与工作流状态，不建立隐藏的第二真源。
2. **Compact control without reduced capability**：通过紧凑界面降低操作成本，但不牺牲参数精度、顺序、元数据、恢复能力或主要内容空间。
3. **Explicit over implicit**：缺失、歧义、不可用、错误和不支持状态必须明确表达，不猜测、不静默降级、不伪造成功。
4. **Creator context stays connected**：参数、Prompt、图片参考、Krita、元数据和执行结果应在同一创作上下文中连续流动。
5. **Accessible and reversible by default**：键盘操作、焦点管理、ARIA、减少动效、事务边界和失败回滚属于默认产品质量。

## Accessibility & Inclusion

- Classic 与 Nodes 2.0 必须保持同等信息、交互、状态和尺寸语义。
- 用户可见状态不能只依靠颜色，还需通过文字、图标、位置、形态或控件状态表达。
- 纯图标操作必须提供本地化可访问名称；Dialog、Popover、Context Menu、列表和导航必须支持对应的键盘与焦点契约。
- 实时输入必须保留焦点、光标、选区和 IME composition，覆盖中文等输入法场景。
- 支持 `prefers-reduced-motion: reduce`，明暗主题下均需保持文字、焦点和关键状态可辨。
- 交互目标通常不小于 32px；空间不足时优先减少次要信息，而不是缩小到不可读或不可操作。
