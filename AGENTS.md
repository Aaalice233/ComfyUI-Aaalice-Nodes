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
- Canvas 钩子只用于非交互装饰或明确的经典模式效果。
- `comfyui-quick-latent` 只能作视觉参考，其 Canvas 交互不能直接作为双模式方案。
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

- `ParameterPanel` 是单参数集节点：管理 0–32 个参数，固定输出一个 `Param Pack`；禁止恢复多子面板、动态多输出或 `panel_id`。
- 默认参数依次为 Steps、CFG、Sampler、Scheduler、Denoise、Seed；Seed 固定在最后，Sampler / Scheduler 跟随 ComfyUI 当前选项。
- 节点面只显示参数和值控件；禁止恢复结构工具栏、锁定、加号、铅笔或更多按钮。
- 结构编辑只走节点右键菜单；双栏编辑器使用草稿，保存时统一校验、确认断线并原子应用。
- 参数说明使用本地安全 Markdown tooltip；滑条手柄 hover / active / focus 必须有主题化反馈。
- 参数身份为 `node_id + parameter_id`；参数名和顺序只用于显示，Break 按 `parameter_id` 重绑。
- Operation Panel 是通用操作侧栏：ParameterPanel 自动注册，普通节点通过右键菜单显式注册；标题不参与协议。
- Operation Panel 只负责调值、模型选择、结果查看和工作流级布局；不创建、删除、连线节点，不改参数定义，不提供独立执行按钮。
- 页面使用“页面 → 分区 → 卡片”结构；一个节点只能出现一次，可排序、隐藏、设置侧栏别名和全屏网格位置。
- 页面值预设存入 Comfy `user` 目录，只携带 adapter 暴露的可写值，不携带节点、定义、连线或布局。
- 难逆产品与协议决策记录在 `docs/adr/`。

### 3.4 组件库与主题

完整设计语言、token、组件 API 与响应式规则见 [`docs/design/herdi-inspired-ui.md`](docs/design/herdi-inspired-ui.md)。

- 新 DOM 页面优先复用 `js/lib/ui.js` + `js/lib/ui.css`；业务布局留在 `js/lib/theme.css`。
- 禁止重复实现 button、field、card、tabs、empty state 或 dialog。
- DOM 颜色映射 `--fg-color`、`--descrip-text`、`--comfy-menu-secondary-bg`、`--comfy-input-bg`、`--border-color`、`--p-primary-color` 等 ComfyUI token。
- 禁止写死品牌紫色或 Herdi 暖色；明暗主题切换时界面必须同步变化。
- 参数节点控件背景、边框、文字分别使用 `--comfy-input-bg`、`--border-color`、`--fg-color`；选中、滑条和焦点使用主题强调色。

### 3.5 经典模式自定义 socket

- `AAALICE_PARAM_PACK` 是自定义类型；未显式提供颜色时，经典模式会从连接颜色表取得默认紫色。
- 正确做法：唯一输出使用原生圆形 `shape`，显式设置 `color_off` / `color_on`；未连接取次级文字色，连接后取主题强调色。
- 禁止用透明色、DOM CSS 或空心圆掩盖 socket；必须保留原生 hit-test 与接线热区。
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

### 5.1 日志与刷新

路径均相对仓库根；Desktop 实际布局以日志为准。

| 用途 | 相对路径 |
|---|---|
| 当前主日志 | `../../../logs/comfyui.log` |
| 轮转日志 | `../../../logs/comfyui.log_*.log` |
| user 日志 | `../../user/comfyui.log`、`../../user/comfyui_PORT.log` |
| 前端根 | 日志中 `web root:` 指向的 `comfyui_frontend_package/static` |

- 后端、节点导入、HotReload 问题查看 server 日志；JS 报错查看浏览器 F12 Console。
- GUI 地址以日志 `To see the GUI go to: http://127.0.0.1:PORT` 为准，禁止写死 8188 或 8189。
- LG_HotReload 只重载 Python，不重载 JS；改前端后必须硬刷新或重启 ComfyUI。
- 序列化的 slot / widget 若仍保留旧形态，删除旧节点后重新添加。

### 5.2 验证节奏

- 验证必须与风险成比例：一轮相关改动收口后运行一次最小必要检查，**禁止每次小修改或每次工具调用后重复跑整套自动化测试**。
- 已通过且后续改动未触及对应逻辑的测试，不重复运行；纯文档或 CSS 调整不默认运行后端测试。
- 优先顺序：静态检查 → 受影响模块测试 → 必要的 GUI 主路径；只有公共模块、协议或核心流程变化才扩大范围。
- 浏览器自动化连接失败一次后立即停止；**禁止反复重置、换入口或连续重试**。记录真实错误，并把未完成的视觉/交互项交给人工验证。
- 不得用跳过、mock、降级或伪造截图制造“通过”；无法运行的检查必须在交付中明确说明。
- Python 测试优先使用当前 ComfyUI 虚拟环境；仓库现有 unittest 可运行：`../../.venv/Scripts/python.exe -m unittest discover -s tests -v`。

### 5.3 完成检查

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
