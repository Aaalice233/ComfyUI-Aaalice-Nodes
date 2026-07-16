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
| 重置进行中 | **6 / 20 个节点** | #10 `PromptCleaningMaid` |

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
| `QuickGroupManager` | `Aaalice/control` | 按颜色范围启用、静音或绕过可视组，并配置排序与联动规则。 |
| `EnumSwitch` | `Aaalice/tools` | 根据精确匹配的字符串，只执行并输出对应分支。 |
| `SimpleStringSplit` | `Aaalice/tools` | 按逗号或竖线拆分文本，去除首尾空白和空段。 |
| `SimpleNotify` | `Aaalice/tools` | 执行到达时按开关发送桌面通知和提示音，并原样透传输入值。 |

<details>
<summary><strong>EnumSwitch — 惰性枚举选通</strong></summary>

- `selector` 精确匹配 1–32 个分支 key；未匹配或目标分支未连接时明确报错。
- 只执行选中的 lazy 分支，所有分支共享同一个连接类型。
- 独立使用时，右键选择 **⚙️ 编辑分支…** 管理分支。
- 直接连接 ParameterPanel 或 ParameterReceiver 的枚举/下拉输出时会自动识别；选项变化后通过警告图标显式同步，并保留未变化分支的连线。

</details>

<details>
<summary><strong>ParameterPanel — 参数创作与直接输出</strong></summary>

新建面板默认包含 `Steps`、`CFG`、`Sampler`、`Scheduler`、`Denoise` 和 `Seed`。采样器与调度器选项跟随当前 ComfyUI。

- 直接在节点上修改参数值。
- 右键节点并选择 **⚙️ 编辑参数…**，可新增、重命名、重排、复制、删除参数或编写说明。
- 自定义枚举和下拉选项每行填写一个值，且不能重复。
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
<summary><strong>QuickGroupManager — 快速可视组控制</strong></summary>

QuickGroupManager 是没有 Prompt 输入输出的纯前端控制节点。它会发现当前图中的可视组，每个纳管组只提供一个启用开关；节点顶栏的 **静音 / 绕过** Switcher 统一决定关闭组的实际模式。

- 使用颜色图标管理全部组、多个组颜色或无颜色组；多个 Manager 可以分别使用独立颜色范围。
- 拖动组行即可排序；过滤后的列表仍可排序，每个 Manager 独立保存顺序。
- 点击组行的联动图标，可配置该组开启或关闭时其它组应执行的动作。规则可以跨颜色，但只在发起操作的 Manager 内继续级联。
- 切换静音/绕过时，仅把当前 Manager 颜色范围内已经关闭的组统一转换，并记录为一次可撤销操作。
- 外部组模式变化和其它 Manager 的操作只刷新显示，不会触发本节点联动。

节点只控制当前图中的组。组内的子图节点会像普通节点一样切换，但不会递归修改子图内部图。

</details>

<details>
<summary><strong>SimpleNotify — 执行到达提醒</strong></summary>

连接任意类型的值后，执行到达该节点时提醒一次，再将输入值原样传给下游。桌面通知和内置提示音可独立开关，并可调节音量。通过节点右键菜单的 **🔔 启用并测试提醒** 申请浏览器权限并测试当前启用的提醒方式。

提醒只证明执行已经到达该节点，不会等待其它并行分支或整个队列清空。浏览器权限和自动播放策略可能阻止桌面通知或声音；无前端页面的 API、CLI 执行不会产生提醒。

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
- QuickGroupManager 只控制当前图中的可视组，联动规则不会跨 Manager 实例传播。
- SimpleNotify 只在发起执行的前端提醒，不代表整个工作流或队列已完成。

如果仍需旧节点，请单独保留 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

## 反馈与许可

问题和功能建议请提交到 [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues)。

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
