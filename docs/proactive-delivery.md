# 让 agent 主动找你：投递架构与两个死胡同

目标：定时叫醒 agent，让它自己决定要不要给用户发消息，发了要**真的到微信里**。

走通这条路踩了两个坑，都是"以为成了其实没发出去"的类型，记录如下。

---

## 死胡同一：cron 的 system-event 注入主会话

```bash
openclaw cron add --name 主动 --cron "15 22 * * *" \
  --session main --system-event "你现在想找他说说话" --wake now
```

任务是跑起来了，agent 也生成了回复 —— **但消息永远没发出去**。

日志里只有会话记录，没有 `outbound` 那一行。

### 原因

投递依赖"这一轮从哪个通道来"：

```
OriginatingChannel / OriginatingTo   ← 来自会话上下文
```

定时任务注入时**没有来源通道**，所以回复没有投递目标，只进了 transcript。

### 为什么"有时候又能发出去"

如果用户**刚刚**发过消息（比如 1 分钟内），会话的回复路由还是"热"的，这时候注入就能发出去。

所以这个方案的表现是：**测试时能用，闲置一段时间后静默失效** —— 最难查的那种。

---

## 死胡同二：isolated + 显式 announce

主会话不允许 `--announce`（报错 `--announce requires a non-main agentTurn`），那就换 isolated：

```bash
openclaw cron add --name 主动 --cron "15 22 * * *" \
  --session isolated --message "你现在想找他说说话" \
  --announce --channel openclaw-weixin --account <id> --to "<wxid>@im.wechat"
```

任务跑了，模型也调用了，**还是没发出去。**

### 原因

announce 投递时目标被加了前缀：

```
to=user:<wxid>@im.wechat        ← 多了 user:
```

而插件的 contextToken 存储用的是**裸 id**：

```json
{ "<wxid>@im.wechat": "..." }
```

**键对不上 → contextToken missing → 静默失败。**

---

## 正解：Gateway HTTP hooks

`POST /hooks/agent` 支持**显式直投通道**，而且目标格式是正确的。

### 开启

```json5
{
  hooks: {
    enabled: true,
    token: "<长随机串>",
    path: "/hooks",
    allowedAgentIds: ["main"],
  },
}
```

> ⚠️ **坑**：如果同时要传 `sessionKey`，`allowedSessionKeyPrefixes` **必须包含 `hook:`**，
> 否则网关会启动失败：
> `hooks.allowedSessionKeyPrefixes must include 'hook:' when hooks.defaultSessionKey is unset`
>
> ```json5
> hooks: {
>   allowRequestSessionKey: true,
>   allowedSessionKeyPrefixes: ["hook:", "proactive:"],
> }
> ```

### 调用

```bash
curl -s http://127.0.0.1:18789/hooks/agent \
  -H 'Authorization: Bearer <hook-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "你现在想找他说说话",
    "channel": "openclaw-weixin",
    "to": "<wxid>@im.wechat",
    "accountId": "<account-id>",
    "deliver": true,
    "agentId": "main",
    "waitForCompletion": true
  }'
```

### 返回

```json
{"ok":true,"runId":"...","completion":{
  "status":"ok",
  "replyDisposition":"visible",
  "delivered":true,
  "deliveryAttempted":true}}
```

`replyDisposition` 是最有用的字段：

| 值 | 含义 |
|---|---|
| `visible` | 她说话了，已投递 |
| `silent` | 她选择了 NO_REPLY（**这是合法结果，不是失败**） |

> 注意 `delivered: true` 在 `silent` 时也会出现 —— 它表示"投递动作完成了"，不是"有消息发出"。
> **判断她有没有说话，看 `replyDisposition`。**

---

## 完整架构

```
cron（定时）→ --command 执行脚本 → POST /hooks/agent
                                        ↓
                                  agent 生成 / 决定沉默
                                        ↓
                                   直投到微信/飞书
```

### 为什么用 `--command` 而不是直接 `--message`

- `--message` 走 agentTurn，会撞上上面的投递问题
- `--command` 只是执行一个进程（脚本里自己做 HTTP 调用），完全可控

注册示例（Windows）：

```json
{
  "kind": "command",
  "argv": ["C:\\Program Files\\nodejs\\node.exe", "C:\\...proactive-send.mjs", "late"],
  "cwd": "C:\\Users\\..."
}
```

用 `--command-argv`（JSON 数组）而不是 `--command "..."`，**避免路径空格和中文的转义地狱**。

---

## 两个必要的保护

### 1. 过期补跑保护

机器关机期间错过的任务，**开机后会被补跑**。

问题：`07:35` 的提示词写的是"早上七点半你刚醒"，中午 12:55 才补跑 —— **文字和现实对不上，她只能沉默**。

修法：脚本里判断当前时间和该时段的钟点差，超过阈值直接跳过。

```js
let drift = Math.abs(nowMinutes - targetMinutes);
if (drift > 720) drift = 1440 - drift;        // 跨零点
if (drift > 120) { log("SKIPPED-STALE"); process.exit(0); }
```

### 2. 连发模式（一次说几句）

真人发微信是连着几条，不是一条广播。

做法：**同一个 persistent session 连打 N 次 hook**，每次一句；任何一次返回 `silent` 就立刻停。

```js
{
  sessionMode: "persistent",
  sessionKey: "proactive:late:2026-01-01",   // 同一时段共享上下文
}
```

因为共享会话，她能"接着刚才那句往下说"：

```
好无聊 你在干嘛
下午第一节课困死我了
回我 快点
```

> `--force` 式的测试（在不该跑的时间强行跑）会因为"时间对不上"被她判定为不合理而沉默。
> **测试时要么改提示词，要么接受这个结果。**

---

## 检查清单

| 症状 | 先查 |
|---|---|
| 任务跑了但微信没消息 | 日志有没有 `outbound: text sent OK` |
| 有 `contextToken missing` | 目标格式是不是带了 `user:` 前缀 |
| 网关起不来 | `allowedSessionKeyPrefixes` 有没有包含 `hook:` |
| 时间错乱 | 有没有做过期补跑保护 |
| `delivered: true` 但没消息 | 看 `replyDisposition` 是不是 `silent` |
