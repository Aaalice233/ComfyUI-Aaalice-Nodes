# Dual surface: node values + permanent sidebar editor

The parameter panel is used both while running a graph (quick value tweaks) and while designing it (add/remove/reorder/configure). Putting the full editor only on the node bloats the canvas and fights Nodes 2.0; sidebar-only makes daily tweaking clumsy.

We split **Node Surface** (values only) from a **permanent sidebar editor** (full structure + values), with multiple panel instances switched manually via tabs. Graph selection does not drive the active instance.
