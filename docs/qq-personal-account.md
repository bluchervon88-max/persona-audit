# 用「个人 QQ 号」接管一个 AI 人格

> 微信 iLink 做不到的事：原生主动发消息、语音条、戳一戳、发说说。
> 个人 QQ 号 + NapCat 能做到 —— 代价是灰产协议和封号风险。

---

## 一、为什么不用官方 QQ 机器人

官方 QQ Bot（q.qq.com）是正规渠道，但它是个**机器人**：

- 名字后面挂着「机器人」标识
- 不能发说说、不能戳一戳、不能改资料
- 主动发消息有严格限制

而**个人号接协议**（NapCat / LLOneBot / Lagrange）拿到的是**一个真人账号**：
朋友圈、说说、戳一戳、表情收藏，全都是真的。

**社交真实感的差别，比技术差别大得多。**

---

## 二、架构

```
QQ 号（登录在 NapCat 里）
        ↓ OneBot v11 WebSocket
    NapCat（协议端，127.0.0.1:3001）
        ↓
  openclaw-onebot 插件
        ↓
    OpenClaw Agent（她）
```

**关键点：NapCat 只监听 127.0.0.1。** 2025 年 9 月有人把 NapCat 的 WebUI 暴露在公网，被攻击者操纵 API 在群里发违法信息，**所有被波及的账号被永久封禁**。

---

## 三、安装（Windows）

### 一键包（推荐）

```
下载 NapCat.Shell.Windows.OneKey.zip
运行 NapCatInstaller.exe
```

**但它会卡在交互提示上**（无控制台时）。如果卡住，走手动：

```
下载 NapCat.Shell.zip → 解压到任意目录
（里面含 launcher.bat、napcat.mjs、注入用的 dll）
```

### 第一个坑：QQ 版本不匹配

```
launcher.bat 从注册表读 QQ 路径 → 用系统装的 QQ
如果系统 QQ 版本旧（比如 9.9.28），启动直接弹 Error 窗口
```

**解法**：用 NapCat 自带的那份 QQ（一键包会下载到 `NapCat.XXXXX.Shell\`）。

```powershell
$shelf = "C:\path\to\shelf"
$qq    = "C:\path\to\NapCat.52230.Shell\QQ.exe"   # 版本要和 NapCat 匹配

$env:NAPCAT_PATCH_PACKAGE = "$shelf\qqnt.json"
$env:NAPCAT_LOAD_PATH     = "$shelf\loadNapCat.js"
$env:NAPCAT_INJECT_PATH   = "$shelf\NapCatWinBootHook.dll"
$env:NAPCAT_LAUNCHER_PATH = "$shelf\NapCatWinBootMain.exe"
$env:NAPCAT_MAIN_PATH     = "$shelf\napcat.mjs"

& $env:NAPCAT_LAUNCHER_PATH $qq $env:NAPCAT_INJECT_PATH
```

### 第二个坑：重启后不一定能免扫码

NapCat 重启后如果 QQ 里没有保存会话，就得重新扫码。

网上流传的 `-q <QQ号>`（快速登录）**在我们这里不成立**：

```
传了 -q 之后 NapCatWinBootMain 直接退出，QQ 根本没起来
```

**更糟的是手动补救**：不通过 NapCat 的启动器、直接起 Shell 版 QQ，
QQ 会弹「文件已被损坏，请重新安装QQ」。

> **千万别重装。** 那个提示是注入环境变量缺失导致的，不是真损坏；
> 重装会丢掉已经登录的会话，从此只能扫码。

正确的恢复方式是让计划任务重新走完整启动链：

```powershell
Start-ScheduledTask -TaskName "NapCat Autostart"
# 然后等 4~5 分钟，让网关也起来
```

### 第三个坑：想知道"她上线了吗"，别看进程

QQ 进程有 4 个、WebUI 也在跑，但 **3001 端口可能是关的** —— 那就是她"聋了"。

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen
```

没有 listener = OneBot 没起来 = 收不到也发不出。进程在不在没有意义。

---

## 四、登录与配置

登录后 NapCat 会在 `config/` 下生成：

```
napcat_<uin>.json
napcat_protocol_<uin>.json
onebot11_<uin>.json        ← OneBot 网络配置
webui.json                 ← WebUI 令牌
```

**默认 OneBot 网络配置是空的**（没有任何 server/client）。要开 WS 服务：

```json
{
  "network": {
    "websocketServers": [{
      "name": "openclaw",
      "enable": true,
      "host": "127.0.0.1",
      "port": 3001,
      "messagePostFormat": "array",
      "reportSelfMessage": false,
      "token": "",
      "enableForcePushEvent": true,
      "heartInterval": 30000
    }]
  }
}
```

改完要重启 NapCat。

---

### 用 WebUI API 查登录状态（省得一直盯窗口）

NapCat 的 WebUI（默认 6099）有一套 HTTP API，**只接受 POST**（GET 全 404）。

