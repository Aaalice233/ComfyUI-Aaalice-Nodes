# ConditionalSaveImage 设计规范

## 职责

`ConditionalSaveImage` 在 `enabled` 开启时保存输入图像并原样透传，关闭时不写任何文件、仅透传。它是"保存节点 + 开关"的合体，替代"保存节点上游串条件开关"的无效接法。

## 为什么开关必须做进保存节点内部

ComfyUI 执行器把所有 `OUTPUT_NODE = True` 的节点无条件加入执行队列（`execution.py`），保存类节点无一例外（核心 `SaveImage`、`SaveImageLM`、`SaveImageKJ` 均是）。lazy 开关只能决定"是否拉取某条输入的数据"，管不到输出节点的执行，所以开关串在保存节点前后都无法阻止写盘。可行替代只有手动静音节点（`Ctrl+M` / rgthree Fast Muter），本节点提供连线与体验更自然的等价物。

## 保存逻辑归属

节点不实现自己的保存逻辑：

- 安装 ComfyUI-Lora-Manager 时，运行时从 `NODE_CLASS_MAPPINGS["Save Image (LoraManager)"]` 取出 `SaveImageLM`，实例化并调用其 `process_image`，`%seed%` 文件名变量、元数据、配方、jpeg/webp 编码全部由原版代码承担，随其升级自动更新。
- 未安装时回退到核心 `SaveImage.save_images`（PNG + 元数据嵌入）。此模式下 jpeg/webp、`save_as_recipe`、`add_loras_to_prompt` 明确报错，而不是静默降级。

V1/V3 格式差异决定了无法直接类继承（`SaveImageLM` 是 V1 风格，本包节点须为 `io.ComfyNode`），控件声明是唯一需要手动跟随 LoraManager 变更的部分。

## 执行语义

- `is_output_node=False`、`not_idempotent=True`，且 `fingerprint_inputs` 每次返回随机值：保存是副作用，永不走缓存。
- 关闭时返回 `ui={"images": []}` 清空陈旧预览；开启时透传委托方的 ui 结果。
- 输出始终是**原始输入 batch 张量**：`SaveImageLM.process_image` 的 `result` 是它内部归一化后的图像 list，直接透传会让下游收到错误类型，因此只复用其 ui 负载。
- 核心注册表经 `sys.modules["nodes"]` 惰性解析，避免与本包自身的 `nodes` 子包重名冲突（单元测试从包根运行时 `import nodes` 会命中子包）。

## 交互

- `enabled` 关闭时，前端将除图像输入与开关外的全部保存控件置灰（`js/conditional_save_image.js`），状态一目了然；控件值保留，重新开启即恢复。
- 名称与 tooltip 走 `locales/{en,zh,zh-TW}/nodeDefs.json`，随界面语言切换。
