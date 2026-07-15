# Parameter and Operation Context

This context defines the language for authoring reusable parameter sets and arranging workflow controls into an operating surface.

## Parameter authoring

**ParameterPanel (参数面板)**:
A graph node that owns one ordered parameter set and makes its adjustable values available to the workflow.
_Avoid_: ParameterControlPanel, child-panel container

**Parameter (参数)**:
One named, typed, adjustable value with a stable identity and optional description.
_Avoid_: Field, setting, slot

**Separator (分隔项)**:
A presentation-only item that groups Parameters without producing a value.
_Avoid_: Empty Parameter, heading Parameter

**Parameter Identity (参数身份)**:
The stable identity of a Parameter within its owning ParameterPanel; display name and position are not identity.
_Avoid_: Parameter name, output position

**Direct Parameter Output (参数直接输出)**:
The workflow-facing value produced by one Parameter without an intermediate unpacking node.
_Avoid_: Parameter pack, break output

## Workflow operation

**Operation Panel (操作面板)**:
A workflow-level surface for operating registered graph content without changing graph topology or parameter definitions.
_Avoid_: Parameter editor, execution panel

**Operation Page (操作页面)**:
A named top-level operating view with its own design size and ordered root Modules. A single unnamed page hides page navigation.
_Avoid_: Tab preset, workflow page

**Operation Module (操作模块)**:
A stable item owned by an Operation Page. Root Modules are placed by Anchor Frames; Node Cards inside a Group or Carousel are child Modules with automatic layout.
_Avoid_: Section, grid cell

**Root Module (根模块)**:
An Operation Module placed directly on an Operation Page rather than inside a Group Card or Carousel Group.
_Avoid_: Top-level card, grid item

**Node Card (节点卡片)**:
The single Operation Panel representation of one explicitly registered graph node or Subgraph.
_Avoid_: Node copy, panel instance

**Group Card (组合卡片)**:
A shared surface that arranges multiple Node Cards compactly without nested containers.
_Avoid_: Section, Subgraph

**Carousel Group (轮播组合)**:
A single anchored module that shows one Node Card or Group Card at a time and reserves the tallest slide height.
_Avoid_: Page tab, nested carousel

**Anchor Frame (锚点框架)**:
The saved anchor, offsets, alignment, and width that resolve a Root Module against its Page design size; height remains content-driven.
_Avoid_: fixed grid cell, responsive breakpoint

**Value Preset (参数值预设)**:
A reusable snapshot of writable values from an Operation Page or selected Root Modules and their descendants; it does not contain graph structure or panel layout.
_Avoid_: Workflow preset, layout preset
