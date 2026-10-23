# persona-audit

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)
[![audit](https://img.shields.io/badge/audit-7%20metrics-informational.svg)](audit/audit-persona.mjs)
[![pii](https://img.shields.io/badge/PII%20check-passing-brightgreen.svg)](scripts/check-pii.sh)

> **Measure** whether an AI persona actually talks like its source material —
> plus field notes from wiring OpenClaw agents into WeChat (iLink) and Feishu.

[中文](README.md) · [Quick start](#quick-start) · [Docs](#docs) · [Case study](#case-study)

---

## The problem

Most AI-persona projects are tuned by vibes. You edit the prompt, it "feels more like her",
but you can't say *what* changed or *by how much*.

This repo turns "does it feel right?" into numbers.

Take the real source material (chat logs, letters — whatever you have), compute its
**statistical fingerprint**, then ask the model the same questions and compute the same
fingerprint. Compare them side by side.

```
metric            real corpus   generated   verdict
Chinese comma           3%         56%    ⚠ 19x off
short (≤5 chars)       53%         40%    ⚠ too few
long (>15 chars)        5%         13%    ⚠ too many
"as an AI" lines        0%          0%    ✓
```

Now "tune the persona" becomes "change one metric, run the audit, watch the number drop".

---

## From "resembling" to "living"

v1 solved the *resemblance* problem: calibrate how it talks with statistics.

v2 solves the *continuity* problem — **a persona with no memory is an actor that resets every turn.**

| Layer | Solves |
|---|---|
| Persona | how it talks |
| **Long-term memory** | what it remembers (consolidated nightly) |
| **Current state** | where it is right now, how many days until its birthday |
| **Its own day** | a life that unlocks in real time |

And one thing almost nobody measures: **message rhythm.**

Real people send **1.99 messages per turn**, and 47.6% of turns are 2+ messages.
An AI sends exactly 1 by default — **perfect vocabulary, still reads wrong.**

```bash
node scripts/analyze-rhythm.mjs --file chat.txt
```

---

## Who this is for

| You are | Start here |
|---|---|
| **Building an AI persona / digital portrait** | [audit/](audit/) + [design-lessons.md](docs/design-lessons.md) |
| **Making it feel alive over time** | [rhythm.md](docs/rhythm.md) + [continuity.md](docs/continuity.md) |
| **Debugging "why is it acting broken"** | [pitfalls.md](docs/pitfalls.md) |
| **Connecting an agent to WeChat / Feishu** | [im-integration.md](docs/im-integration.md) + [proactive-delivery.md](docs/proactive-delivery.md) |
| **Giving it a real QQ account** | [qq-personal-account.md](docs/qq-personal-account.md) — NapCat + OneBot, Qzone, its own sticker collection, and three mandatory patches |

---

## Quick start

### Corpus baseline only (no dependencies)

```bash
node audit/audit-persona.mjs --corpus examples/sample-corpus.txt
```

Prints the fingerprint of the source material — the baseline everything is compared against.

### Full audit (needs a running OpenClaw gateway)

```bash
node audit/audit-persona.mjs \
  --corpus examples/sample-corpus.txt \
  --battery examples/sample-battery.txt \
  --session-key agent:main:audit \
  --thinking low
```

Generates a reply per prompt, compares every metric, and **exits non-zero when a metric
drifts past its tolerance** — so you can wire it into CI.

---

## Case study

A real tuning run. Only numbers and what we changed — no personal content.

**Start**: persona written by feel. User feedback: *"this doesn't feel like her at all."*

**Method**: expanded the corpus from ~300 to ~1500 lines, then audited.

| Round | Change | Commas | Short lines | Feedback |
|---|---|---|---|---|
| v1 | written by feel | 56% | 40% | "too soft, not her" |
| v2 | rules moved to top layer + ✅/❌ examples | **0%** | 50% | "much better" |
| v3 | added an "attitude swing" layer (2.7:1 ratio) | 0% | 51% | "finally her" |

Three fixes, each **measured before changed**:

1. **Punctuation** — an abstract rule did nothing (stuck at 56%); "rule + correct/incorrect
   examples + why it matters" took it to zero.
2. **Attitude** — "hard on the outside, soft inside" is unparseable for a model; counting
   81 harsh : 30 tender lines and writing the ratio in as a hard constraint worked.
3. **Breaking character** — no prompt change helped. The root cause was three stale lines
   in the transcript where the persona called itself an AI. Fixing the history fixed it.

> Full write-up: [design-lessons.md](docs/design-lessons.md) (Chinese).

---

## Docs

| Doc | What's in it |
|---|---|
| [design-lessons.md](docs/design-lessons.md) | Four counter-intuitive persona-design lessons |
| [im-integration.md](docs/im-integration.md) | WeChat iLink / Feishu integration gotchas |
| [proactive-delivery.md](docs/proactive-delivery.md) | How to make an agent message you *first*, and two dead ends |
| [signals.md](docs/signals.md) | **Expression layer**: stickers / voice / nudges — why tool calls fail and inline markers work |
| [living-schedule.md](docs/living-schedule.md) | **Her day**: proactive messages that follow a real school timetable |
| [cost-of-a-persona.md](docs/cost-of-a-persona.md) | **Cost**: what a live persona costs per day (≈¥1.5) and the four things that blow it up |
| [faq.md](docs/faq.md) | Common questions: "doesn't feel like her", breaking character, corpus size, voice, delivery failures |
| [persona-template.md](templates/persona-template.md) | Layered persona skeleton |

---

## What's in — and what's deliberately not

**Included**: the audit tool, the methodology, platform field notes, a persona template,
and generic utilities (sticker generator, PII checker).

**Not included**: any real person's data, corpus, photos, generated likeness, or **a
chat-scraping tool**.

> The scraper is deliberately withheld. Exporting your *own* chat history is legitimate;
> the same tool pointed at someone else's is not. This is not up for debate.

---

## One-line motivation

Build a digital portrait of someone, then try to make it honest.

---

## License

MIT — see [LICENSE](LICENSE).
