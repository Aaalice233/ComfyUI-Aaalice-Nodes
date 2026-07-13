# AGENTS.md

协作者与 AI 助手用。与当次指令冲突时以当次为准。

## 项目与原则

重置 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)：翻新、对齐新 UI。范围与顺序见 [README.md](./README.md)。

- 参考旧码按 README **# 逐条**重写，禁止整包复制；改顺序或砍范围先问
- 前端优先官方扩展 API，少绑 LiteGraph 内部
- **`__init__.py` 极薄**，节点按域放在 `nodes/<domain>/`；依赖少且先征得同意
- 禁止静默吞错/假成功
- **标识符英文**（类名、`node_id`、输入/输出 id、COMBO 选项值、API 字段、文件名）
- **用户可见文案走 i18n**（`en` + `zh`），随 ComfyUI 界面语言自动切换；禁止只写死中文或只写死英文显示名
- **右键菜单独立分类**：`category` 必须为 `Aaalice/<domain>`，顶级仅 `Aaalice`，子类按域；禁止混入 ComfyUI 原版分类（细则见 [右键菜单分类](#右键菜单分类硬性约定)）
- 暂时不考虑 [App Mode](https://docs.comfy.org/interface/app-mode) 与 [Nodes 2.0](https://docs.comfy.org/interface/nodes-2)
- 提交：`type(scope): 中文描述`
- 验证：能加载则测加载；有节点测主路径；有 UI 时测节点图主路径；切换 `en` / `zh`；不宣称未完成工作

---

## 仓库与节点文件夹结构

布局参考常见包的习惯，再按本包规模收束：

| 参考包 | 可借鉴点 | 本包取舍 |
|--------|----------|----------|
| [KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | 根入口聚合；`nodes/` 按主题分模块；`utility/` 放共享逻辑；`web/js/` 放前端 | 采用 **`nodes/` 按域分包**，不用把几十个类塞进单文件 |
| [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) | `py/` **一节点一文件**；共享 `utils` / `server`；前端与后端按节点对应 | 采用 **默认一节点一模块**；HTTP 路由进 `server/`；复杂 UI 在 `js/<domain>/` 对齐 |
| 官方扩展约定 | 根目录 `WEB_DIRECTORY`、`locales/`、`comfy_entrypoint` | 保持根目录可被 ComfyUI 直接加载 |

### 目标树（规划）

```
ComfyUI-Aaalice-Nodes/
├── __init__.py                 # 仅：WEB_DIRECTORY + comfy_entrypoint（禁止堆节点实现）
├── pyproject.toml
├── requirements.txt
├── AGENTS.md / README.md
├── locales/                    # i18n（Comfy 自动扫描，见下文）
│   ├── en/
│   └── zh/
├── js/                         # WEB_DIRECTORY；全部 .js 会被加载
│   ├── extension.js            # 总入口：registerExtension、预加载 i18n
│   ├── i18n.js                 # 自绘 UI 文案
│   ├── lib/                    # 前端共享（dom、api 封装等）— 有需要再建
│   ├── tools/                  # 与 nodes/tools 对应的节点 UI / hooks
│   ├── prompt/
│   ├── media/
│   ├── control/                # 含纯前端 #20 组导航
│   ├── gallery/
│   └── krita/
├── nodes/                      # 全部 V3 节点实现
│   ├── __init__.py             # iter_node_classes()：聚合各域 NODE 列表
│   ├── _lib/                   # 后端共享纯函数 / 类型 / 常量（禁止放 ComfyNode）
│   │   └── …                   # 例：text.py、images.py、paths.py
│   ├── tools/                  # #1–9（落盘域，非排期分组）
│   │   ├── __init__.py         # 导出本域 node classes 列表
│   │   ├── simple_string_split.py
│   │   ├── simple_value_switch.py
│   │   ├── enum_switch.py
│   │   ├── simple_notify.py
│   │   ├── workflow_description.py
│   │   ├── vae_image_batch_fix.py
│   │   ├── model_name_extractor.py
│   │   ├── resolution_master_simplify.py
│   │   └── simple_load_image.py
│   ├── prompt/                 # #10–12
│   │   ├── prompt_cleaning_maid.py
│   │   ├── prompt_selector.py
│   │   └── character_feature_swap.py
│   ├── media/                  # #13–14、#23
│   │   ├── simple_image_compare.py
│   │   ├── simple_checkpoint_loader.py
│   │   └── save_image_plus.py
│   ├── control/                # #15–19（#20 无 Python 节点）
│   │   ├── parameter_control_panel.py
│   │   ├── parameter_break.py
│   │   ├── group_is_enabled.py
│   │   ├── group_mute_manager.py
│   │   └── group_ignore_manager.py
│   ├── gallery/                # #21–22
│   │   ├── danbooru_gallery.py
│   │   └── multi_character_editor.py
│   └── krita/                  # #24–25
│       └── fetch_from_krita.py # OpenInKrita 作兼容别名，同模块注册
└── server/                     # 可选：aiohttp 路由（画廊检索、Krita 桥等）
    ├── __init__.py             # 注册路由入口（被包加载时调用）
    ├── gallery_routes.py       # 需要时再加
    └── krita_routes.py
```

当前仓库只需存在**已用到的**路径；**禁止**为占位一次性创建全部空包。某域第一个节点落地时再建该域目录与 `__init__.py`。

### 域 ↔ 条目 ↔ 菜单 category

> 排期以 README 的 **# 逐条**为准；下表只说明代码落盘域与菜单 `category`，不是实现批次。

#### 右键菜单分类（硬性约定）

本包节点在 ComfyUI **右键 → 添加节点** 菜单中必须挂在**独立顶级分类 `Aaalice` 下**，再按域分子类。  
**禁止**混入 ComfyUI 原版分类（如 `image`、`sampling`、`conditioning`、`latent`、`utils`、`advanced` 等），也禁止把本包节点直接挂在这些根类或其子路径下。

ComfyUI 用 `/` 分层。Schema 的 `category` 格式固定为：

```text
Aaalice/<domain>
```

右键菜单呈现为：

```text
Aaalice                 ← 唯一顶级分类（本包专用）
 ├── tools
 ├── prompt
 ├── media
 ├── control
 ├── gallery
 └── krita
      └── <节点显示名>
```

| 规则 | 说明 |
|------|------|
| 顶级 | 必须是 **`Aaalice`**（拼写固定，勿改成 `Alice` / `aaalice` / `Aaalice Nodes` 等） |
| 子类 | 第二段为域名，与 `nodes/<domain>/` 一致：`tools` / `prompt` / `media` / `control` / `gallery` / `krita` |
| 深度 | 默认两级：`Aaalice/<domain>`；一般不需要三级，确有需要先问 |
| 写法 | `io.Schema(category="Aaalice/tools")`（V3）；禁止只写 `tools`、`utils` 等无前缀路径 |
| 标识 | `category` 路径用英文稳定键；用户可见节点名走 i18n，不靠把 `category` 写成中文 |

**禁止示例**（会混进原版或污染根菜单）：

- `utils`、`image`、`sampling`、`conditioning`
- `tools`（缺少 `Aaalice/` 前缀）
- `danbooru`、`custom` 等非本包约定前缀
- `Aaalice` 单段无子类（应用 `Aaalice/<domain>`，勿把所有节点堆在顶级）

**正确示例**：`Aaalice/tools`、`Aaalice/prompt`、`Aaalice/gallery`

#### 域与 category 对照

| 域包 `nodes/` | 条目 | 默认 `category`（Schema） | 前端 `js/` |
|---------------|------|---------------------------|------------|
| `tools` | #1–9 | `Aaalice/tools` | `js/tools/`（有 UI 时） |
| `prompt` | #10–12 | `Aaalice/prompt` | `js/prompt/` |
| `media` | #13–14、#23 | `Aaalice/media` | `js/media/` |
| `control` | #15–19 | `Aaalice/control` | `js/control/`（#20 仅此） |
| `gallery` | #21–22 | `Aaalice/gallery` | `js/gallery/` |
| `krita` | #24–25 | `Aaalice/krita` | `js/krita/` |

- 纯前端功能（#20 快速组导航）**不建** Python 节点类，只放 `js/control/`（或 `js/control/group_nav.js`），在 `extension.js` 或域入口中注册；若将来出现「纯前端也能进添加节点菜单」的入口，仍须落在 `Aaalice/...` 命名空间下，不得挂到原版分类。

### 放置规则

1. **根 `__init__.py`**：只做 `WEB_DIRECTORY`、`comfy_entrypoint`、必要时触发 `server` 路由注册；禁止在此实现节点逻辑。
2. **一节点一文件（默认）**：文件名 = `snake_case(node_id)`，与类名/模块一一对应，便于 diff 与按条目标注进度。
3. **允许同文件的例外**：强耦合对——`ParameterControlPanel` + `ParameterBreak`；`FetchFromKrita` + `OpenInKrita` 别名。除此以外勿合并无关节点。
4. **`nodes/_lib/`**：可单测的纯逻辑、路径工具、API client；**不得**定义 `ComfyNode`，也不得在 import 时连 Comfy 图。
5. **`nodes/<domain>/__init__.py`**：导出本域 `NODE_CLASSES: list[type]`（或等价），由 `nodes/__init__.py` 的 `iter_node_classes()` 按固定顺序拼接。
6. **前端镜像**：有自定义 widget / 侧栏 / 菜单的节点，在 `js/<domain>/` 下建同主题文件；共享代码进 `js/lib/`，不要在多个节点文件复制。
7. **`server/`**：仅当需要 `/api/...` 扩展时再引入；路由模块按域命名，在包加载时显式注册一次。
8. **注册顺序**：与 README 条目顺序一致无硬性要求，但域聚合顺序建议 `tools → prompt → media → control → gallery → krita`，便于日志与排查。
9. **`pyproject.toml`**：新域包落地时把包名加入 `[tool.setuptools] packages`（或改用 `find`）；`package-data` 已含 `js/**/*`、`locales/**/*`。
10. **禁止**：在 `js/` 外再发明第二套自动加载前端目录；禁止把业务节点写进 `_lib` 或 `server`。

### 模块模板（落地新节点时）

```text
# 后端
nodes/<domain>/<snake_name>.py   → class Xxx(io.ComfyNode)
nodes/<domain>/__init__.py       → 追加到本域列表
nodes/__init__.py                → 已聚合域则无需改（域 __init__ 导出即可）

# 文案
locales/en/nodeDefs.json + locales/zh/nodeDefs.json

# 前端（仅当需要）
js/<domain>/<snake_name>.js      → 由 extension 或侧车 registerExtension hooks
```

### 与进度清单的对应（速查）

| # | 类 / 功能 | 后端路径 | 前端（若有） |
|--:|-----------|----------|--------------|
| 1 | `SimpleStringSplit` | `nodes/tools/simple_string_split.py` | — |
| 2 | `SimpleValueSwitch` | `nodes/tools/simple_value_switch.py` | — |
| 3 | `EnumSwitch` | `nodes/tools/enum_switch.py` | 可能 `js/tools/` |
| 4 | `SimpleNotify` | `nodes/tools/simple_notify.py` | `js/tools/` |
| 5 | `WorkflowDescription` | `nodes/tools/workflow_description.py` | `js/tools/` |
| 6 | `VAEImageBatchFix` | `nodes/tools/vae_image_batch_fix.py` | — |
| 7 | `ModelNameExtractor` | `nodes/tools/model_name_extractor.py` | — |
| 8 | `ResolutionMasterSimplify` | `nodes/tools/resolution_master_simplify.py` | 可能 `js/tools/` |
| 9 | `SimpleLoadImage` | `nodes/tools/simple_load_image.py` | 可能 `js/tools/` |
| 10 | `PromptCleaningMaid` | `nodes/prompt/prompt_cleaning_maid.py` | — |
| 11 | `PromptSelector` | `nodes/prompt/prompt_selector.py` | `js/prompt/` |
| 12 | `CharacterFeatureSwapNode` | `nodes/prompt/character_feature_swap.py` | 可能 `js/prompt/` |
| 13 | `SimpleImageCompare` | `nodes/media/simple_image_compare.py` | `js/media/` |
| 14 | `SimpleCheckpointLoaderWithName` | `nodes/media/simple_checkpoint_loader.py` | 可能 `js/media/` |
| 15–16 | Parameter 面板 / 展开 | `nodes/control/parameter_*.py` | `js/control/` |
| 17–19 | Group 管理 | `nodes/control/group_*.py` | `js/control/` |
| 20 | Quick Group Navigation | （无） | `js/control/` 纯前端 |
| 21 | `DanbooruGalleryNode` | `nodes/gallery/danbooru_gallery.py` | `js/gallery/` + 可能 `server/` |
| 22 | `MultiCharacterEditorNode` | `nodes/gallery/multi_character_editor.py` | `js/gallery/` |
| 23 | `SaveImagePlus` | `nodes/media/save_image_plus.py` | 可能 `js/media/` |
| 24–25 | Krita 获取 / 别名 | `nodes/krita/fetch_from_krita.py` | 可能 `js/krita/` + `server/` |

改域划分或合并目录前须先问；实现条目时路径与上表不一致须在 PR/说明里写原因。

## 文档

以 [docs.comfy.org](https://docs.comfy.org/) / [llms.txt](https://docs.comfy.org/llms.txt) 与源码为准。

**后端** · [overview](https://docs.comfy.org/custom-nodes/overview) · [walkthrough](https://docs.comfy.org/custom-nodes/walkthrough) · [V3 migration](https://docs.comfy.org/custom-nodes/v3_migration) · [install](https://docs.comfy.org/installation/install_custom_node) · [troubleshoot](https://docs.comfy.org/troubleshooting/custom-node-issues) · scaffold：`comfy node scaffold` / [cookiecutter](https://github.com/Comfy-Org/cookiecutter-comfy-extension)

**前端扩展** · [JS overview](https://docs.comfy.org/custom-nodes/js/javascript_overview) · [hooks](https://docs.comfy.org/custom-nodes/js/javascript_hooks) · [objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking) · [examples](https://docs.comfy.org/custom-nodes/js/javascript_examples) · [context menu](https://docs.comfy.org/custom-nodes/js/context-menu-migration) · [settings](https://docs.comfy.org/custom-nodes/js/javascript_settings) · [i18n](https://docs.comfy.org/custom-nodes/i18n)

**示例** · [Vue basic](https://github.com/jtydhr88/ComfyUI_frontend_vue_basic) · [React template](https://github.com/Comfy-Org/ComfyUI-React-Extension-Template) · [i18n demo](https://github.com/comfyui-wiki/ComfyUI-i18n-demo)

**其它** · [ComfyUI](https://github.com/Comfy-Org/ComfyUI) · [Registry](https://registry.comfy.org/) · 旧仓仅参考行为

---

## 国际化（i18n）

本包**仅支持两种语言**：

| 语言 | 目录 | 说明 |
|------|------|------|
| English | `locales/en/` | 基准语言；Python / JS 中的 fallback 文案用英文 |
| 简体中文 | `locales/zh/` | 完整中文覆盖 |

不维护 `zh-TW`、`ja`、`ko` 等其它 locale。ComfyUI 选其它语言时，由前端回退到英文（`en`）。

语言切换**完全跟随 ComfyUI 设置**（界面语言），本包不单独做语言开关、不缓存独立 locale。

官方说明：[Custom Nodes i18n](https://docs.comfy.org/custom-nodes/i18n)。

### 目录约定（已搭骨架）

```
locales/{en,zh}/
  main.json / nodeDefs.json / settings.json / commands.json
js/
  extension.js · i18n.js · lib/ · <domain>/…
```

完整树见上文 [仓库与节点文件夹结构](#仓库与节点文件夹结构)。

ComfyUI 启动时扫描 `locales/` 并经 `/api/i18n` 合并进前端；**无需**在 `__init__.py` 里注册。

- 新节点落地时：**同步**更新 `en` 与 `zh` 的 `nodeDefs.json`，缺一侧视为未完成。
- 注册 settings / commands 时同步写双份 `settings.json` / `commands.json`（id 中 `.` → `_`）。
- `en` 为源语言：新增 key 先写 `en`，再补 `zh`。key 集合在 `en` / `zh` 间应对齐。
- 自绘 UI 文案放 `main.json` 的 `aaalice.*` 命名空间，用 `js/i18n.js` 读取（见下）。

### 稳定 ID vs 显示文案

| 层 | 放什么 | 例 |
|----|--------|----|
| 代码 / 工作流序列化 | 稳定英文 ID，永不随语言变 | `node_id="SimpleStringSplit"`、输入 id `delimiter`、COMBO 值 `"uppercase"` |
| `locales/*/nodeDefs.json` | 用户看到的显示名、tooltip、选项标签 | `"display_name": "简易字符串分隔"` |
| Schema 里的 `display_name` / `description` / tooltip | **英文**，与 `locales/en` 一致，作无翻译时的 fallback | `display_name="Simple String Split"` |

**禁止**：

- 把中文写进 `node_id`、输入输出 id、COMBO **选项值**、API 路径/字段
- 在 Python / JS 里用 `if locale == "zh"` 硬编码整套 UI 文案（应走 locales 或统一 i18n 辅助）
- 只更新中文或只更新英文翻译文件
- 为图省事在 schema 里只写中文显示名

COMBO 等选项：**值用英文稳定键**，展示文案放在 `nodeDefs.json` 的 `inputs.<id>.options` 下。

### nodeDefs.json 结构（摘要）

键为节点的 **`node_id`**（与 `io.Schema(node_id=...)` / 类注册名一致）：

```json
{
  "SimpleStringSplit": {
    "display_name": "Simple String Split",
    "description": "Split a string by delimiter.",
    "inputs": {
      "text": {
        "name": "Text",
        "tooltip": "Source string"
      },
      "delimiter": {
        "name": "Delimiter",
        "tooltip": "Separator string"
      }
    },
    "outputs": {
      "0": {
        "name": "Parts",
        "tooltip": "Split segments"
      }
    }
  }
}
```

注意：

- **输出**用序号键 `"0"`、`"1"`…，不是输出 id 字符串
- COMBO 选项展示：`inputs.<input_id>.options.<option_value>`
- 每个已注册节点都应有对应条目；无用户文案的隐藏/内部节点可省略，但需在 PR/条目说明里写清

### 设置与命令

扩展 `settings` / `commands` 的文案：

- 分类名 → `main.json` 的 `settingsCategories`
- 设置项 → `settings.json`；key 为设置 `id` 中 `.` 换成 `_`  
  例：`Aaalice.EnableFoo` → `Aaalice_EnableFoo`
- 命令 → `commands.json`

中英都要有；`name` / `tooltip` / `options` 与官方 i18n 文档一致。

### 前端自定义 UI

节点画布上由 **Comfy 渲染的** 标题、输入输出名、widget 标签：走 `locales/*/nodeDefs.json` 即可，随界面语言切换。

**自绘 DOM / 侧栏 / 对话框 / toast** 等不走 nodeDefs 的文案：

1. 字符串写入 `locales/en|zh/main.json` 的 `aaalice.*`（或子命名空间），**不要**在组件里写死单一语言长句
2. 使用本包辅助模块（**仅 en/zh**，其它回退 en）：

```javascript
import { ensureI18nReady, t, tAsync, getLocale } from "./i18n.js";

await ensureI18nReady();
const label = t("aaalice.common.confirm", "Confirm");
// 或：const label = await tAsync("aaalice.common.confirm", "Confirm");
```

3. 日志、异常类型名、开发者控制台信息可用英文；**用户可见**的 toast / dialog / 侧栏标题必须可切换
4. 扩展入口已在 `setup` 中预加载目录；其它模块仍建议在首用前 `await ensureI18nReady()`

### 后端运行时消息

- 抛给用户的失败信息：优先英文稳定信息，或中英均可理解的短句；若需完整本地化，经前端展示时再翻译，避免在 `execute` 里拼仅中文长文案却无法切换
- 技术性 `raise` / 堆栈：英文即可
- 禁止静默吞错；错误要可定位

### 实现检查清单（每个节点 / 有 UI 的条目）

- [ ] Schema：`node_id` 与输入输出 id 为英文稳定键；`display_name` / description / tooltip 为英文 fallback
- [ ] Schema：`category` 为 `Aaalice/<domain>`（独立顶级 `Aaalice` + 域子类）；未混入原版分类、无前缀路径
- [ ] `locales/en/nodeDefs.json` 与 `locales/zh/nodeDefs.json` 已补全且 key 对齐
- [ ] COMBO 选项值英文，展示名在 locales 的 `options` 中
- [ ] 有 settings/commands 则双语文案齐全
- [ ] 自定义前端文案可随 ComfyUI 语言在 en/zh 间切换
- [ ] 语言 = English / 简体中文 下各看一眼主路径 UI
- [ ] 右键菜单可在 **Aaalice → 对应域子类** 下找到该节点

### 工作流中的文档步骤

实现条目时，同步维护 **locales** 与 README 状态。
