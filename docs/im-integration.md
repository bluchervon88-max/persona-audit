# 把 OpenClaw agent 接到微信 / 飞书的踩坑记录

适用于 OpenClaw 2026.10.3。这些都是实测踩出来的，照着抄能少走几个小时。

---

## 一、微信（iLink 插件）

### 1. 插件版本有硬依赖

`@tencent-weixin/openclaw-weixin` **2.4.8 在 OpenClaw 2026.10.3 上加载失败**：

```
cannot import openclaw/plugin-sdk/infra-runtime
```

因为新版核心删掉了那个 SDK 子路径。**2.4.10 才能用**。

```bash
openclaw plugins install @tencent-weixin/openclaw-weixin@2.4.10
```

### 2. 扫码登录的 QR 要用 `bot_type=3`

如果自己生成二维码，URL 里**必须带 `&bot_type=3`**，否则扫了进不去。

⚠️ 通过 cmd.exe 传 URL 时 `&` 会被吃掉 —— 用程序直接生成图片，别走 shell。

### 3. `contextToken` 的键格式是致命的

插件把对话的 context token 存在：

```
~/.openclaw/openclaw-weixin/accounts/<accountId>.context-tokens.json
```

**键是裸的用户 id**：

```json
{ "<wxid>@im.wechat": "<context-token>" }
```

发送时如果目标带了前缀（`user:<wxid>@im.wechat`），**键对不上**，日志会打：

```
sendWeixinOutbound: contextToken missing for to=user:..., sending without context
```

**然后静默失败。** API 返回 `ret:0`，但消息永远不出现。

> 这是最难查的一类 bug：没有报错，只在你以为发成功的时候沉默。

### 4. 入站靠 sync buffer 游标

插件用 `get_updates_buf` 做增量拉取，重启后从上次游标继续：

```
resuming from previous sync buf (108 bytes)
```

所以**网关离线期间对方发的消息，恢复后会补收**（受服务端保留期限制）。

---

## 二、飞书（官方插件）

### 1. 错误码 21001 通常不是配置问题，是身份问题

```
POST open-apis/auth/v3/tenant_access_token/internal
→ {"code":21001,"msg":"Access denied by access control policy."}
```

排查顺序（按命中率）：

| 检查项 | 怎么查 |
|---|---|
| **凭证是否有效** | 故意用错 secret，报 `10014 app secret invalid` 说明你的 secret 是对的 |
| **IP 白名单** | 安全设置 → IP 白名单，开着就清空 |
| **应用是否发布** | 版本管理与发布 → 有没有"创建版本"按钮 |
| **身份是不是个人账号** | 打开管理后台看提示 —— 见下 |

**最坑的一种**：如果你的飞书账号是"个人身份"（没有企业），建出来的应用**一律调不了 API**。管理后台会直接告诉你：

```
当前登录身份为 XXX（某某账号），请创建企业以访问管理后台
```

解决办法：**创建一个企业**（免费），然后在新企业下建应用。

### 2. 双向验证法

判断"是我配置错了还是平台拒了"，一个动作就够：

```bash
# 正确凭证
curl -s -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"cli_xxx","app_secret":"正确"}'
# → 21001  access denied

# 错误凭证
curl -s ... -d '{"app_id":"cli_xxx","app_secret":"错的"}'
# → 10014  app secret invalid
```

**如果错的报"密码错"、对的报"被拒"** → 凭证是对的，是策略问题，别再去翻文档了。

### 3. 事件订阅要选长连接

事件与回调 → 订阅方式选 **WebSocket（长连接）**，事件至少订阅 `im.message.receive_v1`。

---

## 三、通道准入策略（两个通道都适用）

`dmPolicy` 的取值语义容易搞错：

```js
// 核心源码逻辑
if (dmPolicy === "open") {
  return allowFrom.includes("*") ? 允许 : (allowFrom 里有这个人 ? 允许 : 拒绝)
}
```

**关键陷阱**：`dmPolicy: "open"` 且 `allowFrom: []`（空数组）→ **谁都进不来**。

```json5
// ❌ 想全开却全封
{ "dmPolicy": "open", "allowFrom": [] }

// ✅ 真的全开
{ "dmPolicy": "open", "allowFrom": ["*"] }

// ✅ 只放行特定人（推荐）
{ "dmPolicy": "allowlist", "allowFrom": ["ou_xxx"] }
```

配置校验会警告你，但**它不会拦住你** —— 所以这个坑要自己记住。

---

## 四、排障清单

通道"能收不能发"的时候，按这个顺序查：

1. `openclaw channels status` —— 是不是 `running, connected`
2. 日志里搜 `outbound: text sent OK` —— 有没有真的发出去
3. 搜 `contextToken missing` —— 目标格式对不对
4. 搜 `Refusing` / `invalid` —— 是不是被策略拒了
5. 用 `openclaw message send --dry-run` 看 payload 长什么样
