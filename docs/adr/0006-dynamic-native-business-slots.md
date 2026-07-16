# ADR 0006：业务可变槽使用动态原生槽

Status: Accepted.

## 背景

ParameterPanel、ParameterReceiver 与 EnumSwitch 的业务槽数量都由工作流状态决定。后端为执行和校验保留最多 32 路的有界 Schema，不代表画布必须常驻 32 个槽。固定创建后再隐藏会让 Classic 的数组扫描与 Nodes 2.0 的 DOM 测量仍感知无效槽，干扰拉线命中、缩放角和最小高度。

## 决策

三类节点的前端均只物化当前业务状态需要的连续真实槽：

- ParameterPanel 的输出数量等于产生值的参数数量，Separator 不占输出。
- ParameterReceiver 的输入与输出数量等于 Receiver Binding 的槽数量。
- EnumSwitch 保留固定 selector，并按 routes 数量物化 `branch_1` 到 `branch_N`。

槽使用 LiteGraph 原生 `addInput()`、`removeInput()`、`addOutput()` 与 `removeOutput()` 调整，不保留隐藏画布槽。后端继续声明最多 32 路的连续协议前缀；执行 payload 只引用当前物化范围。

ParameterPanel 与 ParameterReceiver 在结构变化前按稳定 Parameter Id 记录并恢复连线；EnumSwitch 按稳定 Route Id 记录并恢复连线。删除身份仍需要明确确认，结构变化保持单个图变更边界。

## 结果

- 隐藏协议槽不再参与绘制、命中、序列化和节点尺寸计算。
- 节点最小高度由真实槽与可见内容共同决定。
- 参数改名、重排和枚举分支重排仍保留正确连线语义。
- 后端仍是无会话、最多 32 路的有界协议，不需要运行时动态 Schema。
