# Operation Panel Card Design QA

- Source visual truth: `C:/Users/Admin/AppData/LocalLow/Tencent/WeType/ClipboardTmp/1784111934906_d.png` (ParameterPanel node).
- Implementation screenshot: `C:/Users/Admin/.codex/visualizations/2026/07/15/019f6354-bd04-73d3-89c1-3d62e3096f99/operation-panel-card-full.jpg`.
- Focused comparison: `C:/Users/Admin/.codex/visualizations/2026/07/15/019f6354-bd04-73d3-89c1-3d62e3096f99/operation-card-comparison.jpg`.
- Viewport: 1280 × 720.
- State: dark theme, Simplified Chinese, Operation Panel browse mode, one default-style ParameterPanel Node Card.

## Findings

No actionable P0, P1, or P2 mismatch remains.

- The card now follows the node's compact hierarchy: 36px header, 48px stacked fields, 11px muted labels, and 32px controls.
- Controls, card chrome, borders, foregrounds, and focus colors resolve through the same compact token set as the ParameterPanel node.
- Native node-only chrome such as output sockets and the seed-lock affordance is intentionally not duplicated by the Operation Panel card.

## Fidelity Surfaces

- Fonts and typography: both surfaces use the ComfyUI font stack. Parameter labels share the same 11px semi-bold muted treatment; the Operation Panel title remains slightly stronger to preserve standalone card hierarchy.
- Spacing and layout rhythm: the focused comparison shows the same label-above-control rhythm. All six fields measure 48px, all interactive controls measure 32px, and the card header measures 36px.
- Colors and visual tokens: node widgets and Operation modules share the `--aaalice-compact-*` token family; no new fixed brand color was introduced.
- Image quality and assets: the card contains no raster content. Select arrows continue to use the shared project icon registry; no placeholder or hand-drawn asset was added.
- Copy and content: labels and values match the source ParameterPanel. The Operation Panel keeps its useful node id metadata.

## Evidence

- Full-view capture shows the 360 × 350 card inside the real responsive Operation Panel workspace without visible clipping or overlap.
- The focused side-by-side comparison normalizes both cards to the same visual height and makes typography, field rhythm, input surfaces, borders, and radii directly comparable.
- Sampler selection accepted its current value; the seed numeric editor opened and cancelled with `Escape`; the workspace collapsed to zero portals and reopened to one portal.
- No new `[Aaalice]` console error was observed. Existing ComfyUI startup/fetch errors were `ComfyApp graph accessed before initialization`, `[vite:preloadError] Object`, and Jobs API fetch failures.

## Comparison History

- The previous implementation used a two-column field row, 34–38px controls, a 40px card header, heavier shadow, and separate DOM builders for built-in fields and adapter fields.
- The implementation now uses one public field constructor and one Module Surface primitive. The post-fix comparison shows the intended compact node-like density and consistent control surfaces.

## Implementation Checklist

- [x] Default Node Card aligned with the ParameterPanel node density.
- [x] Compact, emphasis, and borderless styles remain surface variants rather than separate renderers.
- [x] Built-in, generic Subgraph, and third-party adapter fields share one constructor.
- [x] Obsolete `row` and `pill` names and their dataset dependency were removed.
- [x] Primary interactions, workspace lifecycle, static checks, and existing tests pass.

final result: passed
