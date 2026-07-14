# Node authoring and a general Operation Panel

Status: Superseded by [ADR 0005](./0005-single-parameter-panel-and-operation-pages.md).

The old split made the graph node a value-only display and gave a permanent parameter-specific sidebar ownership of structure editing. It also required one graph node per parameter set. This crowded workflows, coupled the sidebar to one node type, and made discovery depend on panel-instance switching.

ParameterControlPanel is now a multi-child-panel authoring container. Its node surface owns the complete parameter lifecycle: values, definitions, order, descriptions, locks, cross-panel operations, and presets. All child panels execute simultaneously; the active tab is only an editing view.

The sidebar becomes a general **Operation Panel** for lightweight operation of explicitly registered workflow content. Registration is workflow metadata created from a node context-menu command. It does not overload node titles: titles remain free to communicate graph intent and graph readability does not become an integration protocol.

Each registered parameter child panel is an independent layout item. Ordinary nodes are adapted from supported widgets; complex nodes may provide a dedicated adapter. Operation Panel can organize, alias, hide, and place items, including a fullscreen grid, but it cannot edit parameter definitions or graph topology and does not duplicate ComfyUI's execution controls.

This decision supersedes ADR 0001. The package is still in an unpublished refactor phase, so the new model replaces the old single-panel shape without a compatibility layer.
