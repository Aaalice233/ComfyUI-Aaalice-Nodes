<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <b>English</b> · <a href="./README.md">简体中文</a>
</p>

# ComfyUI-Aaalice-Nodes

Compact parameter controls and workflow utilities for ComfyUI.

> This package is a published preview. Workflows and behavior may change before the first stable release. Legacy workflows are not migrated automatically; the Library can import the supported legacy prompt-library exports described below.

> [!WARNING]
> **Do not install this package together with [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)**: the two register the same node IDs (`PromptSelector`, `GroupIsEnabled`, `SimpleNotify`, `SimpleStringSplit`, `FetchFromKrita`), and the legacy package's frontend still hooks those node types, so having both installed produces duplicate widgets and unpredictable behavior. Keep only one of them installed. A warning toast appears in the interface when both are detected.

## 📋 Requirements

- A current ComfyUI installation with V3 custom-node support.
- Classic canvas or Nodes 2.0. App Mode is not currently supported.
- English and Simplified Chinese UI are included; other locales fall back to English.

## 📥 Installation

### 📦 ComfyUI Manager (recommended)

1. Open **ComfyUI Manager** and go to the custom-node management page.
2. Search for `ComfyUI-Aaalice-Nodes` or the Registry package id `comfyui-aaalice-nodes`.
3. Select **Install**, then restart ComfyUI and refresh the browser.

