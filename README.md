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

- **Not** a drop-in replacement for the legacy pack. This package is in an unpublished refactor phase; workflow data and frontend protocols may change without migration until the first stable release.
- UI language follows ComfyUI **Settings → Language**.
- Every node is built for both classic node mode and **[Nodes 2.0](https://docs.comfy.org/interface/nodes-2)**. App Mode is currently out of scope.
- Registry: [comfyui-aaalice-nodes](https://registry.comfy.org/nodes/comfyui-aaalice-nodes)  
  *(node count may stay empty while a version is still scanning)*

---

## Table of contents

1. [Install](#install)
2. [Languages (i18n)](#languages-i18n)
3. [Parameter Panel & Operation Panel](#parameter-panel--operation-panel)
4. [Reset checklist](#reset-checklist)
5. [Contributing](#contributing)
6. [License](#license)

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

## Parameter Panel & Operation Panel

### ParameterPanel direct outputs

Each `ParameterPanel` owns one ordered parameter set and exposes up to 32 direct `AnyType` outputs. The first output belongs to the first tunable parameter, separators do not consume an output, and unused output rows stay hidden. The node title is its display name and the source of the optional KJ Set name prefix.

New nodes start with Steps, CFG, Sampler, Scheduler, Denoise, and Seed, with Seed placed last. Sampler and Scheduler choices follow the running ComfyUI installation. Seed supports fixed, increment, decrement, and randomize behavior after queueing.

The canvas node only shows parameter names and value controls—there is no structural toolbar or lock. Right-click the node and choose **Edit Parameters…** to open the two-column editor for adding, configuring, reordering, copying, deleting, and documenting parameters. Descriptions appear as safe Markdown tooltips from the parameter name and note icon.

Connect workflow nodes directly to the matching output on the right side of `ParameterPanel`. Output links are rebound by stable parameter id when definitions are reordered or renamed; deleting a connected parameter still asks for confirmation. The node context menu can optionally create/reuse KJ Set nodes for all current parameters and refresh their names automatically.
KJ names use `<node title>_<parameter name>` (falling back to `ParameterPanel_<parameter name>` when the title is empty); existing Get links follow KJ’s rename behavior.

Basic flow:

1. Add `ParameterPanel` and adjust its default sampling values.
2. Right-click it and open **Edit Parameters…** when the parameter structure needs to change.
3. Connect downstream nodes directly to the right-side parameter outputs, or choose **🔗 Create and link KJ Set nodes for all parameters** when KJ Set/Get is available.
4. Use the automatically registered card in the Operation Panel for day-to-day control.

### Operation Panel

The **Operation Panel** is a general operating surface, not a second parameter editor:

- ParameterPanel nodes register automatically on the active page; right-click supported ordinary nodes to register them explicitly.
- Pages contain ordered sections and each graph node appears as one card. Cards support ordering, hiding, sidebar-only aliases, and fullscreen row/column placement.
- Fullscreen keeps the ComfyUI top bar and native queue controls available; the panel does not add a separate queue button.
- Page Value Presets save writable values from the active page using explicit preset keys. They never create nodes or store definitions, links, or layout; mismatches are previewed before partial application.

---

## Reset checklist

**One active item at a time** by the **priority queue** below (not strict `#` order).  
`#` is a **stable id** — do not renumber when priority changes.

**Dependencies (do not renumber):** #3 needs #15 · #25 ships with #24.

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
| 15 | `ParameterPanel` | Author one parameter set (max 32) with direct outputs; #16 is merged here |

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
