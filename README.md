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
- Every node is built for both classic node mode and **[Nodes 2.0](https://docs.comfy.org/interface/nodes-2)**. App Mode is currently out of scope.
- Registry: [comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes)  
  *(node count may stay empty while a version is still scanning)*

---

## Table of contents

1. [Install](#install)
2. [Languages (i18n)](#languages-i18n)
3. [Reset checklist](#reset-checklist)
4. [Contributing](#contributing)
5. [License](#license)

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

## Contributing

Contributor and AI-assistant rules live in [AGENTS.md](./AGENTS.md). Architectural decisions for the parameter UI live in [docs/adr](./docs/adr/).

---

## License

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
