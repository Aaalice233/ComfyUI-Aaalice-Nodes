# AGENTS.md

供协作者与 AI 助手使用；与当次明确指令冲突时，以当次指令为准。**本文件必须保持在 500 行以内。**

## 1. 项目与协作原则

本项目重置 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。当前条目与下一跳见 [README](./README.md) / [README.zh-CN](./README.zh-CN.md)。

- 按 README **优先级队列**重写，禁止整包复制；`#` 是稳定 id；变更排期范围前先问。
- 节点包处于未发布重构阶段，无需保留未发布工作流、前端协议或节点行为的兼容壳。
- 遵循最小依赖：新增依赖前先征得同意；禁止静默吞错或伪造成功。
- 标识符使用英文；用户文案必须提供 en + zh i18n，并跟随 ComfyUI 界面语言。
- 节点必须同时支持经典模式和 Nodes 2.0；暂不考虑 App Mode。
- 提交消息使用 `type(scope): 中文描述`。

### 1.1 文档分工

| 文件 | 内容 | 不包含 |
|---|---|---|
| `AGENTS.md` | 硬性约定、架构边界、调试验证、检查清单 | 安装说明、长篇进度 |
| `README.md` / `README.zh-CN.md` | 进度、安装、用户说明 | 协作硬规则 |
| `docs/adr/` | 难逆决策及其 Why | 日常操作步骤 |
| `docs/design/` | 设计语言、组件规范 | 工作流协议决策 |

- `README.md` 使用 English（Registry 默认），`README.zh-CN.md` 使用简体中文。
- 两份 README 结构对齐、页顶互链；进度变化必须在同一改动中双语同步。
- `pyproject.toml` 的 `readme` 固定指向 `README.md`。

