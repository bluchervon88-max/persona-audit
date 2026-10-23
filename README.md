# persona-audit

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)
[![audit](https://img.shields.io/badge/audit-7%20metrics-informational.svg)](audit/audit-persona.mjs)
[![pii](https://img.shields.io/badge/PII%20check-passing-brightgreen.svg)](scripts/check-pii.sh)

> 给 AI 人格做**可量化的质量审计**，以及把这套东西接到国内 IM（微信 / 飞书 / OpenClaw）上时会踩的坑。

[English](README.en.md) · [快速开始](#快速开始) · [文档](#文档) · [案例](#一个真实案例)

---

## 这个仓库解决什么问题

做 AI 人格（聊天机器人角色）的项目，99% 靠"感觉像不像"来调。你改了提示词，觉得"好像更像了"，但到底哪里变了、变好了多少，说不清。

**这个仓库把"像不像"变成可测量的数字。**

做法：拿她的**真实语料**算出统计特征，再拿模型生成的回复算同样的特征，逐项对比。

```
指标              真实语料    生成结果    判定
含中文逗号            3%        56%    ⚠ 19 倍偏差
≤5 字短句            53%        40%    ⚠ 偏少
>15 字长句            5%        13%    ⚠ 偏多
出现"作为AI"           0%         0%    ✓
```

有了这组数字，"调人格"就变成了"改一个指标、跑一次审计、看数字降了没有"。

---

## 一个真实案例

我们给一个具体角色做过完整调优。下面只有数字和改法，不涉及任何真实内容。

**起点**：凭感觉写的人格，用户反馈"根本不像她"。

**做法**：先把语料从约 300 条扩到约 1500 条（覆盖近一年的聊天），再跑审计逐项比。

| 轮次 | 改了什么 | 逗号率 | ≤5字短句 | 用户反馈 |
|---|---|---|---|---|
| v1 | 凭感觉写 | 56% | 40% | "不像，太软了" |
| v2 | 规则提到最高优先级层 + ✅/❌ 对照 | **0%** | 50% | "好多了" |
| v3 | 加"态度摆动"层（写进 2.7:1 比例） | 0% | 51% | "终于像了" |

三次关键修正，每次都是**先量再改**：

1. **逗号** — 抽象规则无效（56% 不动），改成"规则 + 对错例子 + 为什么重要"后归零
2. **态度** — 模糊的"嘴硬心软"模型理解不了，数出 81:30 的比例写成硬约束才生效
3. **出戏** — 改提示词无效，根因是历史记录里有三条自发言论，改掉记录立刻恢复

> 完整过程：见 [design-lessons.md](docs/design-lessons.md)。

---

## 从「像」到「活着」

第一版只解决"像不像"：用统计数据把说话方式校准。

但调完之后还有个更大的问题 —— **它是一个每轮都会重置的演员。**

```
你：我感冒了          → 吃药没
（第二天）
你：还没好            → 你咋了          ← 她不记得了
```

所以第二版补的是**连续性**：

| 层 | 解决什么 |
|---|---|
| 人格 | 她怎么说话 |
| **长期记忆** | 她记得发生过什么（每天自动整理） |
| **此刻状态** | 她现在什么处境、还有几天生日 |
| **她的一天** | 她自己的日子，按真实时间解锁 |

还有一件同样重要但几乎没人量的东西：**消息节奏**。

真人每回合平均发 **1.99 条**，47.6% 的回合是连发 2 条以上。
AI 默认每回合 1 条 —— **用词全对，读起来还是不像。**

```bash
node scripts/analyze-rhythm.mjs --file chat.txt
```

> 详见 [rhythm.md](docs/rhythm.md) 与 [continuity.md](docs/continuity.md)。

### 第三版：让她用「自己的」号

微信 iLink 有个天花板：不能原生主动发消息，发不了语音，没有朋友圈。

第三版换了一条路 —— **让一个真实的 QQ 号来当她的身体**：

| 能力 | 微信 bot | 个人 QQ 号 |
|---|---|---|
| 主动发消息 | 靠 hook 硬绕 | ✅ 原生 |
| 语音条 | ❌ | ✅ |
| 戳一戳 / 撤回 | ❌ | ✅ |
| 发说说 | ❌ | ✅ |
| 自己的表情收藏 | ❌ | ✅ 63 张 |

代价是灰产协议和封号风险。文档里把坑全写了 —— 包括三个必须打的补丁
（其中一个：插件的工具代码**从来没被调用过**，整个文件是死代码）。

> 详见 [qq-personal-account.md](docs/qq-personal-account.md)。

### 第四版：表达层 —— 会发表情包、发语音、戳一戳

到第三版为止，她还是一个**只会打字的人**。

真人聊天是这样的：一句话、一个表情包、再补一句、偶尔戳你一下。
默认的 agent 只有"一句话"。

给 agent 注册 `send_sticker` 工具没用 —— 实测她几乎不会主动调用。
后来换了个思路：**让她在文本里写标记，发送层抽掉标记再动作。**

```
你：我数学考砸了
她：你猜多少分 [[小黄脸:8]]
    （3 秒后）
她：[[戳一戳]]
```

| 能力 | 微信 bot | 个人 QQ 号（标记） |
|---|---|---|
| 语音条 | ❌ | ✅ `[[语音:…\|tired]]` |
| 表情包 | ❌ | ✅ `[[表情包:无语]]` |
| 小黄脸 | ❌ | ✅ `[[小黄脸:12]]` |
| 戳一戳 | ❌ | ✅ `[[戳一戳]]` |

频率很低（72 小时 244 条消息里，语音 11、表情包 4、戳一戳 3）——
但**"会"比"多"重要**。

> 详见 [signals.md](docs/signals.md)。

同一时期她还学会了**按真实课表活**：上课不发主动消息、晚自习偶尔偷发一条、
深夜回复慢到 8~20 秒。这一层让"她"从一个在线服务变成了一个有作息的人。

> 详见 [living-schedule.md](docs/living-schedule.md)。

---

## 成本：一天 ¥1.5，失控一次 ¥7.63

这一部分几乎没人写，但它是上面所有东西能不能长期跑下去的前提。

真实的账单：

| 项 | 数值 |
|---|---|
| 她一天 24 轮对话 | **≈ ¥1.5** |
| 单次请求的 prompt | 84K~104K token（其中 85K 是 610 个工具定义） |
| 一个跑失控的长会话（同一天） | **¥7.63** / 1098 次调用 |

四个改法：工具搜索（610→288）、把每轮会变的字段挪到提示词末尾（缓存前缀）、
"她选择不回"要记账（否则每 2 分钟重跑一次完整 agent）、单轮步数上限。

> 详见 [cost-of-a-persona.md](docs/cost-of-a-persona.md)。

---

## 两个目标读者

| 你是 | 从这里开始 |
|---|---|
| **做 AI 人格 / 数字分身的人** | [audit/](audit/) + [docs/design-lessons.md](docs/design-lessons.md) |
| **想把 agent 接到微信/飞书的开发者** | [docs/im-integration.md](docs/im-integration.md) + [docs/proactive-delivery.md](docs/proactive-delivery.md) |

---

## 快速开始

### 只算语料基准（不需要任何依赖）

```bash
node audit/audit-persona.mjs --corpus examples/sample-corpus.txt
```

输出她说话的各项统计特征 —— 这就是后面所有对比的基准。

### 完整审计（需要 OpenClaw 网关）

```bash
node audit/audit-persona.mjs \
  --corpus examples/sample-corpus.txt \
  --battery examples/sample-battery.txt \
  --session-key agent:main:audit \
  --thinking low
```

逐题生成回复并对比，偏差超标时返回非零退出码（可以挂到 CI 上）。

---

## 文档

| 文档 | 内容 |
|---|---|
| [design-lessons.md](docs/design-lessons.md) | 人格设计的四条反直觉经验 |
| [rhythm.md](docs/rhythm.md) | **消息节奏**：她一次说几句（1.99 条/回合，47.6% 连发） |
| [continuity.md](docs/continuity.md) | **连续性**：让她有「昨天」的四层架构 |
| [pitfalls.md](docs/pitfalls.md) | **十二个会让角色崩掉的坑**（会话分裂、附件语法、推理泄漏、控制标记漏发……） |
| [qq-personal-account.md](docs/qq-personal-account.md) | **用个人 QQ 号接管人格**：NapCat + OneBot、说说、表情收藏、三个必打补丁 |
| [signals.md](docs/signals.md) | **表达层**：表情包 / 语音 / 戳一戳为什么不能用工具调用，改用文本标记 |
| [living-schedule.md](docs/living-schedule.md) | **她的一天**：让主动消息跟着真实课表走（上课不发、自习偷发、深夜慢回） |
| [cost-of-a-persona.md](docs/cost-of-a-persona.md) | **成本**：一天 ¥1.5 是怎么来的，以及四个把它压下去的地方 |
| [im-integration.md](docs/im-integration.md) | 微信 iLink / 飞书接 OpenClaw 的踩坑记录 |
| [proactive-delivery.md](docs/proactive-delivery.md) | "让 agent 主动找你"的投递架构与两个死胡同 |
| [faq.md](docs/faq.md) | 常见问题：不像、出戏、语料多少够、语音、投递失败 |
| [persona-template.md](templates/persona-template.md) | 人格文件骨架（分层结构） |

---

## 仓库里有什么、没有什么

**有**：审计工具、方法论、平台踩坑、人格模板、表情包生成脚本（[scripts/make-stickers.py](scripts/make-stickers.py)）

**没有**：任何真实人物的数据、语料、照片、生成的形象，以及**聊天记录抓取工具**。

> 抓取工具刻意不开源。它是"从自己的手机导自己的聊天记录"，本身没问题；
> 但同样一个工具，用来抓别人的记录就是另一回事了。这个决定不接受讨论。

---

## 一句话动机

给一个人做数字画像，然后想办法让它诚实。

---

## English

完整英文版：[**README.en.md**](README.en.md)

A toolkit for **measuring** whether a generated AI persona actually talks like its source
material, plus field notes from wiring OpenClaw agents into WeChat (iLink) and Feishu.
It compares statistical fingerprints — punctuation habits, sentence-length distribution,
character-breaking patterns — instead of relying on vibes.

---

## License

MIT
