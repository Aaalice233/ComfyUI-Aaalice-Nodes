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
| Reset in progress | **2 / 26** | #2 `SimpleValueSwitch` | en + zh | [MIT](./LICENSE) |

- **Not** a drop-in replacement for the legacy pack (names / APIs are not compatibility-by-default).
- UI language follows ComfyUI **Settings → Language**.
- App Mode and Nodes 2.0 are out of scope for now.
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
│   ├── tools/    #1–9
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

**One item at a time, ascending `#`.** Finish the current row before the next.

**Dependencies (do not renumber):** #16 needs #15 · #25 ships with #24.

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

### Queue

| # | Id | Domain | Role |
|--:|----|--------|------|
| 2 | `SimpleValueSwitch` | tools | Pick one of several inputs |
| 3 | `EnumSwitch` | tools | Route any type by enum |
| 4 | `SimpleNotify` | tools | Notify on execute |
| 5 | `WorkflowDescription` | tools | On-graph notes UI |
| 6 | `VAEImageBatchFix` | tools | VAE batch shape fix |
| 7 | `ModelNameExtractor` | tools | Readable model name |
| 8 | `ResolutionMasterSimplify` | tools | Size / resolution helper |
| 9 | `SimpleLoadImage` | tools | Load local image → `IMAGE` / `MASK` |
| 10 | `PromptCleaningMaid` | prompt | Clean / dedupe tags |
| 11 | `PromptSelector` | prompt | Checklist prompts |
| 12 | `CharacterFeatureSwapNode` | prompt | Swap character features |
| 13 | `SimpleImageCompare` | media | Image compare UI |
| 14 | `SimpleCheckpointLoaderWithName` | media | Checkpoint + name / preview |
| 15 | `ParameterControlPanel` | control | Central parameters |
| 16 | `ParameterBreak` | control | Unpack parameters |
| 17 | `GroupIsEnabled` | control | Group enabled → bool |
| 18 | `GroupMuteManager` | control | Batch mute groups |
| 19 | `GroupIgnoreManager` | control | Batch ignore groups |
| 20 | Quick Group Navigation | control | Floating nav (JS only) |
| 21 | `DanbooruGalleryNode` | gallery | Gallery search / tags |
| 22 | `MultiCharacterEditorNode` | gallery | Multi-character prompts |
| 23 | `SaveImagePlus` | media | Enhanced save |
| 24 | `FetchFromKrita` | krita | Pull from Krita |
| 25 | `OpenInKrita` | krita | Alias of #24 |

Legacy reference only: [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery). Code paths: [AGENTS.md](./AGENTS.md).

---

## Implementation workflow

| Step | Action |
|:----:|--------|
| 1 | Scope I/O and deltas vs legacy |
| 2 | Read legacy for behavior only — no whole-file copy |
| 3 | Rewrite (V3 schema; official `registerExtension`) |
| 4 | i18n: `locales/en` + `locales/zh` |
| 5 | Test load + main path; switch en / zh |
| 6 | Update **both** READMEs in the same change |
| 7 | Commit: `type(scope): 中文描述` |

---

## Development

Full rules: [AGENTS.md](./AGENTS.md) (layout · i18n · bilingual README · Registry publish).

- Thin root `__init__.py`; nodes under `nodes/<domain>/`
- English serialization ids; user-visible text in `locales/`
- Schema English fallbacks; `category` = `Aaalice/<domain>`
- Docs: keep `README.md` ↔ `README.zh-CN.md` aligned

---

## License

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
