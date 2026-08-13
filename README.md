<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <a href="./README.en.md">English</a> · <b>简体中文</b>
</p>

# ComfyUI-Aaalice-Nodes

面向 ComfyUI 的紧凑参数控件和工作流工具。

> 当前为已发布的预览版。首次稳定发布前，工作流格式和节点行为仍可能调整。旧版工作流不会自动迁移；词库管理可以导入下文列出的受支持旧版词库导出文件。

> [!WARNING]
> **不要与 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 同时安装**：两者注册了相同的节点 ID（`PromptSelector`、`GroupIsEnabled`、`SimpleNotify`、`SimpleStringSplit`、`FetchFromKrita`），且旧版包前端仍会挂钩这些节点类型，同时安装会产生重复控件和不可预期行为。请只保留其中一个。若检测到两者共存，界面会弹出警告提示。

## 📋 环境要求

- 支持 V3 自定义节点的较新 ComfyUI。
- 支持经典画布和 Nodes 2.0；暂不支持 App Mode。
- 内置 English 和简体中文界面；其它语言回退到 English。

## 📥 安装

### 📦 ComfyUI Manager（推荐）

1. 打开 **ComfyUI Manager**，进入自定义节点管理页面。
2. 搜索 `ComfyUI-Aaalice-Nodes` 或 Registry 包 ID `comfyui-aaalice-nodes`。
3. 点击 **Install**，完成后重启 ComfyUI 并刷新浏览器。

