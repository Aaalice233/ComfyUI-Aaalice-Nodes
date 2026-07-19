import { performance } from "node:perf_hooks";
import { VirtualMasonryLayout } from "../js/lib/virtual_masonry.js";

const posts = Array.from({ length: 10_000 }, (_, index) => ({ source: "mock", postId: String(index), width: 320 + (index % 13) * 73, height: 240 + (index % 17) * 91 }));
const started = performance.now(); const layout = new VirtualMasonryLayout({ width: 760 }); layout.append(posts); const layoutMs = performance.now() - started;
let maximumVisible = 0; const scrollStarted = performance.now();
for (let top = 0; top < layout.totalHeight; top += 640) maximumVisible = Math.max(maximumVisible, layout.visible(top, 720).length);
const scrollMs = performance.now() - scrollStarted;
console.log(JSON.stringify({ posts: posts.length, columns: layout.columnCount, totalHeight: Math.round(layout.totalHeight), maximumVisible, layoutMs: Number(layoutMs.toFixed(2)), rangeScanMs: Number(scrollMs.toFixed(2)) }, null, 2));
if (maximumVisible > 240) process.exitCode = 1;
