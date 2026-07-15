# AGENTS.md

供协作者与 AI 助手使用；与当次明确指令冲突时，以当次指令为准。**本文件必须保持在 500 行以内。**

## 1. 项目边界

本项目选择性重写 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)，只实现已确认的节点和前端能力。

- 当前已发布到 ComfyUI Registry，但仍处于预览期；已发布行为发生 breaking change 时必须同步版本和双语 README。
- 尚未发布的节点或前端能力可以直接删除、重构或更改协议；不得为开发中间态保留迁移器、兼容壳、废弃别名或历史文档。
- 标识符使用英文；用户可见文案必须提供 en + zh，并跟随 ComfyUI 界面语言。
- 节点必须同时支持经典模式和 Nodes 2.0；暂不支持 App Mode。
- 新增依赖前必须征得同意；禁止静默吞错、伪造成功或用降级掩盖根因。
- 只修改任务直接涉及的内容；工作区已有改动默认属于用户。
- 提交消息使用 `type(scope): 中文描述`，标题不超过 72 个字符。

## 2. 文档职责

| 文件 | 职责 | 禁止内容 |
|---|---|---|
| `README.md` / `README.zh-CN.md` | 面向用户的安装、功能、用法、公开限制 | 内部进度、协作规则、测试记录 |
| `AGENTS.md` | 开发硬规则、架构边界、验收门槛 | 长篇教程、历史流水账 |
| `CONTEXT.md` | 项目领域词汇表 | 字段名、文件路径、实现方案 |
| `docs/adr/` | 难逆且有真实取舍的架构决策 | 日常操作步骤、视觉细节 |
| `docs/design/` | 设计语言、组件和交互规范 | 工作流协议决策 |
| `docs/development/` | 架构说明、测试与发布 runbook | 面向普通用户的安装说明 |

- 文档入口见 [`docs/README.md`](docs/README.md)。
- 两份 README 结构必须对齐，页顶互链；用户行为或公开限制变化时双语同步。
- `README.md` 使用 English 并作为 `pyproject.toml` 的 Registry readme；`README.zh-CN.md` 使用简体中文。
- ADR 必须标明 `Accepted`、`Superseded` 或 `Rejected`；已发布决策被替代时保留历史并链接后继决策，未发布中间态删除后不保留 ADR。
- 不保留与本项目无关的通用工具笔记、一次性调查报告或测试截图。

