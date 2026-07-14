# Aaalice Parameter and Operation Context

Domain language for authoring reusable parameter sets and arranging workflow controls into an operating surface.

## Language

**ParameterPanel (参数面板)**:
A graph node that owns one ordered parameter set and exposes up to 32 direct AnyType outputs.
_Avoid_: ParameterControlPanel, child-panel container

**Parameter (参数)**:
One named, typed value with a stable identity, optional description, and configuration. A separator is presentation-only.

**Parameter Id (`parameter_id`)**:
The stable identity of a Parameter within its owning ParameterPanel. Its name and position are not identity.

**Composite Parameter Identity (参数复合身份)**:
The identity tuple `node_id + parameter_id`, used when a Parameter crosses graph-node boundaries.

**Direct parameter output (参数直接输出)**:
The output at position `output_1` … `output_32` carries the current tunable parameter value. `slotMeta` keeps each output bound to a stable Parameter Id when parameters are reordered.

**Operation Panel (操作面板)**:
A workflow-level surface for operating registered graph content without changing graph topology or parameter definitions.

**Operation Page (操作页面)**:
A top-level view in the Operation Panel that contains ordered Sections.

**Operation Section (操作分区)**:
An ordered group of Operation Cards within one Operation Page.

**Operation Card (操作卡片)**:
The single Operation Panel representation of one registered graph node.

**Page Value Preset (页面值预设)**:
A reusable snapshot of writable control values from one Operation Page. It does not contain nodes, definitions, links, or layout.