```js
// 1) 换 Credential：sha256(<webui token> + ".napcat")
const hash = sha256(token + ".napcat");
POST /api/auth/login  {"hash": hash}
// → {"data": {"Credential": "..."}}

// 2) 之后每个请求都带
Authorization: Bearer <Credential>

// 3) 有没有登进去
POST /api/QQLogin/GetQQLoginInfo
// → {"uid":"","uin":"","nick":""}   ← 全空 = 还没登录

// 4) 有没有可快速登录的会话
POST /api/QQLogin/GetQuickLoginList
// → []   ← 空 = 必须扫码，任何"免扫码"办法都没用

// 5) 重新要一张登录二维码
POST /api/QQLogin/GetQQLoginQrcode
// → {"data":{"qrcode":"https://txz.qq.com/p?k=…"}}
```

**别对着 WebUI 页面截图再放大** —— 页面里的二维码是缓存，可能已经过期；
用 API 拿 `qrcode` 链接自己渲染，或者直接从窗口缓存
（`shelf/cache/qrcode.png`）取最新那张。

`webui.json` 里的 `"autoLoginAccount": "<QQ号>"` **只在你已经存过会话时有用**。
`GetQuickLoginList` 返回 `[]` 的时候，这一行什么都救不了。

---

## 五、接进 OpenClaw

```bash
openclaw plugins install --force @lkl-zero/openclaw-onebot
```

`--force` 是必须的：它在 ClawHub 之外，OpenClaw 会拦。

配置：

```json
{
  "channels": {
    "onebot": {
      "type": "forward-websocket",
      "host": "127.0.0.1",
      "port": 3001,
      "accessToken": "",
      "requireMention": true,
      "whitelistUserIds": [你的QQ号],
      "renderMarkdownToPlain": true
    }
  }
}
```

**`whitelistUserIds` 必须填。** 插件默认「私聊全回复」—— 别人私聊这个号，AI 会以真人的身份回话。

---

## 六、三个必须打的补丁

插件有不少坑，这三个不打，功能残废。

### ① 私聊会话合并到主会话

插件给私聊单独开会话（`agent:main:onebot:<QQ号>`），导致 **QQ 上和微信上是两个不同的"她"**，记忆不通。

```js
// dist/handlers/process-inbound.js
const sessionId = isGroup
    ? \`agent:\${route.agentId}:\${tempSessionId}\`
    : \`agent:\${route.agentId}:main\`;   // ← 私聊走主会话
```

**副作用**：主动消息的提示词会留在主会话历史里。值得。

### ② 群消息一律不理

```js
// dist/handlers/process-inbound.js，在 OCR 之前
if (isGroup && (cfg?.channels?.onebot?.ignoreGroups ?? true)) {
    api.logger?.info?.("[onebot] ignoring group message (ignoreGroups=true)");
    return;
}
```

放在最前面 —— 连图片 OCR 都不做，省 API 费用。

### ③ 注册 Agent 工具（**最要命的那个**）

插件里有完整的 `tools.js`（11 个工具），但 **`index.js` 从来没调用 `registerTools(api)`** —— 全是死代码。

```js
// dist/index.js
import { registerTools } from "./tools.js";
...
api.registerChannel({ plugin: OneBotChannelPlugin });
registerTools(api);   // ← 加这行
```

**并且**要在 `openclaw.plugin.json` 里声明：

```json
{
  "contracts": {
    "tools": ["onebot_send_text", "onebot_send_image", "..."]
  }
}
```

**不声明 = 静默拒绝**。`api.registerTool` 不抛错，只在网关日志里写一行警告：

```
[plugins] plugin must declare contracts.tools before registering agent tools
```

---

## 七、QQ 空间（说说）

NapCat 暴露了两个动作：

```js
send_qzone_msg({
  content: "正文",
  images: [],          // 本地图片路径
  ugc_right: 4,        // 1=所有人 4=好友 16=部分好友 64=仅自己 128=部分不可见
  target_uins: []      // ugc_right 为 16/128 时用
})

delete_qzone_msg({ tid })   // tid 来自发说说的返回值
```

**调试建议**：先用 `ugc_right: 64`（仅自己可见）发几条，确认内容没问题再放开。

---

## 八、她自己的表情包

一句话就能把她 QQ 里存的收藏表情全拉下来：

```js
// OneBot 动作
fetch_custom_face({ count: 100 })
// → 返回一组 https://p.qpic.cn/qq_expression/<uin>/... 的 URL
```

**这比你画的表情包强一百倍** —— 那是她自己攒的。

拿到之后建议：

1. 下载到本地
2. **按内容打标签**（骂人 / 无语 / 可爱 / 委屈 / 笑 / 沙雕）
3. **文件改名成语义化的**：`凶_网警恶俗_06.png`、`无语_马脸问号_27.png`
   —— 模型挑图靠文件名，`27.png` 它挑不出来
4. 把清单写进人格

同时**排除露骨/低俗的**。角色的年龄和边界要先想清楚。

---

## 九、封号风险（必读）

- 协议登录 = 违反 QQ 用户协议
- **2026 年 2 月，NapCat 的 1/3/4 号官方群被解散**，作者在找维护者
- **2025 年 9 月有人公网暴露 WebUI，被波及的账号永久封禁**

**三条底线：**

1. **不要用主号** —— 用不心疼的小号
2. **只监听 127.0.0.1** —— 永远别把 OneBot 端口暴露公网
3. **接受它随时会没** —— 这号被封是概率问题，不是会不会的问题

社区里有人说"老号 + 开过会员不容易封"。**这没有官方依据，别当真。**
