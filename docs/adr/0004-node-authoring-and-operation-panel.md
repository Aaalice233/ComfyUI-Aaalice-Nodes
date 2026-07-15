# Node authoring and a general Operation Panel

Status: Superseded by [ADR 0005](./0005-single-parameter-panel-and-operation-pages.md).

The old split made the graph node a value-only display and gave a permanent parameter-specific sidebar ownership of structure editing. It also required one graph node per parameter set. This crowded workflows, coupled the sidebar to one node type, and made discovery depend on panel-instance switching.

ParameterControlPanel is now a multi-child-panel authoring container. Its node surface owns the complete parameter lifecycle: values, definitions, order, descriptions, locks, cross-panel operations, and presets. All child panels execute simultaneously; the active tab is only an editing view.

The sidebar becomes a general **Operation Panel** for lightweight operation of explicitly registered workflow content. Registration is workflow metadata created from a node context-menu command. It does not overload node titles: titles remain free to communicate graph intent and graph readability does not become an integration protocol.

Each registered parameter child panel is an independent layout item. Ordinary nodes are adapted from supported widgets; complex nodes may provide a dedicated adapter. Operation Panel can organize, alias, hide, and place items in a workspace overlay that preserves ComfyUI navigation, but it cannot edit parameter definitions or graph topology and does not duplicate ComfyUI's execution controls.

This decision superseded ADR 0001. It was made before the first Registry release, so the new model replaced the old single-panel shape without a compatibility layer.