Manager installs the published [`comfyui-aaalice-nodes`](https://registry.comfy.org/nodes/comfyui-aaalice-nodes) package and its declared dependencies. Use Manager for normal installation and updates.

### 🔧 Manual Git installation

Use Git when you need the latest development revision or a specific commit. Clone the repository into `ComfyUI/custom_nodes`, install dependencies with the Python environment used by ComfyUI, and restart:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt
```

## 🔄 Updating and troubleshooting

- Registry installations should be updated through ComfyUI Manager.
- Manual Git installations can be updated with `git pull` from this repository directory.
- Restart ComfyUI after Python updates and hard-refresh the browser after frontend updates.
- If an existing node keeps an old socket or widget structure after a structural update, remove that node instance and create it again.

## 🧩 Included nodes

| Node | Category | Purpose |
|---|---|---|
| `QuickGroupManager` | `Aaalice/control` | Enable, mute, or bypass color-scoped visual groups with ordering and linkage rules. |
| `GroupIsEnabled` | `Aaalice/control` | Report at queue time whether a visual group is fully disabled. |
| `GroupLogicProbe` | `Aaalice/control` | Combine multiple group enabled/disabled probes with AND/OR into one boolean for lazy branching. |
| `ResolutionPreset` | `Aaalice/tools` | Pick an exact aligned width and height with presets, direct input, or a draggable canvas. |
| `SimpleStringSplit` | `Aaalice/tools` | Split text by comma or pipe, trim whitespace, and remove empty parts. |
| `SimpleNotify` | `Aaalice/tools` | Send optional desktop and sound alerts at an execution point, then pass its value through. |
| `ConditionalSaveImage` | `Aaalice/tools` | Save images only while enabled, otherwise pass them through; reuses LoraManager's save implementation when installed. |
| `PromptSelector` | `Aaalice/prompt` | Select, order, and weight reusable entries from the prompt library. |
| `BooruGalleryNode` | `Aaalice/gallery` | Search Danbooru, Gelbooru, Safebooru, and AI TAG in a virtual masonry gallery and output ordered images with paired prompts. |
| `FetchFromKrita` | `Aaalice/krita` | Read the visible composite and selection of Krita's active document as `IMAGE` and `MASK`. |

## 📖 Node details

<details>
<summary><strong>QuickGroupManager — fast visual-group control</strong></summary>

QuickGroupManager does not run as part of workflow execution and has no input or output sockets. It discovers visual groups in its current graph and gives every managed group one enabled switch. The node-wide **Mute / Bypass** switch determines how an off group is represented.

- Use the filter icon to manage all groups, multiple group colors, or uncolored groups. Multiple managers may use independent color scopes.
- Drag group rows to reorder them; each manager saves its own order.
- Use the frame icon on any row to fit that complete visual group in the canvas.
- Use the link icon to configure what other groups should do when that group is enabled or disabled; rules cascade only within the manager that initiated the change.
- Switching Mute / Bypass converts currently disabled groups in the active color scope as one undoable change.

The node controls only groups in its current graph and does not recurse into subgraphs.

</details>

<details>
<summary><strong>GroupIsEnabled — visual-group state probe</strong></summary>

Pick a visual group from the node's dropdown. When the prompt is queued, the node snapshots that group's member modes and reports a single boolean: **Disabled** is true only when every member is muted or bypassed. The probe must sit outside the group it watches, and a renamed, deleted, or empty group fails explicitly instead of guessing a state.

</details>

<details>
<summary><strong>GroupLogicProbe — multi-group AND/OR probe</strong></summary>

Build a list of group conditions, each pairing a visual group with an expected state, then combine them with the **AND / OR** switch into a single boolean. Connect the result to a lazy conditional branch such as Impact Pack's `ImpactConditionalBranch` cond input — the unselected branch's upstream never executes. Rows referencing renamed or deleted groups are highlighted and fail explicitly at execution.

</details>

<details>
<summary><strong>ResolutionPreset — exact aligned dimensions</strong></summary>

Choose one of nine model-neutral built-in sizes, save personal presets, enter width and height directly, or drag the width, height, and corner handles on the canvas. Alignment can be set to 8, 16, 32, or 64 pixels; the node outputs exact `INT` width and height values. Personal presets retain their own alignment and are stored in the current ComfyUI user directory.

This node does not calculate a target size from megapixels, recommend models, or perform any image operations. Use ComfyUI's `ResolutionSelector` when ratio-plus-megapixel calculation is the desired workflow.

</details>

<details>
<summary><strong>SimpleNotify — execution-point alerts</strong></summary>

Connect any value to receive one alert when execution reaches the node, then continue with the unchanged value. Desktop notifications and the bundled sound can be enabled independently, with configurable volume. Use **🔔 Enable and Test Alerts** from the node menu to request browser permission and test the enabled channels. The alert confirms only that execution reached this node; it does not wait for parallel branches or an empty queue.

</details>

<details>
<summary><strong>ConditionalSaveImage — toggleable image saving</strong></summary>

The same saving capabilities and options as `Save Image (LoraManager)` (`%seed%` filename patterns, png/jpeg/webp, metadata, workflow embedding, recipes), plus an **Enabled** toggle: when off, nothing is written, the images pass through unchanged, and the save-related widgets are dimmed. With ComfyUI-Lora-Manager installed, all saving is performed by its original implementation; without it, the node falls back to the core PNG save and clearly errors on LoraManager-only capabilities such as jpeg/webp or recipes.

Every save node is an output node that the executor runs unconditionally, so placing a save node upstream of a switch cannot prevent writes. Building the toggle into the save node itself is the only option that does not require manually muting the node (`Ctrl+M`).

</details>

<details>
<summary><strong>PromptSelector — ordered prompt-library selection</strong></summary>

Search and filter library entries by category or favorite folder, then select any number of them; the list can surface prompts used in the most recently queued workflows first. Selection order determines output order. Hover a selected entry to adjust its weight (0–20) with the wheel or arrow keys. The optional `prefix_prompt` input is emitted first, and the node menu can change the separator (default `, `). With ComfyUI-Autocomplete-Aaalice installed, the search box also offers its tag and Chinese completion.

PromptSelector stores stable entry references instead of copied text: editing a library entry updates every referencing node, and deleting a referenced entry leaves a visible missing reference that blocks execution until resolved.

</details>

<details>
<summary><strong>BooruGalleryNode — multi-site ordered gallery</strong></summary>

Choose Danbooru, Gelbooru, Safebooru, or AI TAG, search and filter posts, then select across an automatically loading natural-ratio masonry gallery. The Selected view preserves order, supports drag reordering, and lets each post edit its local tags without modifying the remote site. `images` and `prompts` are paired lists in that exact order; a failed download fails the node instead of inserting a placeholder.

Gallery can be added to Dashboard from the node context menu. The node and sidebar are two complete views of the same runtime, so search, filters, paging, selection, ordering, and settings stay synchronized live. The narrow sidebar uses a compact two-row toolbar; each switcher shows icon and text for its active item and icons only for the others. Search stays collapsed by default, and smaller image cards favor at least three columns. Dashboard presets capture and restore the Gallery source, query, feed, filters, page, random mode, Browse/Selected view, single/multi selection mode, prompt rules, current ordered selection, and the sidebar search expansion state; Gallery does not participate in control linking. A read-only badge reflects whether that node is active, muted, or bypassed without changing its mode.

- Search accepts booru-style tag queries and pasted prompt-style text; Danbooru exposes daily/weekly/monthly rankings, AI TAG its monthly ranking.
- Enable **Random draw** to sample the current source, query, feed, and ratings. Repeated draws and continued scrolling do not replay posts already shown; leaving the mode or changing that scope starts a fresh session. Random results still respect the local content blacklist.
- Site credentials, defaults, the global content blacklist, output filter tags, timeout, and the image cache budget live under **ComfyUI Settings → Aaalice Nodes → Booru Gallery**; credentials and caches stay in the current ComfyUI user directory and never enter workflow JSON. Gelbooru requires its official User ID and API Key; its complete `&api_key=…&user_id=…` account-page fragment can also be pasted directly into the API Key field.
- Click a network-error banner to inspect and copy the complete diagnostic or retry. For an SSL certificate verification failure, check the system clock, HTTPS proxy or packet-inspection certificate, and trusted root certificates; the extension never disables HTTPS certificate verification.
- The content blacklist precisely filters each site's lightweight list response on this machine. It is never sent upstream as excluded tags, never consumes remote search-tag slots, and never adds a login requirement; it is saved globally for the current ComfyUI user. Entries accept commas, Chinese commas, enumeration commas, or line breaks as separators. Output filter tags keep posts visible and only strip the tags from node output and copied prompts (handy for watermarks or artist names). Both are maintained from the prompt popover and the detail tag menu.
- Danbooru supports favorite reading and writing; Gelbooru supports reading only.
- Hover previews show the larger image, resolution, score, favorite count, rating, and categorized tags. Cards and post details can download originals, while details keep a separate action for opening the original in a new tab. With ComfyUI-Autocomplete-Aaalice installed, search and tag inputs such as excluded tags and output filter gain its tag completion, while hover previews and post details both show tag translations; with prompt-assistant installed, cards can interrogate images through its vision analysis.

</details>

<details>
<summary><strong>FetchFromKrita — execution-time Krita snapshot</strong></summary>

Every execution reads the visible composite of Krita's active document as `IMAGE` and the current selection as a same-size `MASK` (fully black when nothing is selected). Close Krita, then open **ComfyUI Settings → Aaalice Nodes → Krita** to install and enable the bundled `Aaalice Comfy Bridge`, start Krita, and test the connection.

Krita, ComfyUI, and the Bridge must run on the same machine. Missing Bridge, offline Krita, no active document, or an export failure fails the node explicitly; it never returns an old snapshot or placeholder.

</details>

<details>
<summary><strong>SimpleStringSplit — cleaned text splitting</strong></summary>

Enter text and choose `,` or `|` as the delimiter. The node trims each segment, removes empty segments, and returns the remaining strings as a list.

</details>

## 🖥️ Aaalice Workspace

Open **Aaalice Workspace** from ComfyUI's left sidebar. It hosts three views: **Controls** (dashboard pages), **Groups** (navigation), and **Library** (prompt library).

### 👁️ Focus on open

Right-click any node and choose **👁️ Focus on open** to make it the workflow's single focus target, with optional X/Y offsets and target zoom. Each time the workflow opens, ComfyUI silently enters the target's subgraph and focuses the canvas on it; marking another node replaces the previous target.

### 🎛️ Controls dashboard

- Right-click any compatible node and choose **📌 Add controls to sidebar…**, select its controls and a target page, then adjust the original values from the sidebar. No page is generated automatically.
- **Search components** searches live control titles across every page; results stay grouped by page and remain fully editable.
- Card extras: **Set numeric range…** overrides a slider's range for the sidebar only; **Add note…** attaches a Markdown note (saved with the workflow) shown behind a quiet info badge.
- **🔗 Link to an existing sidebar parameter…** makes one card drive multiple compatible controls; linked writes apply in one undoable transaction and roll back together on failure.
- **Edit layout** arranges cards on a twelve-column grid with snapping, separators, named layout groups, marquee multi-selection, and a tidy-layout action. Dragging previews the actual insertion point and displaced collision chain, edges auto-scroll continuously, and `Alt`+Arrow keys nudge the selection.
- Controls reflow as cards become taller, shorter, wider, or narrower: multiline text and execution output consume scrollable remaining space, tags wrap in tall cards, and narrow segmented choices switch to multiple rows.
- Bindings use stable identities rather than node titles or positions. Broken cards explain why and offer fuzzy-search rebinding, including a page-level review for all broken parameters at once; a replaced node re-attaches automatically when it is the unique match. The workspace never searches inside a subgraph.
- Compatible sources: simple nodes composed of native `INT`, `FLOAT`, `BOOLEAN`, `STRING`, and `COMBO` widgets, widgets publicly exposed by a subgraph (including multiline `STRING` widgets), and ComfyUI's `Preview Image`, `Preview as Text`, and `Compare Images` views (with navigation and full-window viewers). Nodes with unknown custom panels require an explicit adapter.

### 💾 Sidebar presets

The compact preset picker saves and switches the complete dashboard — pages, groups, bindings, card geometry, and compatible values, including each Seed's value and after-generate mode. When common model parameters (UNet, CLIP, VAE, Checkpoint, Upscale Model, and similar controls) use a different local folder structure, the preset finds a unique nested path by filename and applies it after confirmation. Missing or ambiguous model files are reported with their page, component, and parameter, while the new preset value is still written so a component cannot silently retain the previous preset's model. Quick Group Manager controls store only each group's on/off state in a preset; color scope, ordering, off mode, and linkage rules remain shared on the Manager node. Local changes mark the preset name in italics with a trailing `*`; saving the workflow with `Ctrl`/`Cmd`+`S` also commits the working copy into the active preset. Presets are stored inside the workflow file, so recipients of a shared workflow (including through Aaalice Workflow Hub) get the presets you shipped. A portable JSON backup can be exported and imported through the same validation flow.

**Import preset** defaults to **Values only**. It copies the base preset you choose, applies exact or uniquely identifiable semantic values to the new copy, and switches directly to that copy; neither the base preset nor the pre-import Dashboard is overwritten, and you name the new preset before importing. **Layout + values** also creates a separately named preset and warns before keeping broken bindings. Ambiguous, broken, or incompatible non-model values are listed and skipped; model values use the nested-path and explicit missing-model behavior described above.

### 🎚️ Adjustment profiles

The toolbar's **Adjustment profiles** button opens value-override profiles stored globally on this ComfyUI installation. Rules are grouped by source node, can be searched, and directly edit text, choice, boolean, numeric, and Seed target values. The header shows rule, source, and attention counts, while duplicate labels receive an ordinal within their source so you can distinguish them. Edits save locally automatically; only the footer's **Apply N rules** action changes the current sidebar. Each rule targets one sidebar component card through a dedicated searchable picker; linked targets of a multi-bound card are written together with the primary. Candidates span every sidebar page with a page badge, and components that already have a rule are hidden. Applying a profile writes every matching rule into the current controls in one transaction that rolls back on failure. Rules that cannot be matched or validated are listed for review instead of being silently skipped. Profiles are not embedded in workflows, so your own profiles stay available no matter which workflow is open.

### 🧭 Groups navigation

**Groups** replaces a floating canvas shortcut with a curated navigation list. Add only the visual groups you want to navigate, then assign each an optional target offset and zoom from 10% to 300%. Click a group row to jump directly. Hold the default backquote key (`Backquote`, above Tab) to open the navigation wheel near the canvas pointer, aim at a target, and release to jump; scroll to change wheel pages. The wheel activation key can be changed to any other single key. Entries, the wheel key, and target view settings are saved with the workflow.

### 📚 Prompt library

The **Library** view manages entries, flat categories, multi-membership favorite folders, tags, and one preview image per entry. Selected entries can be moved, exported, or deleted in one transaction, and each entry's full prompt can be copied with one click. The library exports the whole collection or the current filter as a ZIP with hashed assets, and imports current archives plus legacy `data.json + preview/` exports, with preflight review and per-entry conflict choices. Transfers are limited to 2 GiB and streamed instead of loaded into memory.

## ⚠️ Compatibility and limitations

- This preview has no compatibility layer for workflows created with the legacy package.
- `PromptAssistantBridge` was removed in 0.7.0 and `PromptCleaningMaid` in 0.8.0; workflows containing them must replace or remove those nodes before execution.
- App Mode is not supported.
- QuickGroupManager only controls visual groups in its current graph and does not propagate linkage rules across manager instances.
- SimpleNotify alerts only in the initiating frontend and does not represent whole-workflow or empty-queue completion.
- BooruGalleryNode depends on third-party site APIs and media hosts; availability, credentials, and favorite behavior remain controlled by each site. Only static JPG, PNG, WebP, and GIF posts are selectable.
- FetchFromKrita requires a locally running Krita with the bundled Bridge enabled and an active document.
- Prompt-library data lives in the current ComfyUI user directory and is not embedded in workflows; export it separately when moving between installations.
- Dashboard bindings automatically support simple native scalar/text/combo nodes and public subgraph widgets. A node containing an unknown custom widget or DOM panel requires an explicit adapter.

## 💬 Feedback and license

Report bugs and feature requests in [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues).

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
