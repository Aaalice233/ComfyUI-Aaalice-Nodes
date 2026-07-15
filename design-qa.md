# Parameter tooltip design QA

- Source visual truth: `C:/Users/Administrator/.codex/generated_images/019f666c-38dd-73e2-a577-7591b6f5a2ba/exec-ddfc43a8-2f22-48dd-a742-23bb70da5ba7.png`
- Implementation screenshot: `C:/Users/Administrator/.codex/visualizations/2026/07/15/019f666c-38dd-73e2-a577-7591b6f5a2ba/parameter-tooltip-implementation.png`
- Full-view comparison: `C:/Users/Administrator/.codex/visualizations/2026/07/15/019f666c-38dd-73e2-a577-7591b6f5a2ba/parameter-tooltip-comparison-final.png`
- Viewport: 459 × 425
- State: dark theme, parameter description tooltip open with heading and long Markdown body

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: 12px body, 18.6px line height, 13px semibold heading, and muted body copy preserve the selected direction's compact hierarchy and wrapping.
- Spacing and layout rhythm: the tooltip is content-sized with a 224px maximum width, 12px × 14px padding, 8px radius, and a restrained shadow. It no longer spans most of the node.
- Colors and visual tokens: foreground, muted copy, surface, border, link, and input colors resolve through ComfyUI tokens; the surface was darkened after the first comparison.
- Image quality and asset fidelity: the component contains no raster assets or substituted decorative imagery. The existing shared note icon remains the trigger in production.
- Copy and content: Markdown headings, paragraphs, lists, emphasis, code, and links retain their original content and receive distinct visual treatment.
- Accessibility and interaction: the existing `role="tooltip"`, `aria-describedby`, hover, keyboard focus, blur, and Escape behavior are unchanged. The preview produced no page-specific console errors.

## Comparison history

1. First pass: P2 — the 248px tooltip and lightened surface still read wider and heavier than the selected compact direction.
   - Fix: reduced maximum width to 224px and mixed the background toward the ComfyUI input surface.
2. Second pass: the browser-rendered tooltip matched the selected compact density and hierarchy; no P0/P1/P2 findings remained.

## Focused comparison evidence

The tooltip region was compared at the same 459 × 425 viewport because the surrounding generated node is illustrative and the production change is limited to the tooltip. The focused screenshot confirms width, wrapping, padding, typography, surface contrast, border, radius, and shadow.

## Follow-up polish

- P3: the generated concept includes a small visual pointer. It was not added because the existing trigger proximity already establishes ownership and the project avoids decorative custom shape systems.

final result: passed

---

# ParameterReceiver design QA

- Source visual truth: `C:/Users/Administrator/.codex/generated_images/019f666c-38dd-73e2-a577-7591b6f5a2ba/exec-3cb0ec9d-81a4-4f7a-9caf-50375151cf7b.png`
- Classic screenshot: `C:/Users/Administrator/.codex/visualizations/2026/07/15/019f666c-38dd-73e2-a577-7591b6f5a2ba/parameter-receiver-classic.png`
- Nodes 2.0 screenshot: `C:/Users/Administrator/.codex/visualizations/2026/07/15/019f666c-38dd-73e2-a577-7591b6f5a2ba/parameter-receiver-nodes2.png`
- Viewport: 1280 × 720
- State: dark theme, seven parameters, real collapsed KJ Get nodes on the left, bound and synchronized receiver, KJ Set nodes on the right

## Findings

No actionable P0, P1, or P2 differences remain.

- Hierarchy: the bound-panel line sits directly below the title, parameter sockets form the compact middle section, and the semantic status remains separated at the bottom.
- Geometry: the receiver keeps a 240px minimum width, 30px parameter rhythm, native sockets, and a compact height in both Classic and Nodes 2.0.
- Color and theme: body, border, muted text, success, and warning colors resolve through ComfyUI tokens. Status meaning is also stated in text.
- Interaction: binding creates real Set/Get nodes, structural changes show `需要同步`, manual sync restores `已同步`, and cloning without copied Gets shows `需要同步`.
- Accessibility: binding text is titled for truncation, the footer uses `role="status"` with `aria-live="polite"`, and hidden protocol slots are removed from Nodes 2.0 layout and accessibility flow.

## Comparison history

1. First GUI pass: P2 — the fixed 32-slot protocol reintroduced a large blank body in Nodes 2.0.
   - Fix: reused the ParameterPanel compact measurement pattern and added an idempotent MutationObserver for Vue slot DOM.
2. Second GUI pass: P1 — workflow reload in Nodes 2.0 recursively reinstalled the shared graph title watcher.
   - Fix: existing graph watcher registration now only adds the panel to the tracked set and never wraps its own reactive handler.
3. Third GUI pass: P2 — hidden Nodes 2.0 slots still participated in CSS layout, then the first positioning pass produced `NaNpx` slot offsets.
   - Fix: added an explicit hidden-slot rule and positioned visible native slots from the shared receiver layout constants.
4. Final same-input comparison: Classic and Nodes 2.0 preserve the selected option-one hierarchy and compact rhythm; no P0/P1/P2 findings remained.

## Follow-up polish

- P3: at very low graph zoom, ComfyUI's native node labels naturally truncate. The binding line keeps a title tooltip, so no custom zoom-specific label system was introduced.

final result: passed