## 2. 仓库与节点架构

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py          # WEB_DIRECTORY + comfy_entrypoint；禁止业务节点
├── pyproject.toml / requirements.txt
├── AGENTS.md / README.md / README.zh-CN.md
├── docs/{adr,design}/   # 决策与设计规范
├── locales/{en,zh}/     # main, nodeDefs, settings, commands
├── js/                  # WEB_DIRECTORY；**/*.js 都会被加载
│   ├── extension.js · i18n.js · parameter_*.js
│   └── lib/             # ui.js/ui.css、theme.css、param_model 等共享实现
├── nodes/               # V3 按域组织
│   └── _lib/            # 纯逻辑，禁止 ComfyNode
└── server/              # 可选 HTTP
```

- 根 `__init__.py` 必须极薄；节点放在 `nodes/<domain>/`，默认一节点一文件。
- `nodes/<domain>/__init__.py` 导出 `NODE_CLASSES`；`pyproject.toml` packages 同步包含新增域。
- `nodes/_lib/` 只放可单测的纯逻辑；禁止空壳域或占位文件。
- 有 UI 时放在 `js/` 或 `js/<domain>/`；`js/` 根文件导入 app 使用 `../../scripts/app.js`。

### 2.1 菜单 category

统一使用 `Aaalice/<domain>`，禁止挂到原版根分类。

| 域 | 条目（#） | category |
|---|---|---|
| tools | 1,3–9（2 已砍） | `Aaalice/tools` |
| prompt | 10–12 | `Aaalice/prompt` |
| media | 13–14,23 | `Aaalice/media` |
| control | 15–19（20 纯 JS） | `Aaalice/control` |
| gallery | 21–22 | `Aaalice/gallery` |
| krita | 24–25 | `Aaalice/krita` |

## 3. 前端与 UI

### 3.1 双模式与渲染边界

| 表面 | 经典模式 | Nodes 2.0 | 本包规则 |
|---|---|---|---|
| 节点内交互控件 | LiteGraph + DOM widget | Vue 节点壳 + DOM widget | 同步 `addDOMWidget`，共用一份 DOM |
| 节点输出 socket | `NodeSlot.draw()` | `SlotConnectionDot` | 修改 slot 数据，不用 DOM CSS 伪装修复 |
| 侧栏 / 弹窗 | DOM | DOM | 组件库 + ComfyUI theme token |

- 禁止只适配一种模式；有 UI 时两种模式都要完成添加、显示、改值、存盘和执行。
- Canvas 钩子只用于静态视觉与布局反馈；交互语义、输入、焦点和无障碍必须由 DOM overlay 提供。
- Quick Latent（[参考项目](https://github.com/Zhen-Bo/comfyui-quick-latent)）仅借鉴紧凑布局：[`quick_latent.js`](https://raw.githubusercontent.com/Zhen-Bo/comfyui-quick-latent/master/js/quick_latent.js)、[`layout.js`](https://raw.githubusercontent.com/Zhen-Bo/comfyui-quick-latent/master/js/layout.js)、[`size_input.js`](https://raw.githubusercontent.com/Zhen-Bo/comfyui-quick-latent/master/js/size_input.js)。其固定紫色、Canvas-only 命中逻辑和品牌资产不得复制；本包继续用 DOM widget 同时覆盖 Classic 与 Nodes 2.0。
- 参考官方 [JS overview](https://docs.comfy.org/custom-nodes/js/javascript_overview) / [objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)。

### 3.2 JS 挂载、状态与序列化

1. `WEB_DIRECTORY = "./js"`；ComfyUI 会加载该目录下全部 `**/*.js`。
2. 扩展使用 `app.registerExtension`。
3. 挂载覆盖完整生命周期：`beforeRegisterNodeDef`（包装 `onNodeCreated`）+ `nodeCreated` + `loadedGraphNode` / `setup` 补挂。
4. 有交互的节点面必须同步调用 `addDOMWidget`，禁止先 `await`；i18n 使用 `.then(redraw)`。
5. DOM widget 必须提供 `getMinHeight` / `getHeight`，并随内容更新节点最小尺寸。
6. FE 1.45 在已有 `node.graph` 时立即注册 DOM widget，否则由 `onAdded` 完成；禁止绕过生命周期。
7. 内部状态不得暴露为 Schema STRING / forceInput；`converted-widget` 也藏不住参数 JSON 或 `[]`。
8. 状态真源使用 `node.properties`；执行时通过 `graphToPrompt` 注入内部 payload。
9. 自绘文案禁止中英硬拼；日志可使用英文。

### 3.3 ParameterPanel 与 Operation Panel（#15–16）

- `ParameterPanel` 是唯一参数节点：管理 0–32 个参数，直接提供固定 `output_1`…`output_32` AnyType 输出；separator 和未使用槽位隐藏。节点包尚未发布，`ParameterBreak`、`AAALICE_PARAM_PACK` 和旧协议不保留兼容层。
- 默认参数依次为 Steps、CFG、Sampler、Scheduler、Denoise、Seed；Seed 固定在最后，Sampler / Scheduler 跟随 ComfyUI 当前选项。
- 节点面只显示参数和值控件；禁止恢复结构工具栏、节点级锁定、加号、铅笔或更多按钮；Seed 行允许保留单独的锁定行为按钮。
- 结构编辑只走节点右键菜单；双栏编辑器使用草稿，保存时统一校验、确认断线并原子应用。
- 参数说明使用本地安全 Markdown tooltip；滑条手柄 hover / active / focus 必须有主题化反馈。
- 参数身份为 `node_id + parameter_id`；参数名和顺序只用于显示，`slotMeta` 按 `parameter_id` 重绑直接输出。编辑器不设置面板标题，节点标题是唯一显示名和 KJ Set 前缀来源；参数名在左侧列表双击修改。
- Operation Panel 是通用操作侧栏：ParameterPanel 自动注册，普通节点通过右键菜单显式注册；标题不参与协议。
- Operation Panel 只负责调值、模型选择、结果查看和工作流级布局；不创建、删除、连线节点，不改参数定义，不提供独立执行按钮。
- 页面使用“页面 → 分区 → 卡片”结构；一个节点只能出现一次，可排序、隐藏、设置侧栏别名和全屏网格位置。
- 页面值预设存入 Comfy `user` 目录，只携带 adapter 暴露的可写值，不携带节点、定义、连线或布局。
- 本包新增的节点右键菜单、子菜单和操作命令必须以 emoji 开头；emoji 必须写入 en/zh 本地化文案，不能只硬编码在单一语言或 fallback 中。
- ParameterPanel 右侧输出列预留约 53px，节点最小宽度约 370 graph units；控件优先使用固定行高、较大命中区和原生 socket hit-test。数字默认显示为 pill，点击后使用临时 inline editor；slider / switch / segmented enum 的布局参考 Quick Latent，但颜色始终来自 ComfyUI token。
- ParameterPanel 使用 `js/lib/parameter_layout.js` 统一生成行、控件矩形、输出位置和节点高度；Canvas/native 层只负责静态视觉与真实槽位，DOM overlay 负责输入、焦点、键盘和 aria，不得用 Canvas 替代可访问输入。
- 隐藏输出必须通过原生 concrete slot/slot DOM 的可见映射参与测量、绘制和命中处理；保留 32 个固定协议槽，禁止只在绘制阶段隐藏造成空白高度。
- 难逆产品与协议决策记录在 `docs/adr/`。

### 3.4 组件库与主题

完整设计语言、token、组件 API 与响应式规则见 [`docs/design/herdi-inspired-ui.md`](docs/design/herdi-inspired-ui.md)。

- 新 DOM 页面优先复用 `js/lib/ui.js` + `js/lib/ui.css`；业务布局留在 `js/lib/theme.css`。
- 禁止重复实现 button、field、card、tabs、empty state 或 dialog。
- DOM 颜色映射 `--fg-color`、`--descrip-text`、`--comfy-menu-secondary-bg`、`--comfy-input-bg`、`--border-color`、`--p-primary-color` 等 ComfyUI token。
- 禁止写死品牌紫色或 Herdi 暖色；明暗主题切换时界面必须同步变化。
- 参数节点控件背景、边框、文字分别使用 `--comfy-input-bg`、`--border-color`、`--fg-color`；选中、滑条和焦点使用主题强调色。

### 3.5 经典模式自定义 socket

- ParameterPanel 输出使用 `AnyType`、原生圆形 `shape`，显式设置 `color_off` / `color_on`；未连接取次级文字色，连接后取主题强调色。
- 禁止用透明色、DOM CSS 或空心圆伪造 socket；隐藏未使用槽时必须保留原生 hit-test 映射与接线热区。
- Operation Panel 注册状态只存在工作流元数据和侧栏，禁止用 `onDrawForeground` 绘制状态点。
- 排查顺序：先确认模式，再检查 `node.outputs` 的 `type / shape / color_off / color_on` 和输出数量。

## 4. 国际化（i18n）

仅支持 en + zh。目录为 `locales/{en,zh}/{main,nodeDefs,settings,commands}.json`，ComfyUI 自动扫描，无需在 `__init__.py` 注册。

| 层 | 内容 |
|---|---|
| 序列化 / schema id | 英文稳定键 |
| `nodeDefs.json` | 显示名、tooltip、COMBO 展示 |
| Schema `display_*` | 英文 fallback |
| 自绘 DOM | `main.json` → `aaalice.*`，通过 `js/i18n.js` 的 `t()` 读取 |

- 禁止中文作为 COMBO 值或路径；禁止只更新一侧 locale。
- 输出 nodeDefs 键使用字符串序号：`"0"`、`"1"`……

```javascript
import { ensureI18nReady, t } from "./i18n.js";
await ensureI18nReady();
t("aaalice.common.confirm", "Confirm");
```

## 5. 运行、调试与验证

### 5.1 日志、进程与刷新

路径均相对仓库根；Desktop 实际布局以日志为准。

| 用途 | 相对路径 |
|---|---|
| 当前主日志 | `../../../logs/comfyui.log` |
| 轮转日志 | `../../../logs/comfyui.log_*.log` |
| user 日志 | `../../user/comfyui.log`、`../../user/comfyui_PORT.log` |
| 前端根 | 日志中 `web root:` 指向的 `comfyui_frontend_package/static` |
| Codex E2E 产物 | `../../../logs/codex-e2e-<timestamp>/` |

- 后端、节点导入、HotReload 问题查看 server 日志；JS 报错查看浏览器 F12 Console。
- GUI 地址以日志 `To see the GUI go to: http://127.0.0.1:PORT` 为准，禁止写死 8188 或 8189。
- LG_HotReload 只重载 Python，不重载 JS；改前端后必须硬刷新或重启 ComfyUI。
- 序列化的 slot / widget 若仍保留旧形态，删除旧节点后重新添加。
- 节点的前端结构、输出槽或 widget 协议发生变化时，热重载/硬刷新有时仍会保留旧节点实例；Codex 或人工回归应删除画布上的旧节点并重新创建，再判断实际效果。

### 5.2 验证节奏

- 验证必须与风险成比例：一轮相关改动收口后运行一次最小必要检查，**禁止每次小修改或每次工具调用后重复跑整套自动化测试**。
- 已通过且后续改动未触及对应逻辑的测试，不重复运行；纯文档或 CSS 调整不默认运行后端测试。
- 优先顺序：静态检查 → 受影响模块测试 → 必要的 GUI 主路径；只有公共模块、协议或核心流程变化才扩大范围。
- 浏览器自动化连接失败一次后立即停止；**禁止反复重置、换入口或连续重试**。记录真实错误，并把未完成的视觉/交互项交给人工验证。
- 不得用跳过、mock、降级或伪造截图制造“通过”；无法运行的检查必须在交付中明确说明。
- Python 测试优先使用当前 ComfyUI 虚拟环境；仓库现有 unittest 可运行：`../../.venv/Scripts/python.exe -m unittest discover -s tests -v`。

### 5.3 Codex Desktop 自动化测试流程（UI）

这是本包针对 **Codex Desktop** 的自动化测试流程，不等同于 CI 或普通 Playwright 测试。Codex 内置 Browser 仅在桌面应用可用，使用前参考 [Codex Browser 文档](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app)。

1. **启动隔离实例**：用 PowerShell（首行 `$ErrorActionPreference = 'Stop'`）启动当前 ComfyUI 的 `main.py`，指定 `--listen 127.0.0.1 --port <dedicated-port>`；若使用 `comfy` CLI，也必须保留可控的 PID、端口和日志。优先直接启动 `main.py`，避免 CLI 后台管理器隐藏进程关系。
2. **等待就绪**：读取本轮 stdout/stderr，等待 `To see the GUI go to:` 或 `/system_stats` 返回 200；端口从本轮日志或动态分配结果取得，不能假定 8188/8189。
3. **安全重启**：只终止本轮启动的 PID 树，禁止 `Stop-Process *python*`、关闭整个 Comfy Desktop 或影响用户已有实例。启动失败要保留原始错误并在有限次数内停止，不得无限重试。
4. **连接 Browser**：先初始化 Codex Browser 运行时，再按日志地址选择本地页面；Browser 传输、发现或选择失败一次后立即停止，记录真实错误，不重置会话、不换入口连续重试。
5. **操作与观察**：优先使用最新 DOM snapshot 中的唯一 role、label、`data-*` 定位 DOM 控件；Canvas 节点只能在确有必要时使用坐标操作。每次点击、输入或选择后读取针对性的 DOM 状态；视觉验收再截屏，不猜选择器、不用整页文本倾倒代替断言。
6. **工作流隔离**：测试节点时新建空白工作流或新标签，不覆盖用户未保存的工作流；搜索并放置节点后，先截取初始节点图，再检查参数控件、输出槽对齐、节点高度和命中区域。
7. **证据与判定**：每轮保存 `server.stdout.log`、`server.stderr.log`、截图和关键 Console 错误到 `../../../logs/codex-e2e-<timestamp>/`。`/object_info/<Node>` 只证明后端注册，不代表 UI 通过；UI 通过必须同时满足节点可创建、控件可见可操作、输出槽无截断、截图符合设计和无阻断性前端错误。
8. **收尾**：测试完成后保留用户要求查看的 deliverable 页面，否则清理临时标签；不要把测试工作流、截图或日志写入仓库发布内容。

本流程已在 2026-07-14 实际验证：启动带独立 PID/日志的专用 ComfyUI 实例，按本轮日志取得端口，使用 Codex Browser 打开本地页面，新建工作流、放置 `ParameterPanel`、截图并读取 DOM/Console；节点显示实际参数控件和可见输出槽，数字 pill 可进入 inline editor，Escape 可取消。前端改动收口后统一运行一次批量 `node --check`；若视觉断言失败，记录为产品失败，不以截图或 mock 伪造通过。

### 5.4 完成检查

- [ ] `node_id` / 输入输出 id 为英文；`category=Aaalice/<domain>`
- [ ] en + zh 的 nodeDefs、settings、commands 和自绘文案保持对齐
- [ ] 经典模式 + Nodes 2.0 主路径可用
- [ ] 有 UI：`nodeCreated` + setup 补挂；两模式均可见可点
- [ ] 交互节点面同步 `addDOMWidget`，并提供 `getMinHeight` / `getHeight`
- [ ] 自定义输出检查 `shape / color_off / color_on`，不只检查 DOM CSS
- [ ] 内部字段无用户引脚、无裸 `[]` 文本框；自绘文案使用单语 i18n
- [ ] 前端改动已硬刷新；无法自动化的 GUI 项已明确列出
- [ ] 进度变化已同步更新双语 README

## 6. 发布与参考

### 6.1 发布

- `PublisherId=aaalice`；包名 `comfyui-aaalice-nodes`。
- 发布流程：提升 `version` → push `main` → GitHub Actions；Secret 为 `REGISTRY_ACCESS_TOKEN`。
- `.comfyignore` 排除协作杂项（含 `AGENTS.md`、`.grok/` 等），不得排除运行时代码。

### 6.2 官方文档

- 后端：[overview](https://docs.comfy.org/custom-nodes/overview) · [V3](https://docs.comfy.org/custom-nodes/v3_migration)
- 前端：[JS](https://docs.comfy.org/custom-nodes/js/javascript_overview) · [hooks](https://docs.comfy.org/custom-nodes/js/javascript_hooks) · [i18n](https://docs.comfy.org/custom-nodes/i18n) · [Nodes 2.0](https://docs.comfy.org/interface/nodes-2)
- 汇总：[llms.txt](https://docs.comfy.org/llms.txt)
