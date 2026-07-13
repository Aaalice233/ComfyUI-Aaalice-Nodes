/**
 * ComfyUI-Aaalice-Nodes 前端扩展入口。
 * 后续节点 UI / 侧栏 / 命令在此包名下按需注册 hooks。
 *
 * i18n：节点定义文案由 `locales/` 自动加载；自绘 UI 用 `./i18n.js` 的 `t` / `tAsync`。
 */
import { app } from "../../scripts/app.js";
import { ensureI18nReady } from "./i18n.js";

app.registerExtension({
	name: "ComfyUI.Aaalice.Nodes",

	async setup() {
		// 预加载本包 + 其它 custom node 的 locales，供自绘 UI 同步 `t()` 使用
		await ensureI18nReady();
	},
});
