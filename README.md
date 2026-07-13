# ComfyUI-Aaalice-Nodes

[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的**重置版**：翻新实现、对齐 ComfyUI 新 UI，并有选择地精简。

> 重置初期。旧包清单取舍见下表（当前均为「重置」）；**尚无实现，勿当旧包替代品**。

## 目标

- 适配 ComfyUI 新前端 / 扩展 API
- 重写有价值的能力，避免整包粘贴旧代码
- 比旧包更易维护（具体取舍另议）

## 与旧包

- 旧仓可作行为参考，**不默认兼容**节点名、API、工作流
- 需要完整旧功能请用旧仓

## 旧包节点清单（ComfyUI-Danbooru-Gallery）

来源旧仓当前注册映射；显示名以旧仓 `NODE_DISPLAY_NAME_MAPPINGS` 为准。  
**重置状态**：`待定` / `重置` / `不纳入`。

### 图像与提示词

| 类名 | 显示名 | 一句话作用 | 重置 |
|------|--------|------------|------|
| `DanbooruGalleryNode` | D站画廊 | 检索/浏览 Danbooru 等图站，选用图片与标签辅助提示词 | 重置 |
| `PromptSelector` | 提示词选择器 | 从前端列表勾选/组合提示词并输出字符串 | 重置 |
| `PromptCleaningMaid` | 提示词清洁女仆 | 清洗、去重、规范化提示词标签文本 | 重置 |
| `CharacterFeatureSwapNode` | 角色特征交换 | 在提示词中交换/替换角色相关特征片段 | 重置 |
| `MultiCharacterEditorNode` | 多角色编辑器 | 多角色区域/注意力提示词编辑与生成 | 重置 |

### 图像 I/O 与模型

| 类名 | 显示名 | 一句话作用 | 重置 |
|------|--------|------------|------|
| `SimpleLoadImage` | 简易加载图像 | 简化版加载本地图像并输出 IMAGE/MASK | 重置 |
| `SaveImagePlus` | 保存图像增强版 | 增强保存（元数据/命名等，依赖采集链路） | 重置 |
| `SimpleImageCompare` | 简易图像对比 | 在节点 UI 中对比两张（组）图像 | 重置 |
| `SimpleCheckpointLoaderWithName` | 简易 Checkpoint 加载器 | 加载 checkpoint，并暴露模型名/预览相关能力 | 重置 |
| `ModelNameExtractor` | 模型名称提取器 | 从模型相关输入中提取可读模型名称字符串 | 重置 |
| `VAEImageBatchFix` | VAE 图像批次修复 | 修复 VAE 编解码场景下的图像 batch 形态问题 | 重置 |

### 工作流控制与字符串

| 类名 | 显示名 | 一句话作用 | 重置 |
|------|--------|------------|------|
| `ParameterControlPanel` | 参数控制面板 | 集中配置并下发一组可调参数给工作流 | 重置 |
| `ParameterBreak` | 参数展开 | 把控制面板打包的参数拆成独立输出 | 重置 |
| `SimpleStringSplit` | 简易字符串分隔 | 按分隔符拆分字符串为多段输出 | 重置 |
| `SimpleValueSwitch` | 简易值切换 | 按条件在多个输入值之间切换输出 | 重置 |
| `EnumSwitch` | 枚举切换 | 按枚举选项在多路任意类型输入中选通 | 重置 |
| `WorkflowDescription` | 工作流说明 | 在图上挂工作流说明/备注（偏文档 UI） | 重置 |
| `SimpleNotify` | 简易通知 | 执行时弹出/发送简易通知提示 | 重置 |
| `ResolutionMasterSimplify` | 分辨率大师简化版 | 简化计算/选择生成分辨率与相关尺寸 | 重置 |

### 组管理

| 类名 | 显示名 | 一句话作用 | 重置 |
|------|--------|------------|------|
| `GroupMuteManager` | 组静音管理器 | 批量管理画布上 Group 的静音/启用 | 重置 |
| `GroupIgnoreManager` | 组忽略管理器 | 批量管理 Group 是否参与执行（忽略） | 重置 |
| `GroupIsEnabled` | 组是否启用 | 查询指定 Group 是否启用，输出布尔值 | 重置 |

### Krita 联动

| 类名 | 显示名 | 一句话作用 | 重置 |
|------|--------|------------|------|
| `FetchFromKrita` | 从 Krita 获取数据 | 从 Krita 拉图层/图像等到 ComfyUI | 重置 |
| `OpenInKrita` | 从 Krita 获取数据 | **`FetchFromKrita` 的兼容别名**，同一实现 | 重置 |

### 非节点型前端扩展

| 名称 | 一句话作用 | 重置 |
|------|------------|------|
| Quick Group Navigation | 悬浮球/快捷键快速跳转到工作流 Group（纯 JS，无节点类） | 重置 |

> 旧 README 写「23 节点」；代码另注册 `VAEImageBatchFix`，且 `OpenInKrita` 为别名。上表按代码注册为准。

## 安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes.git
cd ComfyUI-Aaalice-Nodes
pip install -r requirements.txt   # 待就绪
```

重启 ComfyUI。依赖与环境以仓库内配置文件为准。

## 开发

见 [AGENTS.md](./AGENTS.md)。

## 许可

计划 MIT，以 `LICENSE` 为准。
