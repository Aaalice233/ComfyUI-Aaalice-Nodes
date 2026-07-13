# AGENTS.md

协作者与 AI 助手用。与当次指令冲突时以当次为准。

## 项目与原则

重置 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)：翻新、对齐新 UI、有选择精简。**节点取舍未定**，有实现后再更新 README。

- 参考旧码按确认范围**重写**，禁止整包复制；范围未定先问
- 前端优先官方扩展 API，少绑 LiteGraph 内部
- `__init__.py` 薄、按域分包；依赖少且先征得同意
- 禁止静默吞错/假成功；文案中文、标识符英文
- 提交：`type(scope): 中文描述`
- 验证：能加载则测加载；有节点测主路径；不宣称未完成工作

## 文档

以 [docs.comfy.org](https://docs.comfy.org/) / [llms.txt](https://docs.comfy.org/llms.txt) 与源码为准。

**后端** · [overview](https://docs.comfy.org/custom-nodes/overview) · [walkthrough](https://docs.comfy.org/custom-nodes/walkthrough) · [V3 migration](https://docs.comfy.org/custom-nodes/v3_migration)（≠ Nodes 2.0）· [install](https://docs.comfy.org/installation/install_custom_node) · [troubleshoot](https://docs.comfy.org/troubleshooting/custom-node-issues) · scaffold：`comfy node scaffold` / [cookiecutter](https://github.com/Comfy-Org/cookiecutter-comfy-extension)

**前端扩展** · [JS overview](https://docs.comfy.org/custom-nodes/js/javascript_overview) · [hooks](https://docs.comfy.org/custom-nodes/js/javascript_hooks) · [objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking) · [examples](https://docs.comfy.org/custom-nodes/js/javascript_examples) · [context menu](https://docs.comfy.org/custom-nodes/js/context-menu-migration) · [settings](https://docs.comfy.org/custom-nodes/js/javascript_settings) · [i18n](https://docs.comfy.org/custom-nodes/i18n)

**Nodes 2.0**（Vue 节点渲染，非后端 V3）· [用户说明](https://docs.comfy.org/interface/nodes-2) · [博客](https://blog.comfy.org/p/comfyui-node-2-0) · 源码 [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend)。尚无完整开发/迁移手册；自定义 canvas widget 可能不兼容——有 UI 时 **Legacy + 2.0** 双测。

**示例** · [Vue basic](https://github.com/jtydhr88/ComfyUI_frontend_vue_basic) · [React template](https://github.com/Comfy-Org/ComfyUI-React-Extension-Template)

**其它** · [ComfyUI](https://github.com/Comfy-Org/ComfyUI) · [Registry](https://registry.comfy.org/) · 旧仓仅参考行为
