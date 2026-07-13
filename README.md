<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes banner" width="100%" />
</p>

**English** | [简体中文](./README.zh-CN.md)

# <img src="assets/icon.png" alt="" width="36" height="36" align="top" /> ComfyUI-Aaalice-Nodes

Reset of [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery): rewrite within the agreed scope, align with the current ComfyUI frontend and extension APIs, and simplify selectively.

| | |
|---|---|
| **Status** | Reset in progress · not a drop-in replacement for the old pack yet |
| **Legacy pack** | Behavior reference only · node names / APIs are **not** compatibility-by-default |
| **Progress** | `2 / 26` done (#0–#1; next: #2) |
| **UI languages** | Simplified Chinese + English · follows ComfyUI interface language · `locales/` ready |
| **Registry** | [comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes) (node count may be empty while a version is still scanning) |

App Mode and Nodes 2.0 are out of scope for now.

---

## Contents

- [Install](#install)
- [Repository layout](#repository-layout)
- [Languages (i18n)](#languages-i18n)
- [Reset order](#reset-order)
- [Workflow](#workflow)
- [Development](#development)
- [License](#license)

---

## Install

### ComfyUI Manager / extensions (recommended)

1. After this pack is on the [Comfy Registry](https://registry.comfy.org), search **`ComfyUI-Aaalice-Nodes`** or **`comfyui-aaalice-nodes`** in Manager / Extensions and install.
2. Restart ComfyUI. Right-click add-node path: **Aaalice → tools / …**

> If it does not show up yet: the version may still be pending Registry scan (see `.github/workflows/publish.yml` and [publishing docs](https://docs.comfy.org/registry/publishing)).

### Manual install (Git)

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt   # may be empty; install when deps are added
```

Restart ComfyUI. Dependencies follow `requirements.txt` / `pyproject.toml`.

> For full legacy features, keep using [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery).

---

## Repository layout

Layout is inspired by [KJNodes](https://github.com/kijai/ComfyUI-KJNodes) (themed `nodes/`) and [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) (one node per file + frontend), scoped to this pack’s items. Placement rules: [AGENTS.md · 仓库与节点文件夹结构](./AGENTS.md#仓库与节点文件夹结构).

```
ComfyUI-Aaalice-Nodes/
├── __init__.py              # thin entry: V3 entrypoint + WEB_DIRECTORY
├── locales/{en,zh}/         # i18n (loaded by Comfy)
├── js/                      # frontend
│   ├── extension.js         # entry
│   ├── i18n.js
│   ├── lib/                 # shared (as needed)
│   ├── tools|prompt|media|control|gallery|krita/
├── nodes/                   # V3 nodes
│   ├── __init__.py          # iter_node_classes()
│   ├── _lib/                # pure helpers (not nodes)
│   ├── tools/               # #1–9        → Aaalice/tools
│   ├── prompt/              # #10–12      → Aaalice/prompt
│   ├── media/               # #13–14,#23  → Aaalice/media
│   ├── control/             # #15–19      → Aaalice/control (#20 JS-only)
│   ├── gallery/             # #21–22      → Aaalice/gallery
│   └── krita/               # #24–25      → Aaalice/krita
└── server/                  # optional HTTP routes (gallery / Krita, on demand)
```

| Rule | Note |
|------|------|
| One node per file by default | `nodes/<domain>/<snake_case>.py` |
| Create domains on demand | first node in a domain creates the package; no empty stubs |
| Menu prefix | Schema `category` = `Aaalice/<domain>` |
| Frontend mirror | heavy UI scripts under matching `js/<domain>/` |

---

## Languages (i18n)

Node and extension UI support **Simplified Chinese (`zh`)** and **English (`en`)** only.

- Display language follows ComfyUI **Settings → Language**
- Chinese UI when set to 简体中文; English (or untranslated locales fall back to English)
- Workflows store stable English ids (node type, input names, option values)

```
locales/
├── en/                 # English (source)
│   ├── main.json
│   ├── nodeDefs.json
│   ├── settings.json
│   └── commands.json
└── zh/                 # Simplified Chinese (keys aligned with en)
js/
├── extension.js
└── i18n.js
```

Conventions: [AGENTS.md · 国际化](./AGENTS.md#国际化i18n). Official: [Custom Nodes i18n](https://docs.comfy.org/custom-nodes/i18n).

---

## Reset order

Advance **one item at a time by # (ascending)**; close the current item before starting the next. No bulk scheduling by feature domain.

Hard dependencies (do not renumber):

- #16 depends on #15 (parameter panel / break pair)
- #25 is a compatibility alias of #24; land with #24

| Mark | Meaning |
|:----:|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| ⏸ | Blocked |

| # | Class / name | Display (zh) | Role | Status |
|--:|--------------|--------------|------|:----:|
| 0 | Package skeleton | — | Thin `__init__.py`, domain layout, i18n, `WEB_DIRECTORY`, loadable | ✅ |
| 1 | `SimpleStringSplit` | 简易字符串分隔 | Split string by delimiter | ✅ |
| 2 | `SimpleValueSwitch` | 简易值切换 | Pick one of multiple inputs | ⬜ |
| 3 | `EnumSwitch` | 枚举切换 | Route any type by enum | ⬜ |
| 4 | `SimpleNotify` | 简易通知 | Notify on execute | ⬜ |
| 5 | `WorkflowDescription` | 工作流说明 | On-graph notes / description UI | ⬜ |
| 6 | `VAEImageBatchFix` | VAE 图像批次修复 | Fix batch shape in VAE flows | ⬜ |
| 7 | `ModelNameExtractor` | 模型名称提取器 | Readable model name string | ⬜ |
| 8 | `ResolutionMasterSimplify` | 分辨率大师简化版 | Resolve / pick sizes | ⬜ |
| 9 | `SimpleLoadImage` | 简易加载图像 | Local image → `IMAGE` / `MASK` | ⬜ |
| 10 | `PromptCleaningMaid` | 提示词清洁女仆 | Clean / dedupe / normalize tags | ⬜ |
| 11 | `PromptSelector` | 提示词选择器 | Checklist-combine prompts | ⬜ |
| 12 | `CharacterFeatureSwapNode` | 角色特征交换 | Swap / replace character features | ⬜ |
| 13 | `SimpleImageCompare` | 简易图像对比 | Compare images in node UI | ⬜ |
| 14 | `SimpleCheckpointLoaderWithName` | 简易 Checkpoint 加载器 | Load checkpoint with name / preview | ⬜ |
| 15 | `ParameterControlPanel` | 参数控制面板 | Central params | ⬜ |
| 16 | `ParameterBreak` | 参数展开 | Unpack params to outputs | ⬜ |
| 17 | `GroupIsEnabled` | 组是否启用 | Group state → bool | ⬜ |
| 18 | `GroupMuteManager` | 组静音管理器 | Batch mute groups | ⬜ |
| 19 | `GroupIgnoreManager` | 组忽略管理器 | Batch ignore groups | ⬜ |
| 20 | Quick Group Navigation | 快速组导航 | Floating nav / hotkeys (JS only) | ⬜ |
| 21 | `DanbooruGalleryNode` | D站画廊 | Gallery search / tag assist | ⬜ |
| 22 | `MultiCharacterEditorNode` | 多角色编辑器 | Regional / attention prompts | ⬜ |
| 23 | `SaveImagePlus` | 保存图像增强版 | Enhanced save | ⬜ |
| 24 | `FetchFromKrita` | 从 Krita 获取数据 | Pull layers / images from Krita | ⬜ |
| 25 | `OpenInKrita` | (same as #24) | Alias with #24 | ⬜ |

Legacy behavior: [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) source. This page tracks scope, order, and status only. Paths: [AGENTS.md](./AGENTS.md).

---

## Workflow

**Rule:** only the next table row (# ascending); close it before the next.

| Step | Do |
|:----:|----|
| 1 | **Scope** — I/O, deltas vs legacy, keep class / `node_id`? |
| 2 | **Read legacy** — behavior and edges only; no whole-file copy |
| 3 | **Rewrite** — V3 schema; official `registerExtension`; avoid LiteGraph internals |
| 4 | **i18n** — `locales/en` and `locales/zh` (at least `nodeDefs.json`) |
| 5 | **Test** — load pack, main path; UI on canvas; switch en / zh |
| 6 | **Docs** — update **both** `README.md` and `README.zh-CN.md` status in sync |
| 7 | **Commit** — `type(scope): 中文描述` |

---

## Development

See [AGENTS.md](./AGENTS.md):

- [仓库与节点文件夹结构](./AGENTS.md#仓库与节点文件夹结构)
- [国际化 i18n](./AGENTS.md#国际化i18n)
- [README 双语](./AGENTS.md#readme-双语)

Summary:

- Nodes under `nodes/<domain>/`; keep root `__init__.py` thin
- English ids for serialization / COMBO **values**; user-visible strings in `locales/`
- Schema `display_name` / description English fallback; `category` = `Aaalice/<domain>`
- Only `en` + `zh`

---

## License

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
