# AGENTS.md

供协作者与 AI 助手使用；与当次明确指令冲突时，以当次指令为准。**本文件只记录长期有效的开发硬规则，不记录具体 Bug、调查过程、操作教程或测试日志，并保持在 500 行以内。**

## 1. 项目边界与依据

本项目选择性重写 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)，只实现已确认的节点和前端能力。

- ComfyUI 官方文档入口为 [https://docs.comfy.org/](https://docs.comfy.org/)；API、生命周期、Schema、list、缓存或前端行为不确定时，先查官方文档和当前安装版本源码，再决定实现。
- 现象与预期冲突时，先用同版本的官方内置节点交叉验证。若官方节点也复现，按上游或环境问题处理，不给本包堆私有兼容补丁。
- 方案开始依赖多层时序补丁、轮询或重复状态时，暂停实现并重新核对职责和根因。
- 当前为已发布预览版。已发布行为发生 breaking change 时必须同步版本、双语 README 和公开限制。
- 尚未发布的中间态可以直接删除或重构，不保留迁移器、兼容壳、废弃别名或历史文档。
- 标识符使用英文；用户可见文案提供 English + 简体中文，并跟随 ComfyUI 界面语言。
- 节点支持 Classic 和 Nodes 2.0；暂不支持 App Mode。
- 新增依赖前必须征得同意；禁止静默吞错、伪造成功或用降级掩盖根因。
- 只修改任务直接涉及的内容；工作区已有改动默认属于用户。
- 提交消息使用 `type(scope): 中文描述`，标题不超过 72 个字符。

## 2. 文档职责

| 位置 | 职责 | 不应包含 |
|---|---|---|
| `README.md` / `README.zh-CN.md` | 用户安装、已发布功能、用法和公开限制 | 开发进度、下一项、完整排期、测试记录、协作规则 |
| `AGENTS.md` | 开发硬规则、架构边界、验收门槛 | 具体 Bug、长命令、教程、调查过程 |
| `CONTEXT.md` | 项目领域词汇和统一称呼 | 文件路径、字段名、实现方案 |
| `docs/adr/` | 难逆且存在真实取舍的架构决策 | 操作步骤、视觉细节 |
| `docs/design/` | 设计语言、组件和交互规范 | 后端协议决策 |
| `docs/development/` | 架构、内部路线图、测试与发布 runbook | 普通用户安装教程 |

- 文档入口见 [`docs/README.md`](docs/README.md)。
- `README.md` 为 English Registry README；`README.zh-CN.md` 为简体中文。两份结构必须对齐、页顶互链。
- 节点重置或增删时：README 只更新已发布节点、用户用法和公开限制；[`roadmap.md`](docs/development/roadmap.md) 独立维护进度、下一项、稳定编号和排期。
- ADR 状态只用 `Accepted`、`Superseded by ADR NNNN` 或 `Rejected`。已发布决策被替代时保留历史并链接后继；未发布中间态删除后不保留 ADR。
- 一次性调查、聊天结论、本机故障笔记和测试截图不进入仓库。

### 2.1 上下文入口

`AGENTS.md` 是开发上下文总入口。需要参与判断的项目文档必须在这里使用 `@相对路径` 引用；普通 Markdown 链接只用于阅读导航，不视为上下文注入。

所有开发任务先加载：

- @CONTEXT.md
- @docs/development/architecture.md

按任务类型继续加载：

| 任务 | 注入文档 |
|---|---|
| 文档整理、职责判断或查找入口 | @docs/README.md |
| 节点重置、增删节点或调整优先级 | @docs/development/roadmap.md |
| 测试、调试、GUI 验收或发布前检查 | @docs/development/testing.md |
| 发布、版本和 Registry | @docs/development/release.md |
| 前端视觉、组件、主题或可访问性 | @docs/design/ui-system.md |
| ParameterPanel / ParameterReceiver 交互与布局 | @docs/design/parameter-system.md |
| QuickGroupManager 交互与布局 | @docs/design/quick-group-manager.md |
| PromptSelector、词库或 DIY 侧边栏 | @docs/design/prompt-selector-workspace.md、@docs/adr/0007-independent-prompt-library-live-references.md、@docs/adr/0008-stable-dashboard-control-bindings.md |
| 参数身份、序列化真源、接收器同步或动态槽协议 | @docs/adr/README.md、@docs/adr/0002-parameter-stable-id-direct-output-rebind.md、@docs/adr/0003-workflow-serialization-source-of-truth.md、@docs/adr/0004-parameter-receiver-explicit-get-sync.md、@docs/adr/0006-dynamic-native-business-slots.md |

新增专题文档时，若其内容会影响实现或验收，必须同时补到本节。README 面向用户，不作为默认开发上下文注入。

## 3. 仓库与后端

```text
ComfyUI-Aaalice-Nodes/
├── __init__.py
├── nodes/{control,prompt,tools,_lib}/
├── js/{lib,assets}/
├── locales/{en,zh}/
├── tests/
└── docs/{adr,design,development}/
```

- 根 `__init__.py` 只公开 `WEB_DIRECTORY` 和 `comfy_entrypoint()`，不放业务节点。
- V3 节点默认一节点一文件；`nodes/<domain>/__init__.py` 导出 `NODE_CLASSES`，只注册已实现的域。
- 新增域时同步 `nodes/__init__.py` 与 `pyproject.toml` packages。
- category 使用 `Aaalice/<domain>`；当前域为 `Aaalice/control`、`Aaalice/prompt` 与 `Aaalice/tools`。
- `nodes/_lib/` 只放不依赖运行中 ComfyUI 的纯逻辑，并可直接单测。
- 运行时错误保留原始原因与参数上下文；不得把导入错误伪装成未实现。
- 模块关系与状态真源见 [`architecture.md`](docs/development/architecture.md)。

## 4. 前端、渲染与状态

### 4.1 生命周期与状态

- `WEB_DIRECTORY = "./js"`；业务扩展使用 `app.registerExtension`，共享模块不得自行重复注册。
- 交互节点覆盖新建、加载、复制和 setup 补挂路径；不得绕过 ComfyUI 生命周期。
- `addDOMWidget` 必须同步挂载；异步 i18n 就绪后只更新文案和绘制。
- 工作流持久状态以 `node.properties` 为真源。内部 payload 不暴露为 Schema widget，执行时由 `graphToPrompt` 注入。
- 状态变化必须覆盖保存、加载、复制、撤销/重做和执行路径。
- 局部重绘不得无条件销毁仍有效的焦点、Popover、Dialog 或操作状态；只有锚点失效、节点移除或对应生命周期结束时才清理。
- Dialog 挂载失败时清理部分状态、记录原始错误并显示可见错误。

### 4.2 DOM widget 与缩放

- DOM widget 通过内容下限声明稳定最小尺寸；`computeSize()` 不得把当前 `node.size` 当作最小值，也不得用延迟或重复 `setSize()` 与原生布局争夺尺寸真源。
- 全尺寸 DOM widget 必须让出 LiteGraph 原生缩放角、拖拽和放置命中；CSS `pointer-events` 不能代替原生命中检测。
- DOM widget 与原生 slot 共用空间时使用 LiteGraph 的叠放语义，不得通过隐藏槽或事后劫持 `arrange()` 修正重复高度。
- 自定义布局在 `onResize` 中从新尺寸重算 DOM 几何、真实 slot 和 Nodes 2.0 标记，并请求画布重绘。
- 连续动画控件必须保留动画元素的 DOM identity，只更新 class、style、data 和 ARIA 状态。

### 4.3 原生槽与双模式

- Canvas/native 层负责静态表面、布局反馈和真实 slot；DOM overlay 负责交互、焦点、键盘和 aria。
- Classic 使用 LiteGraph 原生 slot；Nodes 2.0 使用 Vue slot DOM。禁止用 CSS 圆点伪造 socket。
- 业务数量可变的槽不得用固定数组加隐藏标记模拟。ParameterPanel、ParameterReceiver 与 EnumSwitch 必须按当前状态使用原生 `addInput()` / `removeInput()` 与 `addOutput()` / `removeOutput()` 物化连续真实槽；后端可保留最多 32 路的有界 Schema。
- 动态槽尾部增删不得断开仍处于稳定前缀中的槽；中间插入、删除或重排必须在断开前按稳定 Parameter Id / Route Id 保存源或目标节点及槽位引用，不能只保存会随 `disconnectInput()` / `disconnectOutput()` 一起失效的 link ID。
- Nodes 2.0 确需监听 DOM 重挂时使用幂等 `MutationObserver`；不需要重挂的节点不得常驻观察器，所有路径禁止持续轮询。

## 5. 领域不变量

- `ParameterPanel` 是唯一参数创作节点，管理 0–32 个参数；前端只物化产生值的参数对应的连续输出。
- Separator 不创建画布槽；后端未使用的有界协议位置不进入前端槽数组。参数身份由面板身份与稳定 Parameter Id 共同确定。
- 参数结构只通过右键编辑器原子修改；删除已连接参数前必须确认。
- `ParameterReceiver` 通过可见 KJ Get 和按绑定数量动态物化的真实 slot 工作；缺少 KJNodes 时明确失败，不模拟成功。
- `EnumSwitch` 按当前 route 数量物化连续 lazy MatchType 分支；未知 selector 或未连接目标分支必须显式失败。
- `SimpleNotify` 只表示执行到达，不表示并行分支完成或队列清空；通知副作用只发生在前端。
- 产品术语以 [`CONTEXT.md`](CONTEXT.md) 为准，协议决策以 accepted ADR 为准。

## 6. UI、主题与本地化

- 新 DOM 界面复用 `js/lib/ui.js` + `ui.css`；业务布局放在 `js/lib/theme.css`，不重复实现 button、field、empty state 或 dialog。
- 节点原生层、DOM overlay、Dialog 和 Popover 的职责及主题映射以 [`ui-system.md`](docs/design/ui-system.md) 为准；DOM 根不得重复绘制节点外壳。
- 普通激活态可以跟随节点强调色；警告、危险、筛选颜色和多档业务状态保留自身语义，且颜色不能成为唯一状态信号。
- 两档及以上互斥状态的 Switcher 必须优先复用共享 `segmentedControl`，使用连续滑动指示器呈现切换动画，并通过 ComfyUI 主题 token 区分各状态颜色；同时保留文本、图标或 ARIA 状态信号，并遵循 `prefers-reduced-motion`。
- 单选下拉必须优先复用共享 `selectControl`，箭头与右边缘保留明确安全间距；展开时箭头平滑旋转 180°，选择、失焦、`Escape` 或收起时复位，并同步 `aria-expanded`。业务模块不得重复实现原生 select 包装、箭头或开合状态，动画遵循 `prefers-reduced-motion`。
- 窄侧栏和节点中的次级搜索默认折叠为工具栏右侧的搜索按钮，并优先复用共享搜索组件；激活后必须在原工具栏同一行从入口侧动态展开单行搜索框，不得新增一行或造成内容区跳动，空间不足时临时收起同排次要操作；展开使用短促的尺寸与透明度动画并自动聚焦，输入时只局部更新结果，不得重建整个界面或丢失焦点；`Escape`、关闭按钮或退出搜索必须收起搜索框并清除隐藏筛选，入口同步 `aria-expanded` 与激活状态，动画遵循 `prefers-reduced-motion`。
- 节点颜色同步只走既有生命周期，禁止为颜色或主题同步增加持续轮询。
- Toast 只用 `app.extensionManager.toast.add`；可有无状态参数封装，禁止自建容器、队列或动画系统。
- 静态 `iconName` 与 `icon("…")` 必须存在于共享图标表，并通过图标契约测试。
- 颜色来自 ComfyUI token；禁止写死品牌色或只适用于暗色主题的正文色。
- 仅维护 `locales/{en,zh}/{main,nodeDefs}.json`。`nodeDefs.json` 管节点定义，自绘 DOM 使用 `main.json` 和 `js/i18n.js`。
- 序列化 id、COMBO 值和路径使用稳定英文；修改用户文案时同步两种语言。
- 所有节点的 V3 Schema 与 en/zh `nodeDefs.json` 显示名称必须以同一语义 emoji 开头；新增或重命名节点时同步三处并通过契约测试。
- 本包新增的节点菜单以 emoji 开头，并进入 en/zh 本地化文案。
- 复杂布局存在多个合理方案时，先做同内容可切换的临时演示；小范围视觉调整直接实现。

## 7. 编辑与清理

- 修改前读取目标文件和调用关系；局部修改使用 `apply_patch`。
- 不格式化、回滚或清理无关内容，不覆盖用户已有改动。
- 删除前确认没有静态引用、生命周期入口、注册副作用或序列化职责。
- 不保留死导出、空壳域、未来规划常量、被替代样式或中间态转换。
- 注释解释 WHY、约束和平台差异，不复述代码。
- `.comfyignore` 排除协作、测试和本地产物，但保留运行时代码、locales、assets、双语 README 与 LICENSE。

## 8. 验证

- 验证按风险升级：静态检查 → 受影响单测 → 全量检查 → 必要的 Classic / Nodes 2.0 GUI 主路径；具体命令和回归矩阵只以 [`testing.md`](docs/development/testing.md) 为准。
- 不涉及 slot、widget 尺寸协议、序列化或执行行为，且可在现有实例中硬刷新确认的局部前端视觉、布局和交互修改，完成代码检查后交给用户实际验收；除非用户明确要求，不启动独立实例或浏览器自动化。
- 用户要求用于查看、比较或评审的 HTML / 交互原型属于设计交付物，不属于测试资产；默认只做源码与语法检查，交给用户实际体验，不启动浏览器自动化或代替用户进行视觉和交互验收。仅在用户明确要求自动验收时使用浏览器。
- 必须自动验收 GUI 时只使用 Codex 内置浏览器和隔离实例，禁止操作用户常用实例，也禁止自行启动外部浏览器或引入浏览器测试框架。
- 浏览器权限、系统通知、音频播放等真实用户手势只能标记为人工确认；无法验证时如实列出缺口和风险。

## 9. 发布

- `PublisherId=aaalice`，包名 `comfyui-aaalice-nodes`；`pyproject.toml` packages 覆盖全部已实现域。
- 发布前同步版本、双语 README、locale、`.comfyignore`、节点清单和内部路线图。
- 发布只按 [`release.md`](docs/development/release.md) 执行。
- GitHub Actions 上传成功且 Registry 已生成对应版本记录即可结束；`NodeVersionStatusPending` 属于待审核，不等待变为 `Active`。

## 10. 完成检查

- [ ] 只改任务范围；无无关格式化、回滚或死代码
- [ ] node id、输入输出 id 和协议值使用英文
- [ ] English / 简体中文文案同步
- [ ] README、roadmap、架构和公开限制按职责更新
- [ ] Classic 与 Nodes 2.0 主路径已验证，或已明确交给用户刷新验收
- [ ] 真实 slot、序列化真源和内部 payload 边界未破坏
- [ ] 文档位置正确，链接和 ADR 状态有效，`AGENTS.md` 少于 500 行
- [ ] 已完成风险匹配的代码检查，并明确说明未执行的 GUI 或人工验收