## 3. 仓库与后端

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py              # WEB_DIRECTORY + comfy_entrypoint
├── nodes/
│   ├── <domain>/            # V3 节点；默认一节点一文件
│   └── _lib/                # 可单测纯逻辑，禁止 ComfyNode
├── js/                      # 前端入口与业务模块
│   └── lib/                 # 共享模型、组件、布局与样式
├── locales/{en,zh}/
├── tests/
└── docs/{adr,design,development}/
```

- 根 `__init__.py` 必须保持极薄，不放业务节点。
- `nodes/<domain>/__init__.py` 导出 `NODE_CLASSES`；只注册已实现的域，不保留未来规划空槽。
- 新增域时同步 `nodes/__init__.py` 与 `pyproject.toml` packages。
- category 使用 `Aaalice/<domain>`；当前域为 `Aaalice/tools` 与 `Aaalice/control`。
- `nodes/_lib/` 不得依赖运行中的 ComfyUI，可直接单测。
- 运行时错误必须保留原始原因与参数上下文；不得把域导入错误误判为“域尚未实现”。
- 当前模块关系和数据流见 [`docs/development/architecture.md`](docs/development/architecture.md)。

## 4. 前端与状态

### 4.1 加载和生命周期

- `WEB_DIRECTORY = "./js"`；扩展使用 `app.registerExtension`。
- 根前端入口导入业务模块；共享模块不得自行注册重复扩展。
- 节点 UI 覆盖 `beforeRegisterNodeDef`、`nodeCreated`、`loadedGraphNode` 和 setup 补挂路径。
- 有交互的节点面同步调用 `addDOMWidget`，不得先 `await`；异步 i18n 就绪后只刷新文案和绘制。
- DOM widget 必须提供 `getMinHeight` / `getHeight`，并随内容更新节点最小尺寸。
- 在已有 `node.graph` 时立即注册，否则由 `onAdded` 完成；不得绕过 ComfyUI 生命周期。
- Dialog 等宿主挂载出错时，必须清理部分挂载、记录原始错误并显示可见错误状态。

### 4.2 渲染边界

- Canvas/native 层只负责静态视觉、布局反馈和真实 slot；交互、焦点、键盘和 aria 由 DOM overlay 负责。
- Classic 输出由 LiteGraph 原生 slot 绘制，Nodes 2.0 输出由 Vue slot DOM 绘制；禁止用 CSS 圆点伪造 socket。
- 自定义输出必须设置真实 `type`、`shape`、`color_off`、`color_on`，并保留原生命中区。
- 隐藏输出必须参与原生测量、绘制和命中映射；不得只在绘制阶段隐藏。
- Nodes 2.0 重挂 slot DOM 时使用幂等 `MutationObserver` 恢复状态；禁止持续轮询。

### 4.3 状态与序列化

- 参数定义与值的状态真源使用 `node.properties`。
- 内部 payload 不得暴露为 Schema STRING / forceInput；执行时由 `graphToPrompt` 注入。
- 任何状态变更都要检查保存、加载、复制节点、撤销/重做和执行路径。

## 5. ParameterPanel

- `ParameterPanel` 是唯一参数节点；管理 0–32 个参数，固定提供 `output_1`…`output_32` 直接输出。
- separator 和未使用输出隐藏但不删除协议槽位。
- 参数身份由面板身份与稳定参数身份共同确定；名称和顺序仅用于显示。
- 参数结构只从右键编辑器修改；保存时统一校验、确认断线并原子应用。
- 节点面只显示值控件；Seed 可保留独立锁定按钮，禁止恢复节点级结构工具栏。
- `js/lib/parameter_layout.js` 是参数行、控件矩形、输出位置和节点高度的唯一布局来源。
- 本包新增的节点菜单以 emoji 开头，emoji 必须进入 en/zh 本地化文案。
- 产品边界以 [`CONTEXT.md`](CONTEXT.md) 和 accepted ADR 为准；视觉规则见 [`docs/design/`](docs/design/)。

## 6. 组件、主题与 i18n

- 新 DOM 界面优先复用 `js/lib/ui.js` + `js/lib/ui.css`；业务布局放在 `js/lib/theme.css`。
- 项目 toast 必须使用 ComfyUI 原生 `app.extensionManager.toast`；允许无状态薄封装统一参数和文案，禁止自建 toast DOM、队列、容器或通知系统。
- 复杂布局存在两个以上合理方案，或仅靠文字难以判断空间关系时，修改正式代码前主动制作同内容、可切换的临时 HTML 演示；确认方案后再实现，原型默认不进入仓库。
- 小范围颜色、间距、字号和单控件调整不制作 HTML 演示；用户已明确实现方向时直接落地。
- 禁止重复实现 button、field、empty state 或 dialog。
- 静态 `iconName` 与 `icon("…")` 必须存在于 `js/lib/ui.js` 的共享图标表；新增或改名后必须通过图标契约测试。
- 颜色来自 ComfyUI token：`--fg-color`、`--descrip-text`、`--comfy-menu-secondary-bg`、`--comfy-input-bg`、`--border-color`、`--p-primary-color` 等。
- 禁止写死品牌色或只适用于暗色主题的正文色；明暗主题切换必须同步。
- 仅支持 en + zh：`locales/{en,zh}/main.json` 与 `nodeDefs.json`；没有内容的 locale 文件不得保留。
- `nodeDefs.json` 管节点定义；自绘 DOM 使用 `main.json` 和 `js/i18n.js`。
- 序列化 id、COMBO 值和路径使用稳定英文；禁止中文作为协议值。
- 修改用户文案时同步两种语言；输出键使用字符串序号 `"0"`、`"1"`……

## 7. 编辑与清理

- 修改前读取目标文件并确认调用关系；小范围修改使用 `apply_patch`。
- 不格式化、重写或清理无关文件；不覆盖用户已有改动。
- 删除代码前必须证明没有静态引用、生命周期反射入口、注册副作用或序列化兼容职责。
- 不保留未使用导出、空壳域、未来规划常量、已被替代的样式或只为中间结构服务的数据转换。
- 注释解释 WHY、约束和平台差异，不复述代码；过期注释与实现一起更新。
- `.comfyignore` 排除协作、测试、缓存和本地产物，但不得排除运行时代码或用户文档。

## 8. 验证

- 验证与风险成比例：静态检查 → 受影响测试 → 必要的 Classic / Nodes 2.0 GUI 主路径。
- Python 测试使用当前 ComfyUI 环境：`../../.venv/Scripts/python.exe -m unittest discover -s tests -v`。
- JS 至少运行 `node --check`；JSON 使用真实解析器校验；提交前运行 `git diff --check`。
- 前端改动后必须硬刷新；涉及节点结构、slot 或 widget 协议时删除旧节点并重新创建。
- UI 通过必须同时满足节点可创建、控件可操作、输出无截断、无阻断性 Console 错误；`/object_info` 只证明后端注册。
- GUI 自动验收只能使用 Codex 内置浏览器；禁止自行启动 Chrome / Edge、连接 CDP、引入 Playwright / Selenium，或搭建隔离浏览器与临时 GUI 测试框架。
- Codex 内置浏览器不可用或无法稳定连接时，立即停止 GUI 自动化，清理本轮临时资源并交由用户手测；静态检查和现有单元测试仍需正常执行。
- 自动化失败必须保留原始错误。环境无法验证时说明已完成检查和剩余风险，不得伪造通过。
- 完整日志路径和 Codex 内置浏览器验收流程见 [`docs/development/testing.md`](docs/development/testing.md)。

## 9. 发布

- `PublisherId=aaalice`，包名 `comfyui-aaalice-nodes`，`pyproject.toml` packages 必须覆盖全部已实现域。
- 发布前同步版本、双语 README、locale、`.comfyignore` 和节点清单。
- 发布通过 GitHub Actions；具体步骤见 [`docs/development/release.md`](docs/development/release.md)。

## 10. 完成检查

- [ ] 只改任务范围；无无关格式化或回滚
- [ ] 无死导出、空壳域、过期注释或重复实现
- [ ] node id、输入输出 id、协议值使用英文
- [ ] en / zh 文案与两份 README 同步
- [ ] Classic 与 Nodes 2.0 受影响主路径已验证或明确说明未验证原因
- [ ] 直接输出使用真实 slot 数据与命中区
- [ ] 内部状态未暴露为用户输入，序列化真源保持唯一
- [ ] 文档进入正确职责目录，ADR 状态链正确
- [ ] `AGENTS.md` 少于 500 行
- [ ] 相关测试、语法检查和 `git diff --check` 已通过
