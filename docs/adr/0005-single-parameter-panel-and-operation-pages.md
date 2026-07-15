# Single ParameterPanel nodes and paged Operation Panel

Status: Accepted.

The multi-child-panel container reduced node count but made one graph node own unrelated execution, editing, dynamic-output, and link-rebinding concerns. We instead use one ParameterPanel per parameter set with direct outputs. Its canvas surface is value-only and deliberately has no structural toolbar; a right-click editor owns atomic definition changes.

Multiple panels are composed in the workflow-level Operation Panel as Pages, Sections, and Cards. ParameterPanel nodes register automatically, ordinary nodes register explicitly, and node titles remain display text rather than an integration protocol. Page Value Presets store only adapter-exposed values, never nodes, parameter definitions, links, or layout. This preserves graph semantics while providing a WebUI-like operating surface.

This decision was made before the first Registry release, so it replaced the previous node type, workflow payload, and Operation Panel schema without a compatibility layer.
