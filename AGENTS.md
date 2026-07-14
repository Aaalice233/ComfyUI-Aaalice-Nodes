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
- **当前节点包处于未发布的重构状态，无需保证向后兼容**；发布前可直接替换未发布的工作流结构、前端协议与节点行为，不保留迁移壳或旧数据兼容路径
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

## 前端与 UI

### 双模式

| 模式 | 含义 |
|------|------|
| 经典 | Nodes 2.0 **关** |
| Nodes 2.0 | Nodes 2.0 **开**（Vue 节点壳） |

禁止只适配其一。有 UI 时两模式都要：添加、显示、改值、存盘、执行。

### 渲染边界

来源：官方 [JS overview](https://docs.comfy.org/custom-nodes/js/javascript_overview) / [objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)。

| 表面 | 经典模式 | Nodes 2.0 | 本包规则 |
|------|----------|-----------|----------|
| 节点内交互控件 | LiteGraph 节点 + DOM widget | Vue 节点壳 + DOM widget | 同步 `addDOMWidget`，两模式共用一份 DOM |
| 节点输出 socket | LiteGraph Canvas `NodeSlot.draw()` | Vue `SlotConnectionDot` | 修改 slot 数据，不用节点 DOM CSS 假装修复 |
| 侧栏 / 弹窗 | DOM | DOM | `theme.css` 跟随 ComfyUI token |

Canvas 钩子仅用于非交互装饰或明确的经典模式专用效果。`comfyui-quick-latent` 可作视觉参考，但其 Canvas 交互方案不能直接当作 Nodes 2.0 双模式实现。

### 挂载与状态

1. **`WEB_DIRECTORY = "./js"`**；Comfy 加载该目录下 **全部 `**/*.js`**。  
2. 扩展用 `app.registerExtension`；`import { app } from "../../scripts/app.js"`（`js/` 根文件）。  
3. **挂载钩子要覆盖完整生命周期**：`beforeRegisterNodeDef`（包装 `onNodeCreated`）+ **`nodeCreated`** + `loadedGraphNode` / `setup` 补挂。
4. **有交互的节点面同步挂载 `addDOMWidget`**：
   - Schema 尽量不暴露内部字段；若有遗留原生 widget，应移除或隐藏。
   - 在 `nodeCreated` / `onNodeCreated` 内同步调用 `addDOMWidget`，禁止先 `await`；i18n 用 `.then(redraw)`。
   - 必须提供 `getMinHeight` / `getHeight`，并随内容更新节点最小尺寸。
   - FE 1.45 的 DOM widget 会在已有 `node.graph` 时立即注册，否则由 `onAdded` 完成注册；不要自行绕过该生命周期。
5. **侧栏 / 复杂表单** 使用 DOM + `theme.css`（`registerSidebarTab`）。
6. **内部状态不要用 Schema 可见 STRING / forceInput**：
   - `converted-widget` 藏不住「参数 JSON」/`[]`。  
   - **正确**：Schema 无该字段；`accept_all_inputs=True`；`node.properties` + `graphToPrompt` 注入内部 prompt payload（参数节点当前为 `inputs.parameters_json`）。
7. 状态真源：`node.properties`；执行靠 prompt 注入。
8. **禁止中英硬拼同一条文案**；日志英文可。
9. 改 JS：**硬刷新 / 重启**；LG_HotReload **不重载前端**。若序列化的 slot / widget 仍保留旧形态，删旧节点再添加。

### 经典模式自定义 socket 踩坑

- **现象**：`ParameterPanel` 的 `AAALICE_PARAM_PACK` 输出旁出现只有该节点才有的紫色小点；关闭 Nodes 2.0 后仍可复现。
- **根因**：经典模式的输出 socket 由 LiteGraph Canvas `NodeSlot.draw()` 绘制，不属于 `.aaalice-pcp-node-root` DOM。`AAALICE_PARAM_PACK` 不是 ComfyUI 内置类型，未显式提供 slot 颜色时会走连接颜色表的默认紫色；因此修改 `theme.css`、DOM 伪元素或 Nodes 2.0 的 `SlotConnectionDot` 都不会解决经典模式的紫点。
- **已踩过的错误方向**：只把 `shape` 改成 `HollowCircle` 仍会保留自定义类型的默认颜色，而且小尺寸下更像两个叠加标记；不要再用空心圆掩盖颜色来源。
- **正确做法**：挂载 `ParameterPanel` 时为唯一输出设置原生圆形 `shape`，并显式设置 `color_off` / `color_on`：未连接取当前主题次级文字色，连接后取主题强调色。圆点外观可以保留，问题在默认紫色而不在圆形本身；保留原生 hit-test 与接线热区，禁止用透明色或 CSS 隐藏 socket。
- **注册状态不是 Canvas 装饰**：Operation Panel 注册信息只存在工作流元数据和侧栏中，禁止再用 `onDrawForeground` 在节点右上角绘制紫点或其它状态点。
- **排查顺序**：先确认复现模式，再检查 `node.outputs` 的 `type / shape / color_off / color_on` 与输出数量；不要看到点状图形就先归因于 Nodes 2.0 或 DOM 重影。

### 参数面板约定（#15–16）

- `ParameterPanel` 是**单参数集节点**：一个节点管理 0–32 个可调参数并固定输出一个 `Param Pack`；禁止恢复多子面板、动态多输出或 `panel_id`
- 新节点自带常用采样参数：Steps、CFG、Sampler、Scheduler、Denoise、Seed；Seed 固定放在默认模板最后，Sampler / Scheduler 跟随 ComfyUI 当前选项
- **节点面只显示和调值**：直接从第一项参数开始，禁止恢复面板切换、加号、铅笔、锁定或更多按钮组成的顶栏
- **结构编辑只走节点右键菜单**：宽屏双栏编辑器使用草稿，保存时统一校验、确认断线并原子应用；不提供锁定功能
- 参数说明在名称与 `?` 悬浮时展示本地安全 Markdown tooltip；滑条手柄 hover / active / focus 必须有主题化高亮
- 参数身份为 `node_id + parameter_id`；参数名和顺序只用于显示。Break 继续按 `parameter_id` 重绑连线
- **Operation Panel 是通用操作侧栏**：ParameterPanel 新建时自动注册到活动页面，普通节点右键显式注册；标题只用于显示，不作为协议
- Operation Panel 只负责轻量调值、模型选择、结果查看与工作流级布局；不创建 / 删除 / 连线节点，不修改参数定义，也不提供独立执行按钮
- Operation Panel 使用页面 → 分区 → 卡片三级布局，支持排序、隐藏、侧栏别名和保留 Comfy 顶栏的全屏网格；一个节点只能出现一次
- 页面值预设保存到 Comfy `user` 目录，只携带 adapter 暴露的可写值；不携带节点、定义、连线或布局
- 难逆产品/架构决策：`docs/adr/`

### UI token（摘要）

**侧栏 DOM**（`js/lib/theme.css`）：**跟随 ComfyUI 自带主题**，映射 `--fg-color` / `--descrip-text` / `--comfy-menu-secondary-bg` / `--comfy-input-bg` / `--border-color` / `--p-primary-color` 等；**不要**写死紫色或 herdi 暖色。换亮/暗主题侧栏应跟着变。

**参数节点 DOM**：与侧栏一样跟随 ComfyUI 主题 token，禁止固定品牌紫色。控件背景、边框、文字分别映射 `--comfy-input-bg`、`--border-color`、`--fg-color`；选中态、滑条进度和焦点边框使用 `--p-primary-color` / `--primary-color`。Canvas socket 颜色不受这些 DOM token 直接控制，按上方“自定义 socket 踩坑”单独处理。

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
- [ ] 自定义输出类型：经典模式检查 socket `shape / color_off / color_on`，不得只看 DOM CSS
- [ ] 内部字段无用户引脚、无裸 `[]` 文本框；自绘文案单语 i18n  
- [ ] 双语 README 进度已更新  
