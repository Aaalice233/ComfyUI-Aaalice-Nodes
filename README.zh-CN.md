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

- **不是**旧包的直接替代品（节点名 / API **不默认兼容**）。
- 显示语言跟随 ComfyUI **设置 → 语言**。
- **双渲染兼容（硬性）**：全部节点须同时支持 **经典节点模式** 与 **[Nodes 2.0](https://docs.comfy.org/interface/nodes-2)**（开/关都能用）。App Mode 仍暂不考虑。
- 重 UI 自绘气质参考 [herdi.ng/lp](https://www.herdi.ng/lp)（细则见 [AGENTS.md](./AGENTS.md)）。
- Registry：[comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes)  
  *（版本仍在扫描时，列表节点数可能为空）*

---

## 目录

1. [安装](#安装)
2. [仓库结构](#仓库结构)
3. [语言（i18n）](#语言i18n)
4. [重置清单](#重置清单)
5. [实现工作流](#实现工作流)
6. [开发](#开发)
7. [许可](#许可)

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

## 仓库结构

参考 [KJNodes](https://github.com/kijai/ComfyUI-KJNodes)、[rgthree-comfy](https://github.com/rgthree/rgthree-comfy)，按本包条目收束。细则见 [AGENTS.md](./AGENTS.md)。

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py                 # V3 入口 + WEB_DIRECTORY
├── README.md / README.zh-CN.md # 双语文档（须同步）
├── assets/                     # Registry / README 横幅（icon 仅给 Registry）
├── locales/{en,zh}/            # Comfy i18n
├── js/                         # 前端（与域对齐）
├── nodes/                      # 按域分包的 V3 节点
│   ├── tools/    #1, #3–9
│   ├── prompt/   #10–12
│   ├── media/    #13–14, #23
│   ├── control/  #15–19
│   ├── gallery/  #21–22
│   └── krita/    #24–25
└── server/                     # 可选 HTTP（按需）
```

| 约定 | 说明 |
|------|------|
| 默认一节点一文件 | `nodes/<domain>/<snake_case>.py` |
| 域按需创建 | 该域第一个节点落地时再建包，不预建空壳 |
| 菜单 | 仅 `category = "Aaalice/<domain>"`，禁止挂到原版分类 |
| 前端 | 重 UI 脚本放在对应 `js/<domain>/` |

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

## 重置清单

**按下方优先级队列一次一项**（不再死板按 # 递增）。  
`#` 是**稳定编号**，插队时不重编号。

**硬依赖（不改序号）：** #16 随 / 依赖 #15 · #3 依赖 #15–16 · #25 随 #24 落地。

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
| 15 | `ParameterControlPanel` | 中央参数坞：节点面改值 + 常驻侧栏完全体；输出参数包 |
| 16 | `ParameterBreak` | 展开参数包（最多 32）；按参数 id 重绑连线 |

### 已砍

| # | Id | 说明 |
|--:|----|------|
| 2 | `SimpleValueSwitch` | 不在重置范围——实用价值不足，不重写 |

### 优先级队列

| 序 | # | Id | 域 | 作用 / 备注 |
|:--:|--:|----|----|-------------|
| 1 | 3 | `EnumSwitch` | tools | 按枚举选通 |
| 2 | 4 | `SimpleNotify` | tools | 执行时通知 |
| 4 | 5 | `WorkflowDescription` | tools | 图上备注 UI |
| 5 | 6 | `VAEImageBatchFix` | tools | VAE batch 形态修复 |
| 6 | 7 | `ModelNameExtractor` | tools | 可读模型名 |
| 7 | 8 | `ResolutionMasterSimplify` | tools | 分辨率 / 尺寸 |
| 8 | 9 | `SimpleLoadImage` | tools | 本地图 → `IMAGE` / `MASK` |
| 9 | 10 | `PromptCleaningMaid` | prompt | 标签清洗 / 去重 |
| 10 | 11 | `PromptSelector` | prompt | 列表勾选提示词 |
| 11 | 12 | `CharacterFeatureSwapNode` | prompt | 角色特征交换 |
| 12 | 13 | `SimpleImageCompare` | media | 图像对比 UI |
| 13 | 14 | `SimpleCheckpointLoaderWithName` | media | Checkpoint + 名称 / 预览 |
| 14 | 17 | `GroupIsEnabled` | control | 组是否启用 → 布尔 |
| 15 | 18 | `GroupMuteManager` | control | 批量组静音 |
| 16 | 19 | `GroupIgnoreManager` | control | 批量组忽略 |
| 17 | 20 | Quick Group Navigation | control | 快速组导航（纯 JS） |
| 18 | 21 | `DanbooruGalleryNode` | gallery | 图站检索 / 标签 |
| 19 | 22 | `MultiCharacterEditorNode` | gallery | 多角色提示词 |
| 20 | 23 | `SaveImagePlus` | media | 增强保存 |
| 21 | 24 | `FetchFromKrita` | krita | 从 Krita 拉取 |
| 21 | 25 | `OpenInKrita` | krita | #24 兼容别名 |

旧仓仅作行为参考：[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。落盘 / 双模式 / UI 方向见 [AGENTS.md](./AGENTS.md)。

---

## 实现工作流

| 步骤 | 内容 |
|:----:|------|
| 1 | 定范围：I/O、与旧包差异 |
| 2 | 读旧实现：只摘行为，禁止整文件复制 |
| 3 | 重写：V3 schema；官方 `registerExtension`；**经典 + Nodes 2.0** |
| 4 | 重 UI：DOM + hooks；必须用 `nodeCreated`（不能只靠 `beforeRegisterNodeDef`） |
| 5 | i18n：`locales/en` + `locales/zh` |
| 6 | 自测：加载 + 主路径；**经典与 Nodes 2.0 各一轮**；切换 en / zh |
| 7 | 文档：**同一改动内**同步两份 README |
| 8 | 提交：`type(scope): 中文描述` |

---

## 开发

完整约定见 [AGENTS.md](./AGENTS.md)（目录 · i18n · README 双语 · Registry · **经典 + Nodes 2.0** · UI 方向）。

- 根 `__init__.py` 保持薄；节点在 `nodes/<domain>/`
- 序列化键用英文；用户可见文案进 `locales/`
- Schema 英文 fallback；`category` = `Aaalice/<domain>`
- 全部节点：**经典模式与 Nodes 2.0 都要可用**；自绘优先 DOM / 官方 hooks，禁止 Canvas 手绘当唯一交互、禁止 LiteGraph 原型劫持主路径
- 文档：`README.md` ↔ `README.zh-CN.md` 必须对齐

---

## 许可

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
