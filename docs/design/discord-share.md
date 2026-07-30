# Discord 分享设计规范

## 产品边界

Discord 分享属于 Aaalice Nodes 的社区功能，不依赖 Workflow Hub，也不把
Webhook 暴露给浏览器、ComfyUI 后端或工作流。普通安装者只接触公开中继地址；
Discord OAuth Client Secret、Webhook URL 和成员会话只由可信中继持有。

入口默认位于 ComfyUI 侧栏底部。右键可固定到画布顶栏或隐藏；固定后侧栏不再
显示，顶栏右键可收回侧栏。设置只保存一个 `sidebar | topbar | hidden` 三态值，
隐藏状态始终能从 ComfyUI 设置恢复。侧栏入口只播放一次短促进入动效，悬停使用
轻微右上位移；`prefers-reduced-motion` 下完全关闭位移。

## 状态边界

| 状态 | 真源 | 生命周期 |
|---|---|---|
| 入口位置 | ComfyUI 应用设置 `Aaalice.DiscordShare.Placement` | 当前 ComfyUI 用户 |
| 提示词来源 | `app.graph.extra.aaaliceDiscordShare.promptSource` | 随工作流保存 |
| 最新运行图像与提示词 | 浏览器内存中的最后一次成功执行快照 | 页面会话 |
| Discord 会话 | 浏览器当前 Origin 的本地会话 | 可撤销、自动过期 |
| Webhook、OAuth Secret | Cloudflare Worker Secret | 服务部署 |

提示词来源只保存 Preview Any 的稳定 Graph Id、Node Id 和显示标签，不复制提示词。
每次执行完成后从 `/history/{prompt_id}` 读取完整 outputs；失败时只回退到本次
`executed` 事件已经收到的输出。图像按执行输出顺序去重，提示词按限定执行 Id
反查绑定节点。最新运行数据、选中缩略图、图片尺寸和 Dialog 状态不得写入工作流。

## 分享流程

1. 没有成功运行图像时，入口只显示原生 Toast，不打开空相册。
2. 未连接时打开成员验证 Dialog；OAuth 仅申请 `identify` 与
   `guilds.members.read`。中继完成页优先通过精确 Origin 的 `postMessage` 交还
   随机会话；客户端同时用一次性 PKCE 风格 verifier 轮询短时 handoff，即使
   Discord 切断 `window.opener` 也不需要从公网跨站导航到本地 ComfyUI。
3. 中继在会话检查和每次发送前重新查询目标 Guild 成员身份；可选 Role 白名单在
   同一边界校验。未加入服务器时提供社区邀请和再次验证。
4. 已验证时打开最新运行相册。大图是主内容，底部水平缩略图队列显示文件名与
   分辨率，键盘方向键可切换。
5. 提示词缺失时保留相册但禁用发送，并指导用户右键 Preview Any 后重新运行。
6. 发送按钮只提交当前图像和正面提示词。中继以 Discord 三反引号代码块发送；
   超过单条 Embed 上限时拆分为多条消息，图像只附在第一条。

## 中继安全

- 客户端永远不知道 Webhook URL；中继日志不得输出 OAuth Token、会话 Token 或
  Webhook 响应中的敏感字段。
- OAuth `state` 使用 HMAC、Origin、Nonce、一次性 challenge 和短时过期；回调
  结果只允许签名 Origin 持有对应 verifier 的客户端领取，不进入 URL 或
  ComfyUI 请求日志。
- 会话 Token 使用高熵随机值，KV 仅以 SHA-256 摘要索引并设置 TTL。
- 每次发送校验成员、可选角色、用户级速率、图片 MIME 与大小、提示词非空。
- 默认允许 loopback ComfyUI Origin；LAN 或 HTTPS 部署必须显式加入
  `ALLOWED_ORIGINS`，不能使用 `*` CORS。
- Worker 部署失败、成员校验失败和 Webhook 失败必须返回明确错误，不得伪造发送
  成功或降级为无鉴权直发。
