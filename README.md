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