Manager 会安装 Registry 中已发布的 [`comfyui-aaalice-nodes`](https://registry.comfy.org/nodes/comfyui-aaalice-nodes) 及其声明依赖。日常安装和更新推荐使用 Manager。

### 🔧 手动 Git 安装

仅在需要最新开发版本或指定提交时使用 Git。将仓库克隆到 `ComfyUI/custom_nodes`，使用 ComfyUI 所在的 Python 环境安装依赖，然后重启：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt
```

## 🔄 更新与故障排查

- Registry 安装请通过 ComfyUI Manager 更新。
- 手动 Git 安装可在仓库目录执行 `git pull` 更新。
- Python 更新后重启 ComfyUI；前端更新后硬刷新浏览器。
- 如果结构更新后已有节点仍保留旧引脚或控件，请删除该节点实例并重新创建。

## 🧩 已包含节点

| 节点 | 分类 | 用途 |
|---|---|---|
| `QuickGroupManager` | `Aaalice/control` | 按颜色范围启用、静音或绕过可视组，并配置排序与联动规则。 |
| `GroupIsEnabled` | `Aaalice/control` | 在队列提交时报告可视组是否被完全禁用。 |
| `GroupLogicProbe` | `Aaalice/control` | 将多个组的启用/禁用探测按 AND/OR 组合成单个布尔值，用于懒执行分支。 |
| `ResolutionPreset` | `Aaalice/tools` | 通过预设、直接输入或画布拖拽选择精确对齐的宽高。 |
| `SimpleStringSplit` | `Aaalice/tools` | 按逗号或竖线拆分文本，去除空白并移除空段。 |
| `SimpleNotify` | `Aaalice/tools` | 在执行到达时发送可选的桌面和声音提醒，并原样透传数值。 |
| `ConditionalSaveImage` | `Aaalice/tools` | 仅在启用时保存图像，关闭时原样透传；安装 LoraManager 时复用其保存实现。 |
| `PromptSelector` | `Aaalice/prompt` | 从词库中选择、排序、加权可复用词条。 |
| `BooruGalleryNode` | `Aaalice/gallery` | 在虚拟瀑布流画廊中搜索 Danbooru、Gelbooru、Safebooru 和 AI TAG，按顺序输出图像与对应提示词。 |
| `FetchFromKrita` | `Aaalice/krita` | 读取 Krita 活动文档的可见合成图像与选区，输出 `IMAGE` 和 `MASK`。 |

## 📖 节点详情

<details>
<summary><strong>QuickGroupManager — 快速可视组控制</strong></summary>

QuickGroupManager 不参与工作流执行，也没有输入输出引脚。它发现当前图中的可视组，并为每个受管组提供一个启用开关；节点级的 **静音 / 绕过** 开关决定组关闭时的表现。

- 使用筛选图标管理全部组、多个颜色组或未着色组；多个管理器可以使用独立的颜色范围。
- 拖动组行即可排序，每个管理器保存自己的顺序。
- 使用行上的取景图标将完整可视组适配到画布。
- 使用链接图标配置该组启用或禁用时其它组的行为；联动只在发起变更的管理器内级联。
- 切换静音 / 绕过会把当前颜色范围内已禁用的组一次性转换，可撤销。

该节点只控制当前图中的可视组，不会进入子图内部。

</details>

<details>
<summary><strong>GroupIsEnabled — 可视组状态探测</strong></summary>

在节点下拉中选择一个可视组。提交队列时，节点快照该组成员的模式并输出单个布尔值：仅当所有成员都被静音或绕过时才报告 **已禁用**。探测器必须位于被监视组之外；组被重命名、删除或为空时会在执行时明确失败，不会猜测状态。

</details>

<details>
<summary><strong>GroupLogicProbe — 多组 AND/OR 探测</strong></summary>

建立一个组条件列表，每条将一个可视组与期望状态配对，再用 **AND / OR** 开关组合成单个布尔值。把结果连接到懒执行条件分支（如 Impact Pack 的 `ImpactConditionalBranch` cond 输入），未选中的分支上游不会执行。引用已重命名或已删除组的行会在面板中高亮，并在执行时明确失败。

</details>

<details>
<summary><strong>ResolutionPreset — 精确对齐尺寸</strong></summary>

从九个模型无关的内置尺寸中选择、保存个人预设、直接输入宽高，或在画布上拖动宽高及四角手柄。对齐可设为 8、16、32 或 64 像素；节点输出精确的 `INT` 宽高值。个人预设保留各自对齐，保存在当前 ComfyUI 用户目录。

该节点不按百万像素推算目标尺寸、不推荐模型，也不执行任何图像操作。需要按比例加像素量级计算时，请使用 ComfyUI 的 `ResolutionSelector`。

</details>

<details>
<summary><strong>SimpleNotify — 执行到达提醒</strong></summary>

连接任意数值即可在执行到达该节点时收到一次提醒，随后原样透传。桌面通知和内置提示音可独立启用，音量可调。通过节点菜单的 **🔔 启用并测试提醒** 请求浏览器权限并测试已启用通道。提醒只表示执行到达该节点，不等待并行分支或队列清空。

</details>

<details>
<summary><strong>ConditionalSaveImage — 可开关的图像保存</strong></summary>

与 `Save Image (LoraManager)` 相同的保存能力与选项（`%seed%` 等文件名变量、png/jpeg/webp、元数据、工作流嵌入、配方），但多了一个 **启用** 开关：关闭时不写盘、图像原样透传，保存相关控件随之灰化。安装 ComfyUI-Lora-Manager 时保存逻辑完全由其原版实现承担；未安装时回退为核心 PNG 保存，jpeg/webp 与配方等专属能力会明确报错提示。

所有保存节点都是输出节点，会被执行器无条件运行，因此“在开关节点上游串一个保存节点”无法阻止写盘；本节点把开关做进保存节点内部，是唯一不需要手动静音节点（`Ctrl+M`）的方案。

</details>

<details>
<summary><strong>PromptSelector — 有序词库选择</strong></summary>

搜索并按分类或收藏夹筛选词条，然后选择任意数量；列表可以把最近队列使用过的提示词排在前面。选择顺序即输出顺序。悬停已选词条可用滚轮或方向键调整权重（0–20）。可选的 `prefix_prompt` 输入最先输出，节点菜单可修改分隔符（默认 `, `）。安装 ComfyUI-Autocomplete-Aaalice 后，搜索框还会提供其标签与中文补全。

PromptSelector 保存稳定的词条引用而不是复制文本：编辑词库词条会更新所有引用节点；删除被引用的词条会留下可见的缺失引用并阻止执行，直到处理完成。

</details>

<details>
<summary><strong>BooruGalleryNode — 多站点有序画廊</strong></summary>

选择 Danbooru、Gelbooru、Safebooru 或 AI TAG，搜索并筛选帖子，然后在自动加载的自然比例瀑布流中选择。已选视图保持顺序、支持拖拽排序，并允许编辑每张帖子的本地标签而不修改远端站点。`images` 与 `prompts` 严格按同一顺序成对输出；下载失败会让节点明确失败，而不是插入占位图。

Gallery 可从节点右键菜单加入 Dashboard；节点与侧边栏是同一运行时的两个完整视图，搜索、筛选、分页、选择、排序与设置会实时同步。窄侧边栏使用双行紧凑工具栏，两个 Switcher 的当前项显示图标与文字、其余项仅显示图标；搜索默认收起，并用更小图像卡片优先保持至少三列。Gallery 的来源、查询、频道、筛选、页码、随机模式、浏览/已选视图、单选/多选、提示词规则、当前选择与顺序，以及侧边栏搜索框展开状态都会随 Dashboard 预设保存和切换；Gallery 不参与参数联动。只读徽章显示该节点当前的启用、静音或绕过状态，不反向修改节点模式。

- 搜索同时接受 booru 风格标签查询和粘贴的提示词文本；Danbooru 提供日/周/月排行榜，AI TAG 提供月榜。
- 打开“随机抽卡”后会在当前来源、查询、频道和分级范围内随机抽取图片；连续抽取与向下浏览不会重复已经展示的帖子，关闭模式或改变范围后重新开始。随机结果仍遵循本机内容黑名单。
- 站点凭据、默认值、全局内容黑名单、输出过滤标签、超时与图像缓存预算位于 **ComfyUI 设置 → Aaalice Nodes → Booru Gallery**；凭据与缓存保存在当前 ComfyUI 用户目录，不进入工作流 JSON。Gelbooru 需要官方 User ID 和 API Key，也可把账户页提供的完整 `&api_key=…&user_id=…` 片段直接粘贴到 API Key 输入框。
- 网络错误横幅可点击查看、复制完整诊断并重试。出现 SSL 证书校验失败时，请检查系统时间、HTTPS 代理或抓包软件证书以及系统受信任根证书；插件不会关闭 HTTPS 证书校验。
- 内容黑名单由本机对站点列表响应做精确过滤，不会作为排除标签发送给远端、占用搜索标签槽位或额外要求登录；它在当前 ComfyUI 用户范围内全局保存，输入支持英文逗号、中文逗号、顿号和换行分隔。输出过滤标签不隐藏帖子，只从节点输出与复制的提示词中剔除（适合 watermark、画师名等），两者都在提示词处理浮层与详情标签菜单中维护。
- Danbooru 支持收藏读写；Gelbooru 仅支持读取。
- 悬浮预览会显示大图、分辨率、评分、收藏数、分级与分类标签；卡片与帖子详情都可下载原图，详情另提供在新标签页打开原图的入口；安装 ComfyUI-Autocomplete-Aaalice 后，搜索、排除标签与输出过滤等标签输入框获得其标签补全，悬浮预览和帖子详情同时显示标签翻译；安装 prompt-assistant 后，卡片可通过其视觉分析反推图像。

</details>

<details>
<summary><strong>FetchFromKrita — 执行时 Krita 快照</strong></summary>

每次执行读取 Krita 活动文档的可见合成图像作为 `IMAGE`，当前选区作为同尺寸 `MASK`（无选区时全黑）。先关闭 Krita，然后打开 **ComfyUI 设置 → Aaalice Nodes → Krita** 安装并启用随附的 `Aaalice Comfy Bridge`，再启动 Krita 并测试连接。

Krita、ComfyUI 与 Bridge 必须运行在同一台机器。缺少 Bridge、Krita 离线、无活动文档或导出失败都会让节点明确失败，绝不返回旧快照或占位图。

</details>

<details>
<summary><strong>SimpleStringSplit — 清理式文本拆分</strong></summary>

输入文本并选择 `,` 或 `|` 作为分隔符。节点逐段去除空白、移除空段，并把剩余字符串作为列表返回。

</details>

## 🖥️ Aaalice 工作区

从 ComfyUI 左侧打开 **Aaalice 工作区**，其中包含三个视图：**参数控制**（看板页面）、**组导航**和**词库**。

### 👁️ 打开时聚焦

右键任意节点选择 **👁️ 打开时聚焦**，将其设为该工作流唯一的聚焦目标，并可选设置 X/Y 偏移与目标缩放。之后每次打开工作流，ComfyUI 会静默进入目标所在子图并把画布聚焦到它；标记其它节点会替换原目标。

### 🎛️ 参数控制看板

- 右键兼容节点选择 **📌 添加参数到侧边栏…**，勾选参数和目标页面，然后在侧边栏实时修改原节点值。页面不会自动生成。
- **搜索参数**跨所有页面搜索实时参数标题，结果按页面分组且可直接编辑。
- 卡片附加能力：**设置数值范围…** 只为侧边栏滑条覆盖范围；**添加注释…** 为卡片或分隔线附加 Markdown 说明（随工作流保存），通过低干扰信息徽章查看。
- **🔗 绑定到侧边栏已有参数…** 让一张卡片驱动多个兼容参数；联动写入在同一个可撤销事务中完成，失败时整体回滚。
- **编辑布局** 在十二列网格上吸附式调整卡片、分隔线、命名布局组、框选多选与整理布局；拖动时会预览真实插入位置和碰撞下推，靠近边缘可连续滚动，也可用 `Alt`+方向键微调选区。
- 卡片变高、变矮、变宽或变窄时，内部控件会同步重排：多行文本和执行结果使用可滚动剩余空间，标签在高卡片中换行，窄卡片中的多项选择自动改为多行。
- 绑定使用稳定身份，不依赖节点标题或位置。失效卡片会说明原因并提供模糊搜索重绑，页面菜单可一次性复核全部失效参数；节点被替换且匹配唯一时会自动重挂。侧边栏不会进入子图内部搜索。
- 兼容来源：仅由原生 `INT`、`FLOAT`、`BOOLEAN`、`STRING`、`COMBO` 控件组成的简单节点、子图整体公开的 widget（包括多行 `STRING`），以及 ComfyUI 原生 `Preview Image`、`Preview as Text`、`Compare Images` 视图（带导航和全窗口查看器）。带未知自定义面板的节点需要显式适配器。

### 💾 侧边栏预设

紧凑的预设选择器整体保存和切换看板的页面、布局组、绑定、卡片几何与兼容参数值，包括每个 Seed 的数值和执行后行为。常见模型参数（UNet、CLIP、VAE、Checkpoint、Upscale Model 等）在预设路径与本机目录结构不同时，会按文件名查找唯一的嵌套路径并在确认后应用；模型缺失或同名路径有歧义时会明确列出页面、组件和参数，同时仍写入新预设值，避免静默沿用上一个预设的模型。组管理组件只随预设切换各组的开关状态；颜色范围、排序、关闭模式和组联动关系始终由 Manager 节点共享。本地修改后预设名称以斜体加末尾 `*` 标记；用 `Ctrl`/`Cmd`+`S` 保存工作流时也会同步提交当前修改到启用的预设。预设保存在工作流文件内，分享工作流（包括通过 Aaalice Workflow Hub）后接收方即可获得你随工作流携带的预设。也可以通过同一套校验流程导出、导入便携 JSON 备份。

“导入预设”默认使用“仅导入数值”：先复制你选择的基础预设，再把旧备份中精确匹配或可唯一确认的同语义参数套用到新副本，并直接切换到该副本；基础预设和导入前正在编辑的 Dashboard 都不会被改写，导入前可命名新预设。选择“布局和数值”也会额外创建命名预设；若文件含失效绑定，确认前会明确警告。歧义、失效或不兼容的非模型值会列出并跳过；模型值统一使用上文的嵌套路径确认与缺失模型处理规则。

### 🎚️ 调整档案

工具栏的 **调整档案** 按钮打开保存在本机 ComfyUI 的全局参数覆盖档案。规则按来源节点分组，可搜索并直接编辑文本、选择、开关、数值和 Seed 目标值；顶部显示当前规则、来源与待处理数量，同名参数会标注组内序号，避免调错。编辑会自动保存在本机，只有底部 **套用 N 条规则** 才会修改当前侧边栏。每条规则通过专用搜索选择界面选定一个侧边栏组件卡片，多绑一卡片的联动目标会随主目标一起写入；候选覆盖侧边栏所有页面并标注所在页面，已有规则的组件不再重复出现。套用档案会在同一个事务中写入所有可匹配规则，失败时整体回滚。无法匹配或校验的规则会列入复核清单，不会静默跳过。档案不随工作流保存，因此无论打开哪份工作流都可以使用自己的档案。

### 🧭 组导航

**组导航**用精选导航列表取代画布悬浮入口。只添加真正需要导航的可视组，并可为每项设置目标偏移和 10%–300% 的目标缩放。点击组行可直接跳转；按住默认的反引号键（`Backquote`，Tab 上方）会在画布指针附近打开组跳转轮盘，指向目标后松开即可跳转，滚轮可切换轮盘页面。轮盘激活键可改为其它单个按键。导航项、轮盘按键与视图设置随工作流保存。

### 📚 词库

**词库**视图管理词条、扁平分类、多归属收藏夹、标签和每条词条的一张预览图。已选词条可一次移动、导出或事务化删除，每条词条的完整提示词可一键复制。词库可将全部或当前筛选结果导出为带哈希资产的 ZIP，并可导入当前归档以及旧版 `data.json + preview/` 导出，导入前提供预检与逐条冲突选择。传输上限 2 GiB，全程流式处理而非读入内存。

## ⚠️ 兼容性与限制

- 本预览版不为旧版包创建的工作流提供兼容层。
- `PromptAssistantBridge` 已在 0.7.0 移除、`PromptCleaningMaid` 已在 0.8.0 移除；包含它们的工作流需要先替换或移除这些节点。
- 暂不支持 App Mode。
- QuickGroupManager 只控制当前图中的可视组，联动规则不会跨管理器传播。
- SimpleNotify 只在发起前端提醒，不表示整个工作流完成或队列已清空。
- BooruGalleryNode 依赖第三方站点 API 与媒体主机；可用性、凭据与收藏行为由各站点控制。仅可选择静态 JPG、PNG、WebP、GIF 帖子。
- FetchFromKrita 需要本机运行已启用随附 Bridge 的 Krita 且有活动文档。
- 词库数据保存在当前 ComfyUI 用户目录，不随工作流保存；迁移安装时请单独导出。
- 侧边栏自动支持简单原生标量/文本/下拉节点与子图公开 widget；带未知自定义控件或 DOM 面板的节点需要显式适配器。

## 💬 反馈与许可

在 [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues) 反馈 bug 和功能建议。

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
