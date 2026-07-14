<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

# ComfyUI-Aaalice-Nodes

[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的重置版：按确认范围重写，对齐 ComfyUI 新前端与扩展 API，并有选择地精简。

| 状态 | 进度 | 下一跳 | 界面语言 | 许可 |
|:----:|:----:|:------:|:--------:|:----:|
| 重置进行中 | **4 / 25** | #3 `EnumSwitch` | en + zh | [MIT](./LICENSE) |

- **不是**旧包的直接替代品。当前节点包处于未发布的重构状态；首次稳定发布前，工作流数据和前端协议可能直接变更，不提供迁移兼容。
- 显示语言跟随 ComfyUI **设置 → 语言**。
- 所有节点均同时面向经典节点模式与 **[Nodes 2.0](https://docs.comfy.org/interface/nodes-2)**；当前暂不考虑 App Mode。
- Registry：[comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes)  
  *（版本仍在扫描时，列表节点数可能为空）*

---

## 目录

1. [安装](#安装)
2. [语言（i18n）](#语言i18n)
3. [Parameter Panel 与 Operation Panel](#parameter-panel-与-operation-panel)
4. [重置清单](#重置清单)
5. [参与贡献](#参与贡献)
6. [许可](#许可)

---

## 安装

### Manager / 扩展

1. 打开 ComfyUI → Manager / 扩展。
2. 搜索 **`ComfyUI-Aaalice-Nodes`** 或 **`comfyui-aaalice-nodes`**。
3. 安装 → **重启 ComfyUI**。
4. 画布右键 → **Aaalice → tools / …**

若列表里还没有：Registry 版本可能仍在扫描。见 [发布说明](https://docs.comfy.org/registry/publishing) 与 `.github/workflows/publish.yml`。

### Git（手动）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt   # 当前可为空；有依赖时再装
```

重启 ComfyUI。依赖以 `requirements.txt` / `pyproject.toml` 为准。

> 需要完整旧功能时，请继续使用 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

---

## 语言（i18n）

| 语言 | 作用 |
|------|------|
| `en` | 基准 / 回退 |
| `zh` | 完整简体中文 |

不维护其它 locale。未覆盖的界面语言回退英文。工作流 JSON 使用英文稳定 id。

```text
locales/en|zh/{ main, nodeDefs, settings, commands }.json
js/i18n.js   → 自绘 DOM（aaalice.*）
```

见 [AGENTS.md · 国际化](./AGENTS.md#国际化i18n) 与 [Custom Nodes i18n](https://docs.comfy.org/custom-nodes/i18n)。

---

## Parameter Panel 与 Operation Panel

### ParameterPanel 直接输出

每个 `ParameterPanel` 只管理一组有序参数，并直接提供最多 32 个 `AnyType` 输出。第一个输出对应第一个可调参数，separator 不占输出，未使用的输出行保持隐藏。节点标题是面板显示名，也是可选 KJ Set 名称的前缀来源。

新节点默认依次包含 Steps、CFG、Sampler、Scheduler、Denoise、Seed，种子固定放在最后。Sampler 和 Scheduler 选项跟随当前 ComfyUI；Seed 排队后支持 fixed、increment、decrement、randomize 四种行为。

画布节点只显示参数名称和调值控件，没有结构工具栏和锁定功能。右键节点选择 **编辑参数…**，即可在双栏编辑器中新增、配置、重排、复制、删除参数和编写说明。有说明的参数会在名称旁显示备注图标，悬浮名称或图标时展示安全 Markdown 提示。

将下游节点直接连接到 `ParameterPanel` 右侧对应参数引脚。参数重排或重命名后，已有连线仍按稳定参数 id 重绑；删除已连线参数前仍会要求确认。节点右键菜单在检测到 KJ Set/Get 后，可一键为当前参数创建或复用 KJ Set，并自动刷新名称。
KJ 名称统一为“节点标题_参数名称”；节点标题为空时回退为“ParameterPanel_参数名称”，已有 Get 连线由 KJ 的重命名逻辑跟随更新。

基本流程：

1. 添加 `ParameterPanel`，直接调整默认采样参数。
2. 需要修改结构时，右键节点并打开 **编辑参数…**。
3. 将下游节点直接连接到右侧参数引脚；安装 KJ Set/Get 时，也可选择 **🔗 为所有参数创建并连接 KJ Set**。
4. 在 Operation Panel 中使用自动注册的卡片进行日常调值。

### Operation Panel

**Operation Panel** 是通用操作面，不是第二套参数编辑器：

- ParameterPanel 自动注册到当前活动页面；其它受支持节点通过右键菜单显式注册。
- 页面包含有序分区，每个图节点只对应一张卡片；卡片支持排序、隐藏、仅侧栏别名和全屏行列位置。
- 全屏模式保留 ComfyUI 顶栏与原生执行入口，不新增独立执行按钮。
- 页面值预设通过显式预设键保存当前页面的可写值，不创建节点，也不保存定义、连线或布局；加载前会预览不匹配项并允许部分应用。

---

## 重置清单

**按下方优先级队列一次一项**（不再死板按 # 递增）。  
`#` 是**稳定编号**，插队时不重编号。

**硬依赖（不改序号）：** #3 依赖 #15 · #25 随 #24 落地。

| | 含义 |
|:---:|------|
| ⬜ | 未开始 |
| 🔄 | 进行中 |
| ✅ | 已完成 |
| ⏸ | 阻塞 |

### 已完成

| # | Id | 作用 |
|--:|----|------|
| 0 | *（骨架）* | 可加载包、域布局、i18n、`WEB_DIRECTORY` |
| 1 | `SimpleStringSplit` | 按分隔符拆分字符串 → 列表 |
| 15 | `ParameterPanel` | 创作一组参数（最多 32 个）并直接输出；#16 已并入本节点 |

### 已砍

| # | Id | 说明 |
|--:|----|------|
| 2 | `SimpleValueSwitch` | 不在重置范围——实用价值不足，不重写 |

### 优先级队列

| 序 | # | Id | 域 | 作用 / 备注 |
|:--:|--:|----|----|-------------|
| 1 | 3 | `EnumSwitch` | tools | 按枚举选通 |
| 2 | 4 | `SimpleNotify` | tools | 执行时通知 |
| 3 | 5 | `WorkflowDescription` | tools | 图上备注 UI |
| 4 | 6 | `VAEImageBatchFix` | tools | VAE batch 形态修复 |
| 5 | 7 | `ModelNameExtractor` | tools | 可读模型名 |
| 6 | 8 | `ResolutionMasterSimplify` | tools | 分辨率 / 尺寸 |
| 7 | 9 | `SimpleLoadImage` | tools | 本地图 → `IMAGE` / `MASK` |
| 8 | 10 | `PromptCleaningMaid` | prompt | 标签清洗 / 去重 |
| 9 | 11 | `PromptSelector` | prompt | 列表勾选提示词 |
| 10 | 12 | `CharacterFeatureSwapNode` | prompt | 角色特征交换 |
| 11 | 13 | `SimpleImageCompare` | media | 图像对比 UI |
| 12 | 14 | `SimpleCheckpointLoaderWithName` | media | Checkpoint + 名称 / 预览 |
| 13 | 17 | `GroupIsEnabled` | control | 组是否启用 → 布尔 |
| 14 | 18 | `GroupMuteManager` | control | 批量组静音 |
| 15 | 19 | `GroupIgnoreManager` | control | 批量组忽略 |
| 16 | 20 | Quick Group Navigation | control | 快速组导航（纯 JS） |
| 17 | 21 | `DanbooruGalleryNode` | gallery | 图站检索 / 标签 |
| 18 | 22 | `MultiCharacterEditorNode` | gallery | 多角色提示词 |
| 19 | 23 | `SaveImagePlus` | media | 增强保存 |
| 20 | 24 | `FetchFromKrita` | krita | 从 Krita 拉取 |
| 20 | 25 | `OpenInKrita` | krita | #24 兼容别名 |

旧仓仅作行为参考：[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。落盘 / 双模式 / UI 方向见 [AGENTS.md](./AGENTS.md)。

---

## 参与贡献

协作者与 AI 助手规则统一见 [AGENTS.md](./AGENTS.md)；参数 UI 的架构决策见 [docs/adr](./docs/adr/)。

---

## 许可

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
