# ConditionalSaveImage 设计规范

## 职责

`ConditionalSaveImage` 在 `enabled` 开启时保存输入图像并原样透传，关闭时不写任何文件、仅透传。它是"保存节点 + 开关"的合体，替代"保存节点上游串条件开关"的无效接法。

## 为什么开关必须做进保存节点内部

ComfyUI 执行器把所有 `OUTPUT_NODE = True` 的节点无条件加入执行队列（`execution.py`），保存类节点无一例外（核心 `SaveImage`、`SaveImageLM`、`SaveImageKJ` 均是）。lazy 开关只能决定"是否拉取某条输入的数据"，管不到输出节点的执行，所以开关串在保存节点前后都无法阻止写盘。可行替代只有手动静音节点（`Ctrl+M` / rgthree Fast Muter），本节点提供连线与体验更自然的等价物。

## 保存逻辑归属

节点不复制保存实现：

- 安装 ComfyUI-Lora-Manager 时，运行时从 `NODE_CLASS_MAPPINGS["Save Image (LoraManager)"]` 取出 `SaveImageLM` 并调用其 `process_image`，`%seed%` 文件名变量、元数据容器、jpeg/webp 编码、质量、计数器与 workflow 均由原版代码承担。
- 未安装时回退到核心 `SaveImage.save_images`（PNG + 元数据嵌入）。此模式下 jpeg/webp、`save_as_recipe`、`add_loras_to_prompt` 明确报错，而不是静默降级。
- V3 `ConditionalSaveImage` 节点类本身不能继承 V1 风格的 `SaveImageLM`。普通保存直接实例化注册类；只有收到版本化完整/空元数据时，才另外为本次保存实例创建一个局部 `SaveImageLM` 子类，并仅覆盖公开 `format_metadata(metadata_dict, add_loras_to_prompt=False)`。局部类不写回注册表、不修改原类或 collector，不在保存后重编码图片，并发执行之间没有共享覆盖状态。

调用前会验证注册类的 `format_metadata()` 能力和签名；不兼容时要求升级 Lora Manager，不把参数悄悄丢失。控件声明仍是唯一需要手动跟随 LoraManager 选项变化的部分。

## metadata 三态与优先级

- 未连接：按当前执行图的 Lora Manager collector 生成参数。
- 连接普通 `Metadata Overwrite (LoraManager)` 字典：输入只建立执行依赖，局部字段继续由 collector 覆盖。
- 连接 `LoadImageWithMetadata` 或 `FetchFromKrita` 的版本 1 载荷：非空 `parameters` 逐字替换当前格式化结果；`parameters=None` 返回空字符串，使目标图片明确不写 `parameters`，不会回退 collector。

`LoadImageWithMetadata` 在加载源文件时独立输出 IMAGE/MASK/METADATA；图像可经过任意切换或处理链，元数据直接连接本节点，不依赖 Tensor 携带文件身份。`FetchFromKrita` 的 METADATA 来自活动文档直接打开的原始 PNG/JPEG/WebP；未保存文档、`.kra` 或无参数原图输出显式空载荷。

完整/空载荷只控制图片内生成参数。`save_with_metadata=False` 始终禁止写入；`add_loras_to_prompt` 不再修改完整源文本；`embed_workflow` 只保存当前工作流；文件名变量仍读取当前 collector。完整/空载荷与 `save_as_recipe=True` 同时出现时明确失败，避免图片与配方使用不同数据源。Lora Manager 不存在时，只有未连接或普通覆盖路径可以走核心 PNG fallback。

## 执行语义

- `is_output_node=False`、`not_idempotent=True`，且 `fingerprint_inputs` 每次返回随机值：保存是副作用，永不走缓存。
- `metadata` 是 optional lazy input；关闭时不求值该上游并返回 `ui={"images": []}` 清空陈旧预览，开启时才请求连接值并透传委托方的 ui 结果。
- 输出始终是**原始输入 batch 张量**：`SaveImageLM.process_image` 的 `result` 是它内部归一化后的图像 list，直接透传会让下游收到错误类型，因此只复用其 ui 负载。
- 核心注册表经 `sys.modules["nodes"]` 惰性解析，避免与本包自身的 `nodes` 子包重名冲突（单元测试从包根运行时 `import nodes` 会命中子包）。

## 交互

- `enabled` 关闭时，前端将除图像输入与开关外的全部保存控件置灰（`js/conditional_save_image.js`），状态一目了然；控件值保留，重新开启即恢复。
- 名称与 tooltip 走 `locales/{en,zh,zh-TW}/nodeDefs.json`，随界面语言切换。
