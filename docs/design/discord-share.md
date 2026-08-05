# Discord 分享设计规范

## 产品边界

Discord 分享属于 Aaalice Nodes 的社区功能，不依赖 Workflow Hub，也不把
Webhook 暴露给浏览器、ComfyUI 后端或工作流。普通安装者只接触公开中继地址；
Discord OAuth Client Secret、Webhook URL 和成员会话只由可信中继持有。

入口默认位于 Aaalice 工作区的紧凑侧栏底栏，与 GitHub 仓库、Discord 社区入口并列；
侧栏固定按钮也归入底栏右侧，不占用工作区顶栏或 ComfyUI 全局侧栏导航。三个社区
操作使用 GitHub、Discord 与纸飞机图标，保持一致的小型命中面和低强度表面，分享
状态只通过右上角小状态点补充表达。

分享按钮右键可固定到画布顶栏或隐藏；隐藏前必须二次确认，并明确可从设置恢复。固定后底栏不再显示纸飞机，GitHub 与 Discord
入口仍保留，顶栏右键可收回侧栏底栏。顶栏入口使用与 Workflow Hub、LoRA Manager
一致的蓝色方形主表面和白色图标；会话状态点、加载反馈及键盘焦点不得破坏按钮尺寸。
设置只保存一个 `sidebar | topbar | hidden` 三态值，隐藏状态始终能从 ComfyUI
设置恢复。底栏是正常布局行，不遮挡参数内容或布局多选操作条；按钮只保留克制的
tonal Hover、纸飞机轻微位移和加载环，`prefers-reduced-motion` 下关闭位移与加载动画。

## 状态边界

| 状态 | 真源 | 生命周期 |
|---|---|---|
| 入口位置 | ComfyUI 应用设置 `Aaalice.DiscordShare.Placement` | 当前 ComfyUI 用户 |
| 提示词来源 | `app.graph.extra.aaaliceDiscordShare.promptSource` | 随工作流保存 |
| 最新运行图像与提示词 | 浏览器内存中的最后一次成功执行快照；分享 Dialog 内的临时编辑草稿 | 页面会话；编辑草稿仅存活于当前 Dialog |
| Discord 会话 | 浏览器当前 Origin 的本地会话 | 可撤销、自动过期 |
| 频道选择 | 浏览器 `localStorage` 中的公开 Target Id 列表 | 当前 Origin |
| 长 Prompt 文件偏好 | 浏览器 `localStorage` 中的布尔值，默认开启 | 当前 Origin |
| Webhook Target、OAuth Secret | Cloudflare Worker Secret | 服务部署 |

提示词来源只保存 Preview Any 的稳定 Graph Id、Node Id 和显示标签，不复制提示词。
每次执行完成后从 `/history/{prompt_id}` 读取完整 outputs；失败时只回退到本次
`executed` 事件已经收到的输出。图像按执行输出顺序去重，提示词按限定执行 Id
反查绑定节点。最新运行数据、选中缩略图、图片尺寸、Dialog 状态和发送前编辑的提示词草稿不得写入工作流；编辑只影响本次分享。

## 分享流程

1. 首次点击且没有有效会话时立即开始 Discord OAuth 与目标服务器成员检测，
   不要求工作流已经运行。OAuth 仅申请 `identify` 与
   `guilds.members.read`。中继完成页优先通过精确 Origin 的 `postMessage` 交还
   随机会话；客户端同时用一次性 PKCE 风格 verifier 轮询短时 handoff，即使
   Discord 切断 `window.opener` 也不需要从公网跨站导航到本地 ComfyUI。
2. 中继在会话检查和每次发送前重新查询目标 Guild 成员身份；可选 Role 白名单在
   同一边界校验。未加入服务器时提供社区邀请和再次验证。
3. 验证成功但没有成功运行图像时只显示原生 Toast，不打开空相册；用户下次点击
   无需再次授权。
