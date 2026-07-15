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
A top-level operating view that contains ordered Operation Sections.
_Avoid_: Tab preset, workflow page

**Operation Section (操作分区)**:
An ordered group of Operation Cards within one Operation Page.
_Avoid_: Parameter group, node group

**Operation Card (操作卡片)**:
The single Operation Panel representation of one registered graph node.
_Avoid_: Node copy, panel instance

**Page Value Preset (页面值预设)**:
A reusable snapshot of writable values from one Operation Page; it does not contain graph structure or panel layout.
_Avoid_: Workflow preset, layout preset
