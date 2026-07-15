# Operation Panel adapter API

第三方前端扩展可以为特定节点类型注册 Operation Panel 卡片适配器。公开入口固定为：

```javascript
globalThis.aaaliceOperationPanel.v1
```

API 版本与包版本相互独立。调用方必须显式使用 `v1`，不能探测内部模块或依赖未公开函数。

## 注册

```javascript
const api = globalThis.aaaliceOperationPanel?.v1;
if (!api) throw new Error("Aaalice Operation Panel v1 is unavailable");

const dispose = api.registerNodeAdapter("ExampleNode", {
  apiVersion: 1,
  title: ({ t }) => t("example.operation.title", "Example"),
  minWidth: 320,
  renderControls(context) {
    const widget = context.node.widgets?.find((item) => item.name === "prompt");
    if (!widget) throw new Error("ExampleNode prompt widget is unavailable");
    const input = document.createElement("input");
    input.value = String(widget.value ?? "");
    const update = () => {
      widget.value = input.value;
      widget.callback?.(widget.value);
      context.markDirty();
    };
    input.addEventListener("change", update);
    context.container.append(context.components.field({
      label: context.t("example.operation.prompt", "Prompt"),
      description: context.t("example.operation.promptHint", "Prompt sent to the node"),
      control: input,
    }));
    return () => input.removeEventListener("change", update);
  },
});
```

- `registerNodeAdapter(nodeType, adapter)` 注册一个节点类型并返回注销函数。
- 同一 `nodeType` 只能注册一次；重复注册直接报错。
- adapter 必须声明 `apiVersion: 1`。
- `unregisterNodeAdapter(nodeType)` 可按类型显式移除注册。
- 注册应发生在 Aaalice Operation Panel API 已安装后；API 不存在时必须显式失败，不能悄悄退回私有实现。

## Adapter 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `apiVersion` | `1` | 必填，接口版本 |
| `title` | `string \| function` | 可选卡片标题；函数接收 `{ node, module, app, t }` |
| `minWidth` | `number` | 可选最小宽度，不能小于 240 |
| `render` | `function` | 完全接管卡片正文；与分区 renderer 二选一 |
| `renderControls` | `function` | 渲染控件区；缺省时使用通用 widget adapter |
| `renderResults` | `function` | 渲染结果区；缺省时使用通用结果渲染 |
| `getPresetControls` | `function` | 返回可写入 Value Preset 的控件描述 |

`render`、`renderControls` 和 `renderResults` 接收同一个 context：

| 字段 | 说明 |
|---|---|
| `container` | 当前 renderer 可写入的 DOM 容器 |
| `node` | 原工作流节点或 Subgraph 节点 |
| `module` | 当前 Node Card 状态，只读使用 |
| `components` | 主题化的 `field`、`text`、`image`、`markdown` 工具 |
| `signal` | 卡片重绘或卸载时触发的 `AbortSignal` |
| `app` | ComfyUI app 引用 |
| `t` | Aaalice 本地化函数 |
| `markDirty()` | 节点公开值变化后请求重绘 |

Renderer 可以返回清理函数。使用事件监听、观察器、计时器或外部资源时，必须返回清理函数或监听 `context.signal`；重绘、页面切换和工作区关闭都会触发清理。

## 公共组件

- `components.field({ label, control, description? })`：生成与 ParameterPanel 节点一致的紧凑字段；说明存在时作为标签 tooltip。
- `components.text(value, className?)`：生成纯文本段落。
- `components.image(source, alt?)`：生成图片并保留 alt。
- `components.markdown(value)`：使用安全 Markdown 渲染；任意 HTML 不会执行。

adapter 应优先使用公共组件和 ComfyUI token，不复制 Operation Panel 私有 class 或固定主题颜色。

## Value Preset

`getPresetControls({ node, module, app, t })` 返回数组，每项包含：

```javascript
{
  key: "strength",
  label: "Strength",
  read: () => node.widgets[0].value,
  write: (value) => { node.widgets[0].value = value; },
  validate: (value) => Number.isFinite(Number(value)) ? null : "Value must be numeric.",
}
```

- `key` 必须稳定，并在单个 adapter 内唯一。
- `read()` 和 `write(value)` 必填。
- `validate(value)` 可选；返回字符串表示拒绝写入并展示原因，返回空值表示通过。
- Preset 只读写节点公开值，不保存布局，不创建节点，不修改连线或参数定义。

## 错误边界

无效版本、空节点类型、重复注册、过小 `minWidth`、错误 renderer 类型和重复 preset key 都会显式报错。Renderer 抛错时，Operation Panel 显示 adapter 错误并执行已登记的清理逻辑；调用方不得依赖静默降级。
