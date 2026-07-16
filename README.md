<p align="center">
  <img src="assets/banner.png" alt="ComfyUI-Aaalice-Nodes" width="100%" />
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

# ComfyUI-Aaalice-Nodes

Compact parameter controls and workflow utilities for ComfyUI.

> This package is a published preview. Workflows and behavior may change before the first stable release, and the package does not migrate data from ComfyUI-Danbooru-Gallery.

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
| `ParameterPanel` | `Aaalice/control` | Manage one parameter set and materialize only its active direct outputs. |
| `ParameterReceiver` | `Aaalice/control` | Bind a ParameterPanel and collect its KJ Get values behind one compact output surface. |
| `QuickGroupManager` | `Aaalice/control` | Enable, mute, or bypass color-scoped visual groups with ordering and linkage rules. |
| `EnumSwitch` | `Aaalice/tools` | Execute and output one branch selected by an exact string value. |
| `SimpleStringSplit` | `Aaalice/tools` | Split text by comma or pipe, trim whitespace, and remove empty parts. |
| `SimpleNotify` | `Aaalice/tools` | Send optional desktop and sound alerts at an execution point, then pass its value through. |

<details>
<summary><strong>EnumSwitch — lazy enum routing</strong></summary>

- Match `selector` against 1–32 exact branch keys; unmatched or unconnected branches fail visibly.
- Only the current branch count is materialized as native inputs; unused protocol inputs cannot affect node sizing or hit testing.
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

Deleting a connected parameter requires confirmation because its links must be removed. A panel can contain at most 32 value-producing parameters; separators do not consume outputs. Only value-producing parameters create native output slots, so unused protocol outputs cannot affect resizing, hit testing, or minimum height.

</details>

<details>
<summary><strong>ParameterReceiver — compact KJ Get receiver</strong></summary>

`ParameterReceiver` requires KJNodes Set/Get support for binding and synchronization. Create the receiver in the same graph as its source panel, then right-click it and choose **🔗 Bind Parameter Panel…**.

- The first bind reuses existing KJ Set nodes and asks before creating missing ones. Matching collapsed Get nodes are arranged to the receiver's left.
- Parameter renames and panel-title changes refresh labels automatically. Adding, deleting, or reordering parameters changes the footer to **Needs sync**; use **🔄 Sync from Parameter Panel** to apply structural changes.
- The receiver creates only the native input/output slots present in its binding, so no hidden protocol sockets can capture resize or link interactions.
- **🎯 Locate Parameter Panel** centers the bound source. **✂️ Detach** removes receiver-only managed Gets after confirming affected links.
- If the source panel is deleted, the receiver keeps its saved slot and link snapshot and reports **Source panel missing**. It can then be explicitly rebound.

KJNodes is optional for the package as a whole. Without it, ParameterReceiver workflows still load, but bind and sync report an error instead of simulating routing.

</details>

<details>
<summary><strong>QuickGroupManager — fast visual-group control</strong></summary>

QuickGroupManager is a frontend-only controller with no prompt inputs or outputs. It discovers visual groups in its current graph and gives every managed group one enabled switch. The node-wide **Mute / Bypass** switch determines how an off group is represented.

- Use the filter icon to manage all groups, multiple group colors, or uncolored groups. Multiple managers may use independent color scopes.
- Drag group rows to reorder them; filtered lists remain sortable and each manager saves its own order.
- Open the link icon on a row to configure what other groups should do when that group is enabled or disabled. Rules may target other colors and cascade only within the manager that initiated the change.
- Switching Mute / Bypass converts currently disabled groups in that manager's active color scope as one undoable change.
- External group changes and other managers update the display but do not trigger linkage rules.

The node controls only groups in its current graph. A grouped subgraph node can be switched like any other node, but QuickGroupManager does not recurse into the subgraph's internal graph.

</details>

<details>
<summary><strong>SimpleNotify — execution-point alerts</strong></summary>

Connect any value to receive one alert when execution reaches the node, then continue with the unchanged value. Desktop notifications and the bundled sound can be enabled independently, and sound volume is configurable. Use **🔔 Enable and Test Alerts** from the node menu to request browser permission and test the enabled channels.

The alert confirms only that execution reached this node. It does not wait for other parallel branches or for the queue to become empty. Browser/API restrictions can prevent desktop notifications or audio; headless API and CLI runs have no frontend alert surface.

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
- QuickGroupManager only controls visual groups in its current graph and does not propagate linkage rules across manager instances.
- SimpleNotify alerts only in the initiating frontend and does not represent whole-workflow or empty-queue completion.

Keep [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) installed separately if you still need its original nodes.

## Feedback and license

Report bugs and feature requests in [GitHub Issues](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes/issues).

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
