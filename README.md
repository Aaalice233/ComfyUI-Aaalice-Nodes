# ComfyUI-Aaalice-Nodes

[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的重置版：按确认范围重写，对齐 ComfyUI 新前端与扩展 API，并有选择地精简。

| | |
|---|---|
| **状态** | 重置进行中 · 尚无可替代旧包的实现 |
| **旧包** | 仅作行为参考 · 节点名 / API **不默认兼容** |
| **进度** | `1 / 26` 完成（P0 骨架 + 条目 #1–25） |
| **语言** | 简体中文 + English · 跟随 ComfyUI 界面语言自动切换 · `locales/` 骨架已就绪 |

暂时不考虑 App Mode 与 Nodes 2.0。

---

## 目录

- [安装](#安装)
- [仓库结构](#仓库结构)
- [语言（i18n）](#语言i18n)
- [重置顺序](#重置顺序)
- [工作流程](#工作流程)
- [开发](#开发)
- [许可](#许可)

---

## 安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt   # 待就绪
```

重启 ComfyUI。依赖以仓库内配置为准。

> 需要完整旧功能时，请继续使用 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)。

---

## 仓库结构

布局参考 [KJNodes](https://github.com/kijai/ComfyUI-KJNodes)（`nodes/` 按主题分）、[rgthree-comfy](https://github.com/rgthree/rgthree-comfy)（一节点一文件 + 独立前端），按本包条目收成 **域分包**。细则与放置规则见 [AGENTS.md · 仓库与节点文件夹结构](./AGENTS.md#仓库与节点文件夹结构)。

```
ComfyUI-Aaalice-Nodes/
├── __init__.py              # 薄入口：V3 entrypoint + WEB_DIRECTORY
├── locales/{en,zh}/         # i18n（Comfy 自动加载）
├── js/                      # 前端扩展
│   ├── extension.js         # 总入口
│   ├── i18n.js
│   ├── lib/                 # 共享（按需）
│   ├── tools|prompt|media|control|gallery|krita/   # 与后端域对齐
├── nodes/                   # V3 节点
│   ├── __init__.py          # iter_node_classes() 聚合各域
│   ├── _lib/                # 共享纯逻辑（非节点）
│   ├── tools/               # P1 #1–9     → category Aaalice/tools
│   ├── prompt/              # P2 #10–12   → Aaalice/prompt
│   ├── media/               # #13–14,#23  → Aaalice/media
│   ├── control/             # P3 #15–19   → Aaalice/control（#20 纯 JS）
│   ├── gallery/             # P4 #21–22   → Aaalice/gallery
│   └── krita/               # P4 #24–25   → Aaalice/krita
└── server/                  # 可选 HTTP 路由（画廊 / Krita 等，按需）
```

| 约定 | 说明 |
|------|------|
| 默认一节点一文件 | `nodes/<domain>/<snake_case>.py` |
| 域按需创建 | 该域第一个节点落地时再建包，不预建空目录 |
| 菜单前缀 | Schema `category` 使用 `Aaalice/<domain>` |
| 前后端对齐 | 重 UI 节点的脚本放在同名 `js/<domain>/` |

---

## 语言（i18n）

本包节点与扩展 UI 支持 **简体中文（zh）** 与 **English（en）**，**不**维护其它语言包。

- 显示语言与 ComfyUI **设置 → 语言 / Language** 一致，无需在本包内单独切换
- 选中简体中文时显示中文；选中 English 或其它未提供翻译的语言时，回退为英文
- 工作流里保存的是稳定英文标识（节点类型、输入名、选项值等），换语言不会改坏已有工作流

翻译与前端辅助（骨架已落地，节点文案随条目写入）：

```
locales/
├── en/                 # English（基准）
│   ├── main.json       # 通用 / 设置分类 / 自绘 UI（aaalice.*）
│   ├── nodeDefs.json   # 节点定义（有节点后填充）
│   ├── settings.json
│   └── commands.json
└── zh/                 # 简体中文（key 与 en 对齐）
js/
├── extension.js        # 扩展入口，预加载 i18n
└── i18n.js             # 自绘 UI：t / tAsync / getLocale
```

ComfyUI 会自动扫描 `locales/` 并随界面语言切换节点显示名等；自定义 UI 通过 `js/i18n.js` 读同一套目录。

实现约定见 [AGENTS.md · 国际化](./AGENTS.md#国际化i18n)。官方机制说明：[Custom Nodes i18n](https://docs.comfy.org/custom-nodes/i18n)。

---

## 重置顺序

按 **# 从小到大** 实现；无依赖的纯工具节点可有限并行，**不打乱阶段依赖**。

```
P0 脚手架 ──► P1 基础工具 ──► P2 提示词与 I/O ──► P3 控制与组 ──► P4 旗舰与外联
```

| 标记 | 含义 |
|:----:|------|
| ⬜ | 未开始 |
| 🔄 | 进行中 |
| ✅ | 已完成 |
| ⏸ | 阻塞 |

`OpenInKrita` 为 `FetchFromKrita` 的兼容别名，随 #24 一并处理。

### P0 · 脚手架

| # | 项 | 说明 | 状态 |
|--:|----|------|:----:|
| 0 | 包骨架 | 薄 `__init__.py`、域分包、i18n、`WEB_DIRECTORY`、可加载 | ✅ |

### P1 · 基础工具

依赖少，用来跑通「单节点闭环」。

| # | 类名 | 显示名 | 作用 | 状态 |
|--:|------|--------|------|:----:|
| 1 | `SimpleStringSplit` | 简易字符串分隔 | 按分隔符拆分字符串 | ⬜ |
| 2 | `SimpleValueSwitch` | 简易值切换 | 多输入择一输出 | ⬜ |
| 3 | `EnumSwitch` | 枚举切换 | 按枚举选通任意类型 | ⬜ |
| 4 | `SimpleNotify` | 简易通知 | 执行时弹出 / 发送通知 | ⬜ |
| 5 | `WorkflowDescription` | 工作流说明 | 图上备注与说明 UI | ⬜ |
| 6 | `VAEImageBatchFix` | VAE 图像批次修复 | 修复 VAE 场景下的 batch 形态 | ⬜ |
| 7 | `ModelNameExtractor` | 模型名称提取器 | 提取可读模型名字符串 | ⬜ |
| 8 | `ResolutionMasterSimplify` | 分辨率大师简化版 | 计算 / 选择分辨率与尺寸 | ⬜ |
| 9 | `SimpleLoadImage` | 简易加载图像 | 本地图 → `IMAGE` / `MASK` | ⬜ |

### P2 · 提示词与图像 I/O

| # | 类名 | 显示名 | 作用 | 状态 |
|--:|------|--------|------|:----:|
| 10 | `PromptCleaningMaid` | 提示词清洁女仆 | 清洗、去重、规范化标签 | ⬜ |
| 11 | `PromptSelector` | 提示词选择器 | 列表勾选并组合提示词 | ⬜ |
| 12 | `CharacterFeatureSwapNode` | 角色特征交换 | 交换 / 替换角色特征片段 | ⬜ |
| 13 | `SimpleImageCompare` | 简易图像对比 | 节点 UI 对比图像 | ⬜ |
| 14 | `SimpleCheckpointLoaderWithName` | 简易 Checkpoint 加载器 | 加载 checkpoint，附名称 / 预览 | ⬜ |

### P3 · 控制与组

| # | 类名 / 名称 | 显示名 | 作用 | 备注 | 状态 |
|--:|-------------|--------|------|------|:----:|
| 15 | `ParameterControlPanel` | 参数控制面板 | 集中配置并下发参数 | 与 #16 成对 | ⬜ |
| 16 | `ParameterBreak` | 参数展开 | 将打包参数拆成独立输出 | 依赖 #15 | ⬜ |
| 17 | `GroupIsEnabled` | 组是否启用 | 查询 Group 状态 → 布尔 | 组能力基础 | ⬜ |
| 18 | `GroupMuteManager` | 组静音管理器 | 批量管理 Group 静音 | 组套件 | ⬜ |
| 19 | `GroupIgnoreManager` | 组忽略管理器 | 批量管理 Group 忽略 | 组套件 | ⬜ |
| 20 | Quick Group Navigation | 快速组导航 | 悬浮球 / 快捷键跳转 Group | 纯 JS，无节点类 | ⬜ |

### P4 · 旗舰与外联

| # | 类名 | 显示名 | 作用 | 备注 | 状态 |
|--:|------|--------|------|------|:----:|
| 21 | `DanbooruGalleryNode` | D站画廊 | 图站检索与标签辅助 | 旗舰，工作量大 | ⬜ |
| 22 | `MultiCharacterEditorNode` | 多角色编辑器 | 区域 / 注意力提示词编辑 | 前端最复杂之一 | ⬜ |
| 23 | `SaveImagePlus` | 保存图像增强版 | 增强保存（元数据、命名等） | 可能含采集链路 | ⬜ |
| 24 | `FetchFromKrita` | 从 Krita 获取数据 | 从 Krita 拉图层 / 图像 | 依赖 Krita 侧插件 | ⬜ |
| 25 | `OpenInKrita` | （同 #24） | 兼容别名，同一实现 | 随 #24 处理 | ⬜ |

旧仓行为细节以 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 源码为准；本页只跟踪重置范围、顺序与完成标记。

---

## 工作流程

**原则**：单条目闭环后再开下一项。无依赖的纯工具节点允许有限并行。

| 步骤 | 做什么 |
|:----:|--------|
| 1 | **定范围** — 输入输出、与旧包行为差、是否保留类名 / `node_id` |
| 2 | **读旧实现** — 只摘行为与边界，禁止整文件复制 |
| 3 | **重写** — 后端优先 V3 schema；前端走官方 `registerExtension`，少绑 LiteGraph 内部 |
| 4 | **i18n** — 补齐 `locales/en` 与 `locales/zh`（至少 `nodeDefs.json`）；自定义 UI 文案可随语言切换 |
| 5 | **自测** — 包可加载、主路径可跑；有 UI 时在当前节点图画布上测；切换 ComfyUI 语言检查 en / zh |
| 6 | **文档** — 更新本页状态；提交说明用中文 |
| 7 | **提交** — `type(scope): 中文描述` |

---

## 开发

约定与文档索引见 [AGENTS.md](./AGENTS.md)：

- [仓库与节点文件夹结构](./AGENTS.md#仓库与节点文件夹结构)
- [国际化 i18n](./AGENTS.md#国际化i18n)

要点摘要：

- 节点进 `nodes/<domain>/`，默认一节点一文件；根 `__init__.py` 保持薄
- 标识符、序列化键、COMBO **选项值**用英文；用户可见字符串进 `locales/`
- Schema 内 `display_name` / description 用**英文**作 fallback，与 `locales/en` 对齐；`category` 用 `Aaalice/<domain>`
- 仅维护 `en` + `zh`；节点定义 → `nodeDefs.json`；自绘 UI → `aaalice.*` + `js/i18n.js`

---

## 许可

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
