<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

# ComfyUI-Aaalice-Nodes

面向 ComfyUI 的紧凑参数控件和工作流工具。

> 当前为已发布的预览版。首次稳定发布前，工作流格式和节点行为仍可能调整。旧版工作流不会自动迁移；词库管理可以导入下文列出的受支持旧版词库导出文件。

## 环境要求

- 支持 V3 自定义节点的较新 ComfyUI。
- 支持经典画布和 Nodes 2.0；暂不支持 App Mode。
- 内置 English 和简体中文界面；其它语言回退到 English。

## 界面行为

- Classic 与 Nodes 2.0 均保留 ComfyUI 原生节点背景、外轮廓和圆角。
- Slider、布尔开关等普通激活控件会跟随当前节点颜色；中性、警告、错误、颜色筛选和多档模式继续保留各自语义，不会被统一染色。

## 安装

### ComfyUI Manager（推荐）

1. 打开 **ComfyUI Manager**，进入自定义节点管理页面。
2. 搜索 `ComfyUI-Aaalice-Nodes` 或 Registry 包 ID `comfyui-aaalice-nodes`。
3. 点击 **Install**，完成后重启 ComfyUI 并刷新浏览器。

Manager 会安装 Registry 中已发布的 [`comfyui-aaalice-nodes`](https://registry.comfy.org/nodes/comfyui-aaalice-nodes) 及其声明依赖。日常安装和更新推荐使用 Manager。

### 手动 Git 安装

仅在需要最新开发版本或指定提交时使用 Git。将仓库克隆到 `ComfyUI/custom_nodes`，使用 ComfyUI 所在的 Python 环境安装依赖，然后重启：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt
```

## 更新与故障排查

- Registry 安装请通过 ComfyUI Manager 更新。
- 手动 Git 安装可在仓库目录执行 `git pull` 更新。
- Python 更新后重启 ComfyUI；前端更新后硬刷新浏览器。
- 如果结构更新后已有节点仍保留旧引脚或控件，请删除该节点实例并重新创建。

## 已包含节点

| 节点 | 分类 | 用途 |
|---|---|---|
| `QuickGroupManager` | `Aaalice/control` | 按颜色范围启用、静音或绕过可视组，并配置排序与联动规则。 |
| `GroupIsEnabled` | `Aaalice/control` | 在队列提交时报告可视组是否被完全禁用。 |
| `GroupLogicProbe` | `Aaalice/control` | 将多个组的启用/禁用探测按 AND/OR 组合成单个布尔值，用于懒执行分支。 |
| `ResolutionPreset` | `Aaalice/tools` | 通过预设、精确输入或二维拖拽选择并输出对齐的宽高。 |
| `SimpleStringSplit` | `Aaalice/tools` | 按逗号或竖线拆分文本，去除首尾空白和空段。 |
| `SimpleNotify` | `Aaalice/tools` | 执行到达时按开关发送桌面通知和提示音，并原样透传输入值。 |
| `PromptSelector` | `Aaalice/prompt` | 从词库中选择、排序并加权输出可复用提示词条。 |
| `CharacterFeatureSwapNode` | `Aaalice/prompt` | 从参考角色迁移选中特征，并保持原提示词的语言和格式。 |
| `BooruGalleryNode` | `Aaalice/gallery` | 在 Danbooru、Gelbooru、Safebooru 与 AI TAG 的虚拟瀑布流中搜索，并按顺序输出图片与对应提示词。 |
| `FetchFromKrita` | `Aaalice/krita` | 将 Krita 当前活动文档的可见合成图与选区读取为 `IMAGE` 和 `MASK`。 |

<details>
<summary><strong>ResolutionPreset — 精确对齐的宽高</strong></summary>

可以选择九个不绑定模型的内置尺寸、保存个人预设、直接输入宽高，也可以拖动画幅板的宽度柄、高度柄和角柄。节点输出精确的 `INT` 宽高，可直接连接 `EmptyLatentImage` 等节点。

像素对齐支持 8、16、32、64 四档。手动输入不合法时会保留旧值，并给出最近合法尺寸的一键采用入口。拖拽范围支持 2048、4096、8192；完成编辑后，如果当前范围容纳不下新尺寸，会自动升到合适档位。个人预设会保存自身的对齐方式，并存入当前 ComfyUI 用户目录。

宽高比和百万像素只用于只读辨认。本节点不会按百万像素计算目标尺寸、推荐模型、创建图像或 Latent，也不负责裁剪、缩放和 batch。需要“宽高比 + 百万像素”计算时，请使用 ComfyUI 官方 `ResolutionSelector`。

</details>

<details>
<summary><strong>FetchFromKrita — 执行时获取 Krita 快照</strong></summary>

节点没有输入。每次执行都会读取 Krita 当前活动文档的可见合成图并输出 `IMAGE`，同时把当前选区输出为同尺寸 `MASK`。没有选区时输出全黑蒙版；确实存在但内容全黑的选区仍会被保留为合法选区，不会被误判为“无选区”。

先关闭 Krita，再前往 **ComfyUI 设置 → Aaalice Nodes → Krita** 安装并启用或修复并重新启用随包提供的 `Aaalice Comfy Bridge`。该操作会自动更新 Krita 的插件开关；之后启动 Krita 并测试连接即可。Bridge 状态和最近一次获取摘要只用于界面反馈，不会写入工作流 JSON。

Krita、ComfyUI 与 Bridge 必须运行在同一台机器上。Bridge 缺失、Krita 未连接、没有活动文档、协议不兼容、导出失败、超时或媒体无效都会让节点明确失败；节点不会返回旧快照、占位图或备用输入。它不启动或关闭 Krita，不选择文档或图层，不等待编辑，也不提供双向编辑会话。

</details>

<details>
<summary><strong>QuickGroupManager — 快速可视组控制</strong></summary>

QuickGroupManager 不参与工作流执行，也没有输入或输出引脚。它会发现当前图中的可视组，每个纳管组只提供一个启用开关；节点顶栏的 **静音 / 绕过** Switcher 统一决定关闭组的实际模式。

- 使用过滤图标管理全部组、多个组颜色或无颜色组。激活时图标颜色反映当前筛选，组条目保持紧凑且不重复显示颜色块；多个 Manager 可以分别使用独立颜色范围。
- 拖动组行即可排序；过滤后的列表仍可排序，每个 Manager 独立保存顺序。
- 点击任意组行的取景框图标，即可在画布中完整定位该可视组。
- 点击组行的联动图标，可配置该组开启或关闭时其它组应执行的动作。规则可以跨颜色，但只在发起操作的 Manager 内继续级联。
- 切换静音/绕过时，仅把当前 Manager 颜色范围内已经关闭的组统一转换，并记录为一次可撤销操作。
- 外部组模式变化和其它 Manager 的操作只刷新显示，不会触发本节点联动。

节点只控制当前图中的组。组内的子图节点会像普通节点一样切换，但不会递归修改子图内部图。

</details>

<details>
<summary><strong>GroupIsEnabled — 可视组状态探测</strong></summary>

在节点下拉框中选择一个可视组。队列提交时，节点快照该组成员的模式并报告单个布尔值：**已禁用** 仅在组内所有节点都已静音或绕过时为 True；组完全在运行或只被部分禁用时为 False。同名组按出现顺序加序号区分，探测器自身的模式不计入判定。

探测器必须放在被观察组之外：被静音或绕过的组不会执行，组内的探测器也不例外。组被重命名或删除、或组内没有节点时，执行会显式失败而不是猜测状态。

</details>

<details>
<summary><strong>GroupLogicProbe — 多组 AND/OR 探测</strong></summary>

在面板中添加多条组判断条件，每条由一个可视组和一个期望状态（**已启用** 或 **已禁用**）组成，再用顶部的 **AND / OR** Switcher 组合。队列提交时，节点快照所有被引用组的成员模式并输出单个布尔值：AND 要求全部条件满足，OR 要求至少一条满足。部分禁用（混合态）的组对两种期望都不匹配。

将结果连接到 Impact Pack 的 `ImpactConditionalBranch` 等懒执行条件分支的 cond 输入——未选中分支的上游完全不执行，这是组关闭时跳过整段工作流的标准用法。引用了已重命名或已删除组的条件行会在面板中标注警告，并在执行时显式失败。

</details>

<details>
<summary><strong>SimpleNotify — 执行到达提醒</strong></summary>

连接任意类型的值后，执行到达该节点时提醒一次，再将输入值原样传给下游。桌面通知和内置提示音可独立开关，并可调节音量。通过节点右键菜单的 **🔔 启用并测试提醒** 申请浏览器权限并测试当前启用的提醒方式。

提醒只证明执行已经到达该节点，不会等待其它并行分支或整个队列清空。浏览器权限和自动播放策略可能阻止桌面通知或声音；无前端页面的 API、CLI 执行不会产生提醒。

</details>

<details>
<summary><strong>PromptSelector — 有序词库选择</strong></summary>

使用搜索和分类/收藏夹筛选后，可以跨分类选择任意数量的词条。安装 ComfyUI-Autocomplete-Aaalice 后，搜索框同样可使用其标签与中文补全。列表默认把最近排队使用过的词条放在前面，点击时钟按钮可恢复词库手工顺序；最近使用记录只属于当前 ComfyUI 用户的词库，不进入工作流或词库备份。每行直接以预览缩略图作为选择入口，选中后显示勾选覆层；无图词条使用不会打开大图的占位图。鼠标悬停或键盘聚焦带图词条时可以查看大图；条目右侧提供编辑和收藏图标，收藏时选择目标收藏夹，再点一次即可取消该词条的全部收藏。选择顺序属于当前节点，并直接决定输出顺序。已选词条悬停时会显示权重控件：滚轮或方向键调整，按住 `Shift` 微调，点击重置为 `1`；权重范围为 0–20。可选输入 `prefix_prompt` 始终最先输出，节点右键菜单可修改分隔符，默认是 `, `。

PromptSelector 保存稳定词条引用，不复制正文。修改词库词条会更新所有引用节点；删除被引用词条后，节点保留明确的失效引用并阻止执行，直到用户移除或恢复该词条，不会按名称静默猜测替代项。

</details>

<details>
<summary><strong>BooruGalleryNode — 多站点有序画廊</strong></summary>

选择 Danbooru、Gelbooru、Safebooru 或 AI TAG 后搜索和筛选帖子，并在自动续载的自然比例瀑布流中跨页多选。搜索同时接受 booru 风格标签查询和粘贴的 prompt 风格文本：逗号与多余空白会被归一化，空格短语在不能作为独立标签成立时会自动修复为下划线标签，因此补全插件按 prompt 格式插入的内容可以直接搜索。Danbooru 提供今日榜、周榜与月榜频道，AI TAG 提供月榜；紧凑页码控件会跟随当前可见结果页，刷新时回到第一页，也能不加载前面所有页面而直接跳转。“已选”页保存顺序，支持拖动排序和移除；每个已选帖子都能在本地编辑作者、版权、角色、通用和元数据五类标签，不会修改远端帖子。AI TAG 使用公开作品元数据，把图片 Prompt 作为 General 标签提供，不虚构 Rating 映射。`images` 与 `prompts` 按同一顺序一一对应；任何原图下载失败都会让节点整体明确失败，不跳项也不补占位黑图。

站点凭据、默认值、全局内容黑名单、新节点 Prompt 默认值、请求超时、悬停详情和原图缓存预算统一放在 **ComfyUI 设置 → Aaalice Nodes → Booru Gallery**。黑名单会从搜索、排行榜和收藏夹结果中隐藏精确匹配的标签，不修改输出提示词或已有选择。凭据与缓存只保存在当前 ComfyUI 用户目录，不进入工作流 JSON。Gelbooru 目前必须配置官方 User ID 和 API Key 才能浏览；未配置时，节点会直接引导打开 Gallery 设置，不再发起必然失败的匿名请求。Danbooru 支持读取和修改收藏；Gelbooru 只读取收藏，首版禁用收藏写入；Safebooru 与 AI TAG 不支持账户收藏。安装 [ComfyUI-Autocomplete-Aaalice](https://github.com/Aaalice233/ComfyUI-Autocomplete-Aaalice) 后，画廊搜索框可使用其标签与中文补全，帖子详情在中文界面下按词典、缓存与 DeepSeek 管线为标签附加中文译文；未安装时标签保持纯英文。每张卡片都可一键复制提示词；安装 [prompt-assistant](https://github.com/yawiii/ComfyUI-Prompt-Assistant) 后，卡片还可调用其视觉分析反推图像提示词，帖子详情也可以把图像本身复制到剪贴板。节点仍不内置完整标签数据库、远端标签编辑、Cookie 登录，也不迁移旧工作流或旧设置。

</details>

<details>
<summary><strong>CharacterFeatureSwapNode — LLM 角色特征迁移</strong></summary>

连接原提示词和参考角色提示词，然后用紧凑的特征标签选择需要迁移的内容。标签可以启用、停用、拖动排序、删除，也可以添加自定义特征描述。同一个默认指令同时处理自然语言、Tag 列表和混合提示词；结果保持原提示词的语言与格式，参考提示词缺少某项特征时会要求模型保留原特征。

前往 **ComfyUI 设置 → Aaalice Nodes → Character Feature Swap** 配置 DeepSeek API Key、模型、超时和思考强度。节点固定使用 DeepSeek 官方 API，不提供其它服务或自定义地址。思考默认关闭，也可以设为官方支持的“高”或“最高”；DeepSeek 会把“低”和“中”映射为“高”，因此界面不提供无实际差别的档位。API Key 只保存在当前 ComfyUI 用户目录，不会写入工作流 JSON。高级提示词模板可以修改或恢复默认值，但必须保留 `{original_prompt}`、`{character_prompt}` 和 `{target_features}`。

节点只面向单角色。多角色归属、区域提示词和角色分区编辑不属于本节点。实际替换由配置的外部模型完成，因此结果会受到服务可用性、模型能力和非确定性的影响。

</details>

<details>
<summary><strong>SimpleStringSplit — 清理式文本拆分</strong></summary>

输入文本并选择 `,` 或 `|` 作为分隔符。节点会清理每段首尾空白、丢弃空段，并以字符串列表输出剩余内容。

</details>

## Aaalice 工作区

右键任意节点并选择 **👁️ 打开时聚焦**，即可将它设为工作流唯一的聚焦目标。随后弹出的视图设置可以调整 X / Y 画布偏移和目标缩放比例。每次打开工作流时，ComfyUI 都会静默进入目标所在的子图并将画布聚焦到该节点；标记其他节点会自动替换之前的目标。

从 ComfyUI 左侧打开 **Aaalice 工作区**。**参数控制**中的页面全部由用户手工创建，不会自动生成。任意时刻都可以右键兼容节点，选择 **📌 添加参数到侧边栏…**，勾选参数和目标页面，然后在侧边栏实时修改原节点值。使用 **搜索参数** 可以跨所有页面搜索实时参数标题；结果仍按页面分组并直接显示同一批可编辑控件，因此可以连续修改所有采样器、调度器或其他匹配参数，不必逐页跳转。原生 Integer / Float 卡片可在右键菜单中选择 **设置数值范围…**，为当前侧边栏滑条单独设置最小值、最大值和步长，或恢复节点默认值；该显示设置随工作流、复制和侧边栏预设保存，不会修改节点参数定义或当前值。每张参数卡片和分隔线的右键菜单也提供 **添加注释…**：独立编辑器用一个 Switch 在 Markdown 源码和经过安全过滤的 CommonMark/GFM 预览间切换，提供常用格式按钮与键盘快捷键，说明随工作流、复制和侧边栏预设保存。仅在已有说明时显示低干扰的信息徽章；悬浮只给简短提示，点击才打开完整内容。若要让一张卡片同时控制多个兼容参数，可右键另一个节点并选择 **🔗 绑定到侧边栏已有参数…**；卡片徽标会显示目标数量，卡片右键菜单可检查、解除、同步或重新指定主参数。联动写入和 Seed 执行后行为会在一个工作流历史事务中更新全部目标，任一目标失败时整体回滚。页面使用结构化十二列网格，卡片宽高以整数网格单位自由调整；**编辑布局**负责吸附式缩放和移动、分隔线、可选命名布局组、多选、成组和整理布局。任意侧边栏空白区域或未选卡片都能直接起框，已选卡片仍可直接拖动；需要全选时使用显式“全选布局项”按钮，`Ctrl`/`Cmd`+`A` 不再作为侧边栏快捷键，也不会在焦点位于侧边栏时连带选中工作流节点。布局组可以组合不同节点的参数并作为一张组合卡片整体移动，解除整组不会删除其中的卡片。打组、解组、移动和缩放都会保留无关卡片及既有空隙，只有显式点击“整理布局”才会重新紧凑排列整页。

**组导航**用侧边栏中的精选导航列表取代画布悬浮入口。只需手动添加真正需要导航的可视组，并可为每个导航项设置包含 `Ctrl`、`Alt` 或 `Command` 的组合键、以画布坐标为单位的水平和垂直目标偏移，以及 10%–300% 的目标缩放倍率；点击整行或按下快捷键即可平滑移动到调整后的组视图。导航项和视图设置随工作流保存，组颜色、节点数量、启用状态和边界仍通过图事件实时更新。

侧边栏自动支持仅由原生 `INT`、`FLOAT`、`BOOLEAN`、`STRING`、`COMBO` 控件组成的简单节点、子图整体公开的兼容 widget，以及 ComfyUI 原生 `Preview Image`、`Preview as Text` 与 `Compare Images` 执行视图。`Preview Image` 会同步最近一次图像批次，支持切换图片和最高 800% 缩放的全窗口查看器；`Preview as Text` 会跟随节点的纯文本或 Markdown 模式，在只读滚动卡片中显示结果。图像对比卡片会同步最近一次 A/B 结果，支持交互分割与两侧独立切换 batch。点击对比图即可打开全窗口查看器；可通过滚轮或缩放按钮放大至 800%，拖动已放大的图像检查细节，移动指针即可直接对比，并通过双击或“适应屏幕”还原视图。侧边栏预设只保存卡片布局和绑定，不保存临时预览 URL。选项为空或尚未初始化的原生控件仍可建立绑定，并在选项或值出现前显示明确的暂不可用状态。侧边栏不会进入子图内部搜索。带自定义面板的节点不会被自动部分投影，需要节点作者或本包提供显式适配器。绑定使用稳定身份，不依赖节点标题或位置；无法解析的控件会保留并允许人工重新绑定。顶栏的紧凑侧边栏预设选择器会同时保存并切换完整页面布局、布局组、绑定、卡片宽高和兼容控件值，包括 Seed 控件的数值和执行后行为；修改后仍显示当前预设名称，并使用斜体和末尾 `*` 表示尚未保存，没有来源预设时只显示中性的“选择预设”占位。随后可以保存修改、放弃修改，或使用弹层顶栏的“新增预设”保存为另一套预设；按 `Ctrl`/`Cmd`+`S` 保存工作流时也会在同一步把当前修改写入启用的预设。预设随工作流文件一起保存：分享工作流（包括通过 Aaalice Workflow Hub 发布与安装）后，接收方打开工作流即可在自己的侧边栏预设中选择你随工作流携带的预设。导入便携 JSON 备份时会经过同一套校验，并创建和应用一个可命名的侧边栏预设；备份始终不包含词库。

**词库管理**用于维护词条、扁平分类、多归属收藏夹、标签和每条词条的一张预览图。已选操作栏可以移动、导出或以事务批量删除词条，也可以全选或清空当前筛选结果。词库始终包含一个不可删除的默认收藏夹，也可以按用途新建其他收藏夹。新分类会自动获得不同的识别色；在分类设置中可以修改颜色，并同步用于工作区和 PromptSelector 的分类标签与筛选项。可以导出完整词库或当前分类/收藏夹，ZIP 内包含 manifest 和哈希资源；支持导入新版 ZIP，以及旧版 `data.json + preview/` ZIP 或 JSON，并迁移标题、提示词、备注、分类、收藏夹、标签、预览图及已有分类颜色。导入文件、导出文件与解压总量上限均为 2 GiB，传输使用磁盘暂存和流式读写，不会将整个压缩包载入内存。导入前会预检新增、已有、冲突、重复和无效数据，冲突可选择保留本地、使用导入内容或创建副本。

## 兼容性与限制

- 预览版不兼容旧包创建的工作流数据。
- `PromptAssistantBridge` 已于 0.7.0 移除，因为提示词小助手已自带提示词优化节点；包含该节点的工作流请替换为提示词小助手自带节点。
- `PromptCleaningMaid` 已于 0.8.0 移除；包含该节点的工作流需要在执行前删除或替换它。
- 暂不支持 App Mode。
- 前端结构变更后，已有节点实例可能需要在刷新后重新创建。
- QuickGroupManager 只控制当前图中的可视组，联动规则不会跨 Manager 实例传播。
- SimpleNotify 只在发起执行的前端提醒，不代表整个工作流或队列已完成。
- CharacterFeatureSwapNode 仅支持 DeepSeek 官方 API，需要有效的 DeepSeek API Key 和可用模型；API 可用性、费用、隐私与输出质量由 DeepSeek 决定。
- BooruGalleryNode 依赖第三方站点 API 与媒体主机；网络、凭据、站点限制、帖子元数据和收藏行为由各站点控制。只能选择静态 JPG、PNG、WebP 和 GIF 帖子。
- FetchFromKrita 需要本机 Krita 正在运行、随包 Bridge 已启用且存在活动文档。每次执行只读取一个活动文档，不支持远程或持续编辑会话。
- 词库保存在当前 ComfyUI 用户目录，不会嵌入工作流；跨安装迁移工作流时需要单独导出词库。
- 侧边栏自动支持简单原生标量、文本和下拉节点及子图公开 widget。只要节点含未知自定义 widget 或 DOM 面板，就不会自动做不完整投影，必须使用显式适配器。

如果仍需旧节点，请单独保留 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

## 反馈与许可

问题和功能建议请提交到 [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues)。

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
