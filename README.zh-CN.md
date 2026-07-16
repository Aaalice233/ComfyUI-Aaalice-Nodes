<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

# ComfyUI-Aaalice-Nodes

面向 ComfyUI 的紧凑参数控件和工作流工具。

> 当前为已发布的预览版。首次稳定发布前，工作流格式和节点行为仍可能调整；本包不会迁移 ComfyUI-Danbooru-Gallery 的旧数据。

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

## 使用 ParameterPanel

新建面板默认包含 `Steps`、`CFG`、`Sampler`、`Scheduler`、`Denoise` 和 `Seed`。采样器与调度器选项跟随当前 ComfyUI。

- 直接在节点上修改参数值。
- 右键节点并选择 **⚙️ 编辑参数…**，可新增、重命名、重排、复制、删除参数或编写说明。
- 将每个可见输出直接连接到下游输入。参数重命名或重排后，连线仍跟随原参数。
- Seed 支持 fixed、increment、decrement、randomize；节点内的锁定按钮用于在 fixed 与 randomize 之间快速切换。
- 安装 KJ Set/Get 后，节点菜单会提供 **🔗 为所有参数创建并连接 KJ Set**；新建的折叠 Set 会在面板右侧紧凑排列。

删除已有连线的参数时需要确认，因为对应连线必须断开。一个面板最多包含 32 个会产生值的参数；分隔项不占输出。

## 使用 ParameterReceiver

`ParameterReceiver` 的绑定与同步需要 KJNodes 的 Set/Get 支持。请在源面板所在的同一张图中创建接收器，然后右键选择 **🔗 绑定参数面板…**。

- 首次绑定会复用已有 KJ Set，并在补齐缺失 Set 前询问确认；对应的折叠 Get 会排列在接收器左侧。
- 参数改名和面板标题变化会自动刷新。参数新增、删除或重排后，底部状态变为 **需要同步**；使用 **🔄 从参数面板同步** 应用结构变化。
- **🎯 定位参数面板** 会居中显示源面板；**✂️ 解除绑定** 会在确认受影响连线后清理仅由接收器使用的 Get。
- 源面板被删除时，接收器保留已保存的槽位与连线快照，并显示 **源面板不存在**，之后可以显式重新绑定。

KJNodes 对整个包是可选依赖。未安装时，包含 ParameterReceiver 的工作流仍可加载，但绑定和同步会明确报错，不会模拟路由。

## SimpleStringSplit

输入文本并选择 `,` 或 `|` 作为分隔符。节点会清理每段首尾空白、丢弃空段，并以字符串列表输出剩余内容。

## 兼容性与限制

- 预览版不兼容旧包创建的工作流数据。
- 暂不支持 App Mode。
- 前端结构变更后，已有节点实例可能需要在刷新后重新创建。
- ParameterReceiver 只绑定当前图中的 ParameterPanel，不会跨子图搜索。

如果仍需旧节点，请单独保留 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

## 反馈与许可

问题和功能建议请提交到 [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues)。

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
