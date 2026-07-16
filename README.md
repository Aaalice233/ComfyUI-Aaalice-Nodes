<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

# ComfyUI-Aaalice-Nodes

Compact parameter controls and workflow utilities for ComfyUI.

> This package is a published preview. Workflows and behavior may change before the first stable release, and the package does not migrate data from ComfyUI-Danbooru-Gallery.

| Status | Progress | Next |
|:---:|:---:|:---:|
| Reset in progress | **4 / 23 nodes** | #4 `SimpleNotify` |

## Requirements

- A current ComfyUI installation with V3 custom-node support.
- Classic canvas or Nodes 2.0. App Mode is not currently supported.
- English and Simplified Chinese UI are included; other locales fall back to English.

## Installation

### ComfyUI Manager (recommended)

1. Open **ComfyUI Manager** and go to the custom-node management page.
2. Search for `ComfyUI-Aaalice-Nodes` or the Registry package id `comfyui-aaalice-nodes`.
3. Select **Install**, then restart ComfyUI and refresh the browser.

Manager installs the published [`comfyui-aaalice-nodes`](https://registry.comfy.org/nodes/comfyui-aaalice-nodes) package and its declared dependencies. Use Manager for normal installation and updates.

### Manual Git installation

Use Git when you need the latest development revision or a specific commit. Clone the repository into `ComfyUI/custom_nodes`, install dependencies with the Python environment used by ComfyUI, and restart:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt
```

## Updating and troubleshooting

- Registry installations should be updated through ComfyUI Manager.
- Manual Git installations can be updated with `git pull` from this repository directory.
- Restart ComfyUI after Python updates and hard-refresh the browser after frontend updates.
- If an existing node keeps an old socket or widget structure after a structural update, remove that node instance and create it again.

## Included nodes

| Node | Category | Purpose |
|---|---|---|
| `ParameterPanel` | `Aaalice/control` | Manage one parameter set and expose up to 32 direct outputs. |
| `ParameterReceiver` | `Aaalice/control` | Bind a ParameterPanel and collect its KJ Get values behind one compact output surface. |
| `EnumSwitch` | `Aaalice/tools` | Execute and output one branch selected by an exact string value. |
| `SimpleStringSplit` | `Aaalice/tools` | Split text by comma or pipe, trim whitespace, and remove empty parts. |

<details>
<summary><strong>Node reset checklist and schedule</strong></summary>

Stable ids are inherited from the reset plan and are not renumbered when priorities change. The schedule counts nodes only and follows dependencies and reuse between nodes. One node is implemented at a time. The package skeleton and non-node frontend extensions do not count toward node progress. `ParameterReceiver` now fulfills #16, which was previously named `ParameterBreak`.

### Completed

| # | Current implementation | Purpose |
|---:|---|---|
| 1 | `SimpleStringSplit` | Split text into a cleaned string list. |
| 3 | `EnumSwitch` | Lazily route one type-matched branch by an exact string key. |
| 15 | `ParameterPanel` | Author and directly output up to 32 parameters. |
| 16 | `ParameterReceiver` | Receive the panel's KJ Get values through stable pass-through slots. |

### Dropped

| # | Legacy id | Reason |
|---:|---|---|
| 2 | `SimpleValueSwitch` | Out of scope; not useful enough to reset. |

### Node schedule

| Order | # | Legacy id | Domain | Purpose |
|---:|---:|---|---|---|
| 1 | 4 | `SimpleNotify` | tools | Notify when executed. |
| 2 | 5 | `WorkflowDescription` | tools | On-graph workflow notes. |
| 3 | 17 | `GroupIsEnabled` | control | Report whether a group is enabled. |
| 4 | 18 | `GroupMuteManager` | control | Batch mute workflow groups. |
| 5 | 19 | `GroupIgnoreManager` | control | Batch ignore workflow groups. |
| 6 | 10 | `PromptCleaningMaid` | prompt | Clean and deduplicate tags. |
| 7 | 11 | `PromptSelector` | prompt | Select prompts from a checklist. |
| 8 | 12 | `CharacterFeatureSwapNode` | prompt | Swap character features. |
| 9 | 21 | `DanbooruGalleryNode` | gallery | Search gallery images and tags. |
| 10 | 22 | `MultiCharacterEditorNode` | gallery | Edit multi-character prompts. |
| 11 | 7 | `ModelNameExtractor` | tools | Extract a readable model name. |
| 12 | 14 | `SimpleCheckpointLoaderWithName` | media | Load a checkpoint with its name and preview. |
| 13 | 8 | `ResolutionMasterSimplify` | tools | Resolution and size helper. |
| 14 | 24 | `FetchFromKrita` | krita | Pull content from Krita. |
| 15 | 25 | `OpenInKrita` | krita | Open content in Krita; implemented together with #24. |
| 16 | 9 | `SimpleLoadImage` | tools | Load a local image and mask. |
| 17 | 6 | `VAEImageBatchFix` | tools | Correct VAE batch shapes. |
| 18 | 13 | `SimpleImageCompare` | media | Compare images interactively. |
| 19 | 23 | `SaveImagePlus` | media | Save images with additional controls. |

### Non-node schedule

| # | Frontend extension | Prerequisite nodes | Purpose |
|---:|---|---|---|
| 20 | Quick Group Navigation | #17–#19 group-management nodes | Navigate workflow groups from a floating UI. |

</details>

<details>
<summary><strong>EnumSwitch — lazy enum routing</strong></summary>

- Match `selector` against 1–32 exact branch keys; unmatched or unconnected branches fail visibly.
- Only the selected lazy branch executes, and every branch shares one inferred connection type.
- Right-click and choose **⚙️ Edit Branches…** for standalone use.
- A direct enum/dropdown output from ParameterPanel or ParameterReceiver is detected automatically. When its options change, the warning icon offers an explicit sync that preserves unchanged branch links.

</details>

<details>
<summary><strong>ParameterPanel — parameter authoring and direct outputs</strong></summary>

New panels contain `Steps`, `CFG`, `Sampler`, `Scheduler`, `Denoise`, and `Seed`. Sampler and scheduler options follow the current ComfyUI installation.

- Change values directly on the node.
- Right-click the node and choose **⚙️ Edit Parameters…** to add, rename, reorder, copy, delete, or document parameters.
- Custom enum and dropdown options use one value per line and must be unique.
- Connect each visible output directly to the matching downstream input. Links stay with the same parameter when it is renamed or reordered.
- Seed supports fixed, increment, decrement, and randomize behavior. The inline lock button switches between fixed and randomize for quick use.
- If KJ Set/Get is installed, **🔗 Create and link KJ Set nodes for all parameters** is available from the node menu. Newly created collapsed Set nodes are arranged in a compact column to the panel's right.

Deleting a connected parameter requires confirmation because its links must be removed. A panel can contain at most 32 value-producing parameters; separators do not consume outputs.

</details>

<details>
<summary><strong>ParameterReceiver — compact KJ Get receiver</strong></summary>

`ParameterReceiver` requires KJNodes Set/Get support for binding and synchronization. Create the receiver in the same graph as its source panel, then right-click it and choose **🔗 Bind Parameter Panel…**.

- The first bind reuses existing KJ Set nodes and asks before creating missing ones. Matching collapsed Get nodes are arranged to the receiver's left.
- Parameter renames and panel-title changes refresh labels automatically. Adding, deleting, or reordering parameters changes the footer to **Needs sync**; use **🔄 Sync from Parameter Panel** to apply structural changes.
- **🎯 Locate Parameter Panel** centers the bound source. **✂️ Detach** removes receiver-only managed Gets after confirming affected links.
- If the source panel is deleted, the receiver keeps its saved slot and link snapshot and reports **Source panel missing**. It can then be explicitly rebound.

KJNodes is optional for the package as a whole. Without it, ParameterReceiver workflows still load, but bind and sync report an error instead of simulating routing.

</details>

<details>
<summary><strong>SimpleStringSplit — cleaned text splitting</strong></summary>

Enter text and choose `,` or `|` as the delimiter. The node trims each segment, removes empty segments, and returns the remaining strings as a list.

</details>

## Compatibility and limitations

- This preview has no compatibility layer for workflows created with the legacy package.
- App Mode is not supported.
- Structural frontend updates can require recreating existing node instances after refresh.
- ParameterReceiver only binds a ParameterPanel in the current graph; it does not search inside subgraphs.

Keep [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) installed separately if you still need its original nodes.

## Feedback and license

Report bugs and feature requests in [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues).

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
