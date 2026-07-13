# ComfyUI-Aaalice-Nodes

[ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的**重置版**：翻新实现、对齐 ComfyUI 新 UI，并有选择地精简。

> 重置初期。**节点清单未定**，有可用实现后再写；现阶段勿当旧包替代品。

## 目标

- 适配 ComfyUI 新前端 / 扩展 API
- 重写有价值的能力，避免整包粘贴旧代码
- 比旧包更易维护（具体取舍另议）

## 与旧包

- 旧仓可作行为参考，**不默认兼容**节点名、API、工作流
- 需要完整旧功能请用旧仓

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