4. 已验证且存在结果时打开最新运行相册。左侧媒体区以可缩放、拖动和双击还原的大图为
   主内容，图像计数、文件名与尺寸位于主图之外的紧凑信息栏并保持同一水平轴线，不得覆盖
   图像。底部在同一媒体区悬浮窄竖片水平缩略图队列；每项以上方方形缩略图和下方完整分辨率
   组成，文件名保留在可访问名称和提示中。队列支持滚轮横向滚动及键盘方向键切换；右侧使用
   固定提示词栏，长提示词只在该栏内部滚动。窄窗口改为媒体区在上、提示词栏在下，不压缩
   缩略图到不可读。
5. 提示词缺失时保留相册和右侧提示词栏，但禁用发送，并指导用户右键 Preview Any 后重新运行。存在提示词时，提示词栏提供“编辑提示词”按钮；进入编辑态后保留多行内容、字符计数和焦点，用户可以保存本次分享的修改、用 Escape 或“放弃修改”恢复原文，且不会改写工作流或执行快照。未保存编辑期间发送按钮保持禁用。
6. Footer 在发送按钮旁提供频道多选，至少保留一个频道；客户端只取得稳定 Target Id、
   显示名称、默认状态和“推荐长 Prompt 文件化”能力，不接触 Webhook URL。只有选中声明
   该能力的频道时才自动开启文件选项；仅选 SFW / NSFW 收集频道不得覆盖用户当前偏好。
7. 提示词栏底部提供默认开启且可持久化的“过长提示词作为文件发送”。Hover / Focus
   说明 Discord 单 Embed 描述 4,096 字符、单消息 Embed 文本合计 6,000 字符的限制。
   超过 1,500 字符时改附 UTF-8 TXT，较短内容仍直接显示；推荐频道选中时在选项上方显示
   克制的就近说明，明确文件化只影响长 Prompt。
8. 中继把所选 Id 解析为服务端 Target。内联模式超过单个 Embed 后按顺序拆成多条
   fenced Prompt 消息，并只把图像放在最后一条消息底部；首个 Embed 作者区显示
   当前服务器昵称、Discord 头像和用户资料链接，不覆盖 Webhook 自身身份，也不再重复一行
   Emoji mention；后续 Prompt 分段不重复作者区。文件模式在同一条
   消息附图像与完整 Prompt TXT。关闭文件化后最多允许十条连续消息；超过安全上限时明确
   建议开启文件模式。任一中间发送失败时尽力回收该频道已发出的分段，部分频道失败则保留失败项供重试。

## 中继安全

- 客户端永远不知道 Webhook URL；公开频道列表只含 Target Id、显示名称、默认状态和
  非敏感交互能力。中继日志不得输出 OAuth Token、会话 Token 或 Webhook 响应中的敏感字段。
- OAuth `state` 使用 HMAC、Origin、Nonce、一次性 challenge 和短时过期；回调
  结果只允许签名 Origin 持有对应 verifier 的客户端领取，不进入 URL 或
  ComfyUI 请求日志。
- 会话 Token 使用高熵随机值，KV 仅以 SHA-256 摘要索引并设置 TTL；OAuth
  handoff 与会话之外不得为每次分享写入 KV。
- 每次发送校验成员、可选角色、用户级速率、图片 MIME 与大小、提示词非空；默认
  图片上限为 20 MiB，超限响应必须携带实际字节数与上限字节数。
  用户级速率使用 Cloudflare 原生 Rate Limiting binding，按 Discord User Id
  隔离；达到上限返回 `429`、`Retry-After` 和可机读重试秒数，绑定缺失或暂时
  不可用返回独立 `503`，不得退化为无保护发送或含糊的内部错误。
- 默认允许 loopback ComfyUI Origin；LAN 或 HTTPS 部署必须显式加入
  `ALLOWED_ORIGINS`，不能使用 `*` CORS。
- Worker 部署失败、成员校验失败和 Webhook 失败必须返回明确错误，不得伪造发送
  成功或降级为无鉴权直发。
