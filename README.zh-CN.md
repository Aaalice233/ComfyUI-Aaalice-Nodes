<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

# ComfyUI-Aaalice-Nodes

面向 ComfyUI 的紧凑参数控件和工作流工具。

> 当前为已发布的预览版。首次稳定发布前，工作流格式和节点行为仍可能调整；本包不会迁移 ComfyUI-Danbooru-Gallery 的旧数据。

| 状态 | 进度 | 下一项 |
|:---:|:---:|:---:|
| 重置进行中 | **4 / 25** | #3 `EnumSwitch` |

## 环境要求

- 支持 V3 自定义节点的较新 ComfyUI。
- 支持经典画布和 Nodes 2.0；暂不支持 App Mode。
- 内置 English 和简体中文界面；其它语言回退到 English。

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
| `ParameterPanel` | `Aaalice/control` | 管理一组参数并直接输出最多 32 路值。 |
| `ParameterReceiver` | `Aaalice/control` | 绑定 ParameterPanel，将对应的 KJ Get 收束到一个紧凑输出节点。 |
| `SimpleStringSplit` | `Aaalice/tools` | 按逗号或竖线拆分文本，去除首尾空白和空段。 |

<details>
<summary><strong>重置清单与优先级队列</strong></summary>

稳定编号继承自重置计划，调整优先级时不重编号；每次只实现队列中的一项。`ParameterReceiver` 现承接 #16 的职责，该节点原名为 `ParameterBreak`。

### 已完成

| # | 当前实现 | 用途 |
|---:|---|---|
| 0 | 包骨架 | 可加载的 V3 包、节点域、i18n 与 `WEB_DIRECTORY`。 |
| 1 | `SimpleStringSplit` | 将文本拆分为清理后的字符串列表。 |
| 15 | `ParameterPanel` | 创作并直接输出最多 32 个参数。 |
| 16 | `ParameterReceiver` | 通过稳定的透传槽接收面板对应的 KJ Get 值。 |

### 已砍

| # | 旧节点 ID | 原因 |
|---:|---|---|
| 2 | `SimpleValueSwitch` | 不在范围内，实用价值不足，不重写。 |

### 优先级队列

| 顺序 | # | 旧节点 ID | 域 | 用途 |
|---:|---:|---|---|---|
| 1 | 3 | `EnumSwitch` | tools | 按枚举选通。 |
| 2 | 4 | `SimpleNotify` | tools | 执行时发送通知。 |
| 3 | 5 | `WorkflowDescription` | tools | 在工作流画布上添加说明。 |
| 4 | 6 | `VAEImageBatchFix` | tools | 修正 VAE batch 形态。 |
| 5 | 7 | `ModelNameExtractor` | tools | 提取可读模型名。 |
| 6 | 8 | `ResolutionMasterSimplify` | tools | 分辨率与尺寸辅助。 |
| 7 | 9 | `SimpleLoadImage` | tools | 加载本地图像和遮罩。 |
| 8 | 10 | `PromptCleaningMaid` | prompt | 清洗并去重标签。 |
| 9 | 11 | `PromptSelector` | prompt | 从清单中选择提示词。 |
| 10 | 12 | `CharacterFeatureSwapNode` | prompt | 交换角色特征。 |
| 11 | 13 | `SimpleImageCompare` | media | 交互对比图像。 |
| 12 | 14 | `SimpleCheckpointLoaderWithName` | media | 加载模型并输出名称与预览。 |
| 13 | 17 | `GroupIsEnabled` | control | 输出组是否启用。 |
| 14 | 18 | `GroupMuteManager` | control | 批量静音工作流组。 |
| 15 | 19 | `GroupIgnoreManager` | control | 批量忽略工作流组。 |
| 16 | 20 | Quick Group Navigation | control | 通过浮动界面快速导航工作流组。 |
| 17 | 21 | `DanbooruGalleryNode` | gallery | 搜索图库图像与标签。 |
| 18 | 22 | `MultiCharacterEditorNode` | gallery | 编辑多角色提示词。 |
| 19 | 23 | `SaveImagePlus` | media | 提供更多控制的图像保存。 |
| 20 | 24 | `FetchFromKrita` | krita | 从 Krita 拉取内容。 |
| 21 | 25 | `OpenInKrita` | krita | 在 Krita 中打开内容；随 #24 一起实现。 |

</details>

<details>
<summary><strong>ParameterPanel — 参数创作与直接输出</strong></summary>

新建面板默认包含 `Steps`、`CFG`、`Sampler`、`Scheduler`、`Denoise` 和 `Seed`。采样器与调度器选项跟随当前 ComfyUI。

- 直接在节点上修改参数值。
- 右键节点并选择 **⚙️ 编辑参数…**，可新增、重命名、重排、复制、删除参数或编写说明。
- 将每个可见输出直接连接到下游输入。参数重命名或重排后，连线仍跟随原参数。
- Seed 支持 fixed、increment、decrement、randomize；节点内的锁定按钮用于在 fixed 与 randomize 之间快速切换。
- 安装 KJ Set/Get 后，节点菜单会提供 **🔗 为所有参数创建并连接 KJ Set**；新建的折叠 Set 会在面板右侧紧凑排列。

删除已有连线的参数时需要确认，因为对应连线必须断开。一个面板最多包含 32 个会产生值的参数；分隔项不占输出。

</details>

<details>
<summary><strong>ParameterReceiver — 紧凑的 KJ Get 接收器</strong></summary>

`ParameterReceiver` 的绑定与同步需要 KJNodes 的 Set/Get 支持。请在源面板所在的同一张图中创建接收器，然后右键选择 **🔗 绑定参数面板…**。

- 首次绑定会复用已有 KJ Set，并在补齐缺失 Set 前询问确认；对应的折叠 Get 会排列在接收器左侧。
- 参数改名和面板标题变化会自动刷新。参数新增、删除或重排后，底部状态变为 **需要同步**；使用 **🔄 从参数面板同步** 应用结构变化。
- **🎯 定位参数面板** 会居中显示源面板；**✂️ 解除绑定** 会在确认受影响连线后清理仅由接收器使用的 Get。
- 源面板被删除时，接收器保留已保存的槽位与连线快照，并显示 **源面板不存在**，之后可以显式重新绑定。

KJNodes 对整个包是可选依赖。未安装时，包含 ParameterReceiver 的工作流仍可加载，但绑定和同步会明确报错，不会模拟路由。

</details>

<details>
<summary><strong>SimpleStringSplit — 清理式文本拆分</strong></summary>

输入文本并选择 `,` 或 `|` 作为分隔符。节点会清理每段首尾空白、丢弃空段，并以字符串列表输出剩余内容。

</details>

## 兼容性与限制

- 预览版不兼容旧包创建的工作流数据。
- 暂不支持 App Mode。
- 前端结构变更后，已有节点实例可能需要在刷新后重新创建。
- ParameterReceiver 只绑定当前图中的 ParameterPanel，不会跨子图搜索。

如果仍需旧节点，请单独保留 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

## 反馈与许可

问题和功能建议请提交到 [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues)。

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
