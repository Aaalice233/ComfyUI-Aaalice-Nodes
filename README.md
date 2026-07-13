# ComfyUI-Aaalice-Nodes

[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的重置版：按确认范围重写，对齐 ComfyUI 新前端与扩展 API，并有选择地精简。

| | |
|---|---|
| **状态** | 重置进行中 · 尚无可替代旧包的实现 |
| **旧包** | 仅作行为参考 · 节点名 / API **不默认兼容** |
| **进度** | `1 / 26` 完成（P0 骨架 + 条目 #1–25） |

---

## 目录

- [安装](#安装)
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
| 0 | 包骨架 | 薄 `__init__.py`、分包、`pyproject` / `requirements`、`WEB_DIRECTORY`、可被 ComfyUI 加载 | ✅ |

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
| 1 | **定范围** — 输入输出、与旧包行为差、是否保留类名 |
| 2 | **读旧实现** — 只摘行为与边界，禁止整文件复制 |
| 3 | **重写** — 后端优先 V3 schema；前端走官方 `registerExtension`，少绑 LiteGraph 内部 |
| 4 | **自测** — 包可加载、主路径可跑；有 UI 时看 **Legacy + Nodes 2.0** |
| 5 | **文档** — 更新本页状态；用户可见文案用中文 |
| 6 | **提交** — `type(scope): 中文描述` |

---

## 开发

约定与文档索引见 [AGENTS.md](./AGENTS.md)。

---

## 许可

[MIT](./LICENSE) · Copyright (c) 2026 Aaalice233
