# Anchored modular Operation Panel

Status: Accepted.

The old `Page → Section → Card` list remained easy to implement but could not reproduce a purpose-built WebUI when a workflow exposed many controls. A mandatory responsive grid would save space but would also keep rearranging author intent. A fully free per-control canvas would be powerful, but it would duplicate widget layout logic and create an unmaintainable responsive editor.

Operation Panel therefore uses `Panel → Page → Module`. Only Root Modules use UMG-style anchors. A saved `1440×900` or `1920×1080` size is a minimum design baseline rather than a fixed canvas; wider workspaces become the runtime viewport, while narrower workspaces scroll. Adaptive-window pages continuously use the available workspace with a `960×640` safety floor. Node Card contents and child Modules inside containers continue to use automatic layout. The author may align and snap Root Modules to a runtime-width 12-column guide and an 8px fine grid, but those guides are not serialized cells. Module height is content-driven and overlap is forbidden.

Window resizing resolves Anchor Frames against a transient runtime viewport and never changes workflow state. When responsive anchors would collide, the runtime canvas expands until the saved frames no longer overlap; scrollbars appear instead of moving or serializing Modules.

Pages are separate operating surfaces. Node Cards may be combined into one shared Group Card or into a Carousel Group whose slides are Node Cards or unnested Group Cards. Heading and safe Markdown are presentation Modules. Container nesting stops at one Group inside one Carousel; arbitrary nesting is rejected so layout, preset scope, focus, and cleanup stay deterministic.

Graph nodes and Subgraphs enter the panel only through their own context menu and can be removed only while editing the panel. Removing a Module or Page never removes workflow nodes. Operation layout uses workflow state `version: 3`; older Operation Panel state is reset without migration because this is a breaking preview release.

Third-party node support is exposed through `globalThis.aaaliceOperationPanel.v1`. Adapters register by node type, may declare a title, minimum width, controls renderer, results renderer, and preset controls, and render through framework components. An advanced whole-card renderer can replace both standard regions. Custom DOM renderers must return cleanup logic and follow ComfyUI theme, lifecycle, and accessibility rules. Version mismatch, invalid declarations, duplicate registration, duplicate preset keys, and render errors are explicit failures.
