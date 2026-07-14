# Aaalice Nodes — Parameter Panel Context

Domain language for the parameter control surface (panel + break + pack). Implementation details live in code and ADRs, not here.

## Language

**ParameterControlPanel (参数面板节点)**:
A graph node that holds an ordered list of parameters and outputs a Param Pack.
_Avoid_: settings page, global config server

**Panel Instance (面板实例)**:
One ParameterControlPanel node on the current graph.

**Node Surface (节点面)**:
The on-node UI for using parameters — change values only; separators render as read-only section titles.

**Sidebar Editor (侧栏完全体)**:
The permanent sidebar editor for structure, configuration, and values of panel instances.

**Parameter (参数)**:
One list entry with a stable id, display name, type, value, and config. Tunable parameters count toward the break limit.

**Parameter Id (参数 id)**:
Hidden stable identity used as the Param Pack value key and for rebinding break links.
_Avoid_: treating the display name as identity

**Parameter Name (参数名)**:
Human-readable unique label within a panel (may be Chinese); used for display and break pin labels, not link identity.

**Separator (分隔)**:
Layout-only list entry; not included in the Param Pack; does not count toward the 32-slot limit.

**Param Pack (参数包)**:
Execution payload with ordered `_meta` and `_values` keyed by Parameter Id.

**ParameterBreak (参数展开)**:
Node that expands a Param Pack into up to 32 ordered outputs, rebinding links by Parameter Id when structure changes.

**Slot Order (输出槽序)**:
Order of non-separator parameters in the list; maps to ParameterBreak output indices.
