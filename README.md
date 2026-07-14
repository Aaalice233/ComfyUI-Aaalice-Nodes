<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

# ComfyUI-Aaalice-Nodes

Reset of [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery): rewrite by agreed scope, align with the current ComfyUI frontend and extension APIs, simplify selectively.

| Status | Progress | Next | Languages | License |
|:------:|:--------:|:----:|:---------:|:-------:|
| Reset in progress | **4 / 25** | #3 `EnumSwitch` | en + zh | [MIT](./LICENSE) |

- **Not** a drop-in replacement for the legacy pack (names / APIs are not compatibility-by-default).
- UI language follows ComfyUI **Settings → Language**.
- **Dual UI compatibility (required):** every node must work in **classic** node mode **and** with **[Nodes 2.0](https://docs.comfy.org/interface/nodes-2)** enabled. App Mode is still out of scope.
- Custom heavy UI aims for a calm dark aesthetic inspired by [herdi.ng/lp](https://www.herdi.ng/lp) (see [AGENTS.md](./AGENTS.md)).
- Registry: [comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes)  
  *(node count may stay empty while a version is still scanning)*

---

## Table of contents

1. [Install](#install)
2. [Repository layout](#repository-layout)
3. [Languages (i18n)](#languages-i18n)
4. [Reset checklist](#reset-checklist)
5. [Implementation workflow](#implementation-workflow)
6. [Development](#development)
7. [License](#license)

---

## Install

### Manager / Extensions

1. Open ComfyUI → Manager / Extensions.
2. Search **`ComfyUI-Aaalice-Nodes`** or **`comfyui-aaalice-nodes`**.
3. Install → **restart ComfyUI**.
4. Right-click canvas → **Aaalice → tools / …**

If the pack is missing from the list, the Registry version may still be pending scan. See [publishing](https://docs.comfy.org/registry/publishing) and `.github/workflows/publish.yml`.

### Git (manual)

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt   # often empty; install when deps appear
```

Restart ComfyUI. Dependencies: `requirements.txt` / `pyproject.toml`.

> Need full legacy behavior? Keep [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery).

---

## Repository layout

Inspired by [KJNodes](https://github.com/kijai/ComfyUI-KJNodes) and [rgthree-comfy](https://github.com/rgthree/rgthree-comfy); scoped to this pack. Details: [AGENTS.md](./AGENTS.md).

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py                 # V3 entrypoint + WEB_DIRECTORY
├── README.md / README.zh-CN.md # bilingual docs (keep in sync)
├── assets/                     # Registry / README banner (icon for Registry only)
├── locales/{en,zh}/            # Comfy i18n
├── js/                         # frontend (mirrors domains)
├── nodes/                      # V3 nodes by domain
│   ├── tools/    #1, #3–9
│   ├── prompt/   #10–12
│   ├── media/    #13–14, #23
│   ├── control/  #15–19
│   ├── gallery/  #21–22
│   └── krita/    #24–25
└── server/                     # optional HTTP (on demand)
```

| Rule | Detail |
|------|--------|
| One node per file | `nodes/<domain>/<snake_case>.py` |
| Domains on demand | create package with the first node; no empty stubs |
| Menu | `category = "Aaalice/<domain>"` only — never stock Comfy roots |
| Frontend | heavy UI under matching `js/<domain>/` |

---

## Languages (i18n)

| Locale | Role |
|--------|------|
| `en` | Source / fallback |
| `zh` | Full Simplified Chinese |

No other locales. Unlisted UI languages fall back to English. Workflow JSON keeps English ids.

```text
locales/en|zh/{ main, nodeDefs, settings, commands }.json
js/i18n.js   → custom DOM strings (aaalice.*)
```

See [AGENTS.md · i18n](./AGENTS.md#国际化i18n) and [Custom Nodes i18n](https://docs.comfy.org/custom-nodes/i18n).

---

## Reset checklist

**One active item at a time** by the **priority queue** below (not strict `#` order).  
`#` is a **stable id** — do not renumber when priority changes.

**Dependencies (do not renumber):** #16 ships with / needs #15 · #3 needs #15–16 · #25 ships with #24.

| | Meaning |
|:---:|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| ⏸ | Blocked |

### Done

| # | Id | Role |
|--:|----|------|
| 0 | *(skeleton)* | Loadable package, domains, i18n, `WEB_DIRECTORY` |
| 1 | `SimpleStringSplit` | Split string by delimiter → list |
| 15 | `ParameterControlPanel` | Central dock: node values + permanent sidebar editor; Param Pack |
| 16 | `ParameterBreak` | Expand pack (max 32); rebind links by parameter id |

### Dropped

| # | Id | Note |
|--:|----|------|
| 2 | `SimpleValueSwitch` | Out of scope — not useful enough to reset |

### Priority queue

| Order | # | Id | Domain | Role / notes |
|:-----:|--:|----|--------|--------------|
| 1 | 3 | `EnumSwitch` | tools | Route by enum |
| 2 | 4 | `SimpleNotify` | tools | Notify on execute |
| 3 | 5 | `WorkflowDescription` | tools | On-graph notes UI |
| 4 | 6 | `VAEImageBatchFix` | tools | VAE batch shape fix |
| 5 | 7 | `ModelNameExtractor` | tools | Readable model name |
| 6 | 8 | `ResolutionMasterSimplify` | tools | Size / resolution helper |
| 7 | 9 | `SimpleLoadImage` | tools | Load local image → `IMAGE` / `MASK` |
| 8 | 10 | `PromptCleaningMaid` | prompt | Clean / dedupe tags |
| 9 | 11 | `PromptSelector` | prompt | Checklist prompts |
| 10 | 12 | `CharacterFeatureSwapNode` | prompt | Swap character features |
| 11 | 13 | `SimpleImageCompare` | media | Image compare UI |
| 12 | 14 | `SimpleCheckpointLoaderWithName` | media | Checkpoint + name / preview |
| 13 | 17 | `GroupIsEnabled` | control | Group enabled → bool |
| 14 | 18 | `GroupMuteManager` | control | Batch mute groups |
| 15 | 19 | `GroupIgnoreManager` | control | Batch ignore groups |
| 16 | 20 | Quick Group Navigation | control | Floating nav (JS only) |
| 17 | 21 | `DanbooruGalleryNode` | gallery | Gallery search / tags |
| 18 | 22 | `MultiCharacterEditorNode` | gallery | Multi-character prompts |
| 19 | 23 | `SaveImagePlus` | media | Enhanced save |
| 20 | 24 | `FetchFromKrita` | krita | Pull from Krita |
| 20 | 25 | `OpenInKrita` | krita | Alias of #24 |

Legacy reference only: [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery). Code paths / dual UI / visual direction: [AGENTS.md](./AGENTS.md).

---

## Implementation workflow

| Step | Action |
|:----:|--------|
| 1 | Scope I/O and deltas vs legacy |
| 2 | Read legacy for behavior only — no whole-file copy |
| 3 | Rewrite (V3 schema; official `registerExtension`; **classic + Nodes 2.0 UI**) |
| 4 | Heavy self-drawn UI: DOM + hooks; use `nodeCreated` (not only `beforeRegisterNodeDef`) |
| 5 | i18n: `locales/en` + `locales/zh` |
| 6 | Test load + main path; **classic and Nodes 2.0**; switch en / zh |
| 7 | Update **both** READMEs in the same change |
| 8 | Commit: `type(scope): 中文描述` |

---

## Development

Full rules: [AGENTS.md](./AGENTS.md) (layout · i18n · bilingual README · Registry · **classic + Nodes 2.0** · UI direction).

- Thin root `__init__.py`; nodes under `nodes/<domain>/`
- English serialization ids; user-visible text in `locales/`
- Schema English fallbacks; `category` = `Aaalice/<domain>`
- All nodes: work in **classic mode and Nodes 2.0**; prefer DOM / official hooks over Canvas paint & prototype hijacks
- Docs: keep `README.md` ↔ `README.zh-CN.md` aligned

---

## License

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
