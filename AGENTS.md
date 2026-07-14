# AGENTS.md

协作者与 AI 助手用。与当次指令冲突时以当次为准。**本文件宜 ≤500 行**。

**文档分工（勿混用）：**

| 文件 | 写什么 | 不写什么 |
|------|--------|----------|
| **本文件 `AGENTS.md`** | 硬性约定、目录/菜单/i18n/双模式/JS 挂载、日志路径、检查清单 | 用户安装说明、长篇进度叙事 |
| **README / README.zh-CN** | 进度表、安装、面向使用者的说明 | 协作硬规则 |
| **docs/adr/** | 难逆决策的 Why | 日常操作步骤 |

实现时以本文件 + 当次指令为准；进度以 README 为准。

## 项目原则

重置 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。**当前条目与下一跳**见 [README](./README.md) / [README.zh-CN](./README.zh-CN.md)（仅排期，不含协作硬规则）。

- 按 README **优先级队列**重写，禁止整包复制；**# 为稳定 id**；改范围先问
- **`__init__.py` 极薄**；节点在 `nodes/<domain>/`；依赖少且先征得同意
- 禁止静默吞错 / 假成功
- **标识符英文**；**用户文案 en+zh i18n**（跟 Comfy 界面语言）
- **README 双语同步**；`pyproject.toml` 的 `readme` → `README.md`
- **菜单** `category = "Aaalice/<domain>"`（顶级仅 `Aaalice`）
- **双渲染兼容**：经典模式 **与** [Nodes 2.0](https://docs.comfy.org/interface/nodes-2) 都要可用
- 暂不考虑 [App Mode](https://docs.comfy.org/interface/app-mode)
- 提交：`type(scope): 中文描述`
- 验证：加载 + 主路径；**经典 + Nodes 2.0**；en/zh

### 文档与双语

| 文件 | 语言 |
|------|------|
| `README.md` | English（Registry 默认） |
| `README.zh-CN.md` | 简体中文 |

两文件结构对齐；页顶互链；进度变更同一改动内双改。

### 发布

`PublisherId=aaalice`；包名 `comfyui-aaalice-nodes`。升 `version` → push `main` → Actions。Secret：`REGISTRY_ACCESS_TOKEN`。  
`.comfyignore` 排除协作杂项（含 `AGENTS.md`、`.grok/` 等）；勿排除运行时代码。

## 调试与日志

以下路径均相对仓库根 `ComfyUI-Aaalice-Nodes/`。

本仓库在 `custom_nodes/` 下时，Comfy 安装根约为 `../../..`；Desktop 的实际布局以本机日志为准。

| 用途 | 相对路径（相对本仓库） |
|------|------------------------|
| 当前主日志 | `../../../logs/comfyui.log` |
| 轮转日志 | `../../../logs/comfyui.log_*.log` |
| user 日志 | `../../user/comfyui.log`、`../../user/comfyui_8189.log`（端口号随实例变） |
| 前端根（Desktop） | 日志里 `web root:` 指向 `.venv/.../comfyui_frontend_package/static` |

- **后端 / 节点导入 / HotReload**：看上表 server 日志。  
- **JS 报错**：不在 server 日志；看浏览器 **F12 → Console**。  
- 本机日志曾见 **`[LG_HotReload] 模块重载成功: ComfyUI-Aaalice-Nodes`**：**只重载 Python，不重载 JS**。改前端后须 **硬刷新 / 重启 Comfy**，勿只靠 HotReload。  
- GUI 地址以日志 `To see the GUI go to: http://127.0.0.1:PORT` 为准（曾见 **8189**，勿写死 8188）。

## 仓库结构

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py          # WEB_DIRECTORY + comfy_entrypoint
├── pyproject.toml / requirements.txt
├── AGENTS.md / README.md / README.zh-CN.md
├── docs/adr/            # 架构决策
├── locales/{en,zh}/     # main, nodeDefs, settings, commands
├── js/                  # WEB_DIRECTORY；**/*.js 都会被加载
│   ├── extension.js · i18n.js
│   ├── parameter_*.js   # 参数面板相关（根级，import 用 ../../scripts/）
│   └── lib/             # theme.css、param_model 等共享
├── nodes/               # V3 按域：tools / prompt / media / control / gallery / krita
│   └── _lib/            # 纯逻辑，禁止 ComfyNode
└── server/              # 可选 HTTP
```

**按需建域**；禁止空壳占位。默认一节点一文件；共享同一实现的别名节点可同文件。

### 菜单 category

`Aaalice/<domain>`，domain ∈ tools|prompt|media|control|gallery|krita。禁止挂原版根分类。

| 域 | 条目（#） | category |
|----|-----------|----------|
| tools | 1,3–9（2 已砍） | `Aaalice/tools` |
| prompt | 10–12 | `Aaalice/prompt` |
| media | 13–14,23 | `Aaalice/media` |
| control | 15–19（20 纯 JS） | `Aaalice/control` |
| gallery | 21–22 | `Aaalice/gallery` |
| krita | 24–25 | `Aaalice/krita` |

### 放置要点

1. 根 `__init__.py` 不写业务节点  
2. `nodes/<domain>/__init__.py` 导出 `NODE_CLASSES`  
3. `nodes/_lib/` 可单测纯逻辑  
4. 有 UI → `js/`（根级或 `js/<domain>/`）；`import { app } from "../../scripts/app.js"`（文件在 `js/` 根时）  
5. `pyproject.toml` packages 含新域  

## 前端与自绘 UI

### 双模式

| 模式 | 含义 |
|------|------|
| 经典 | Nodes 2.0 **关** |
| Nodes 2.0 | Nodes 2.0 **开**（Vue 节点壳） |

禁止只适配其一。有 UI 时两模式都要：添加、显示、改值、存盘、执行。

### 自绘 UI 挂载与交互

来源：官方 [JS overview](https://docs.comfy.org/custom-nodes/js/javascript_overview) / [objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)；节点面画布参考 [comfyui-quick-latent](https://github.com/Zhen-Bo/comfyui-quick-latent)。

1. **`WEB_DIRECTORY = "./js"`**；Comfy 加载该目录下 **全部 `**/*.js`**。  
2. 扩展用 `app.registerExtension`；`import { app } from "../../scripts/app.js"`（`js/` 根文件）。  
3. **挂载钩子要覆盖完整生命周期**：`beforeRegisterNodeDef`（包装 `onNodeCreated`）+ **`nodeCreated`** + `loadedGraphNode` / `setup` 补挂。
4. **有交互的节点面优先同步挂载 `addDOMWidget`**：经典模式和 Nodes 2.0 共用同一份 DOM；Canvas 钩子仅用于非交互装饰或明确的经典模式专用效果。
   - Schema 尽量不暴露内部字段；若有遗留原生 widget，应移除或隐藏。
   - 在 `nodeCreated` / `onNodeCreated` 内同步调用 `addDOMWidget`，禁止先 `await`；i18n 用 `.then(redraw)`。
   - 必须提供 `getMinHeight` / `getHeight`，并随内容更新节点最小尺寸。
   - FE 1.45 的 DOM widget 会在已有 `node.graph` 时立即注册，否则由 `onAdded` 完成注册；不要自行绕过该生命周期。
5. **侧栏 / 复杂表单** 使用 DOM + `theme.css`（`registerSidebarTab`）。
6. **Canvas 自绘不作为双模式交互控件方案**：Nodes 2.0 使用 Vue 节点壳，不执行 LiteGraph 节点主体、widget 和节点级鼠标绘制链；照抄 quick-latent 的 `onDrawForeground` / `onMouseDown` 只覆盖经典模式。
7. **内部状态不要用 Schema 可见 STRING / forceInput**：  
   - `converted-widget` 藏不住「参数 JSON」/`[]`。  
   - **正确**：Schema 无该字段；`accept_all_inputs=True`；`node.properties` + `graphToPrompt` 注入 `inputs.parameters_json`。  
8. 状态真源：`node.properties`；执行靠 prompt 注入。  
9. **禁止中英硬拼同一条文案**；日志英文可。  
10. 改 JS：**硬刷新 / 重启**；LG_HotReload **不重载前端**。删旧节点再添加。

### 参数面板约定（#15–16）

- **节点面（Canvas）**：只改值；分隔 = 分组标题；下拉点击循环选项  
- **侧栏「参数面板」**：完全体（结构+配置+改值）；多实例 Tab 手动切换  
- 参数 **隐藏稳定 id**；`_values` 以 id 为键；Break 按 id 重绑连线  
- 可调参数 ≤32；空包合法  
- 难逆产品/架构决策：`docs/adr/`

### UI token（摘要）

**侧栏 DOM**（`js/lib/theme.css`）：**跟随 ComfyUI 自带主题**，映射 `--fg-color` / `--descrip-text` / `--comfy-menu-secondary-bg` / `--comfy-input-bg` / `--border-color` / `--p-primary-color` 等；**不要**写死紫色或 herdi 暖色。换亮/暗主题侧栏应跟着变。

**参数节点 DOM**（沿用 quick-latent 紫系，仅节点面，与侧栏无关）：

| 用途 | 色 |
|------|-----|
| 控件底 | `#252538` |
| 边框 | `#3f3b5a` |
| 选中/滑条 | `#815fc8` |
| 选中描边 | `rgba(229,219,255,.58)` |
| 次要字 | `#918da3` / `#8d899f` |
| 主值字 | `#e8e8f0` |

## 参考文档

- 后端：[overview](https://docs.comfy.org/custom-nodes/overview) · [V3](https://docs.comfy.org/custom-nodes/v3_migration)  
- 前端：[JS](https://docs.comfy.org/custom-nodes/js/javascript_overview) · [hooks](https://docs.comfy.org/custom-nodes/js/javascript_hooks) · [i18n](https://docs.comfy.org/custom-nodes/i18n) · [Nodes 2.0](https://docs.comfy.org/interface/nodes-2)  
- [llms.txt](https://docs.comfy.org/llms.txt)

## 国际化（i18n）

仅 **en** + **zh**。目录 `locales/{en,zh}/{main,nodeDefs,settings,commands}.json`。Comfy 自动扫描，无需在 `__init__.py` 注册。

| 层 | 内容 |
|----|------|
| 序列化 / schema id | 英文稳定键 |
| `nodeDefs.json` | 显示名、tooltip、COMBO 展示 |
| Schema display_* | 英文 fallback |
| 自绘 DOM | `main.json` → `aaalice.*`，`js/i18n.js` 的 `t()` |

禁止中文当 COMBO **值** / 路径；禁止只更新一侧 locale。输出 nodeDefs 键为 `"0"`,`"1"`…

```javascript
import { ensureI18nReady, t } from "./i18n.js";
await ensureI18nReady();
t("aaalice.common.confirm", "Confirm");
```

## 完成检查

- [ ] `node_id` / 输入输出 id 英文；`category=Aaalice/<domain>`  
- [ ] en+zh `nodeDefs`（及 settings/commands）对齐  
- [ ] 经典 + Nodes 2.0 主路径  
- [ ] 有 UI：`nodeCreated`（+ setup 补挂）；经典与 Nodes 2.0 均可见可点
- [ ] 双模式交互节点面：同步 `addDOMWidget` + `getMinHeight` / `getHeight`，勿先 await
- [ ] 内部字段无用户引脚、无裸 `[]` 文本框；自绘文案单语 i18n  
- [ ] 双语 README 进度已更新  
