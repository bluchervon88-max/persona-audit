#!/usr/bin/env node
/**
 * analyze-rhythm.mjs — 量出一个人发消息的"节奏"，不只是用词。
 *
 * 为什么要量节奏：
 *   写人格的时候大家只看"怎么说话"（用词、标点、句长），
 *   但聊天记录里还有一个同样明显、却几乎没人量的东西 ——
 *   她是一次说一句，还是一次说三四句？
 *
 *   真人平均每回合发 1.99 条，47.6% 的回合是 2 条以上。
 *   如果一个 AI 永远一条一条发，你会觉得"哪里不对"但说不出。
 *
 * 用法：
 *   node scripts/analyze-rhythm.mjs --file chat.txt
 *
 * 支持的格式（自动识别）：
 *
 *   1) 带时间块（微信/抖音导出的常见形式）
 *      ── 03/20 16:52 ──
 *      她：今天好烦
 *      我：咋了
 *
 *   2) 简单两列
 *      她：今天好烦
 *      我：咋了
 *
 * 说话人名字用 --a / --b 指定（默认 她 / 我）。
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const file = opt("file");
const A = opt("a", "她");
const B = opt("b", "我");

if (!file) {
  console.error("用法: node scripts/analyze-rhythm.mjs --file chat.txt [--a 她] [--b 我]");
  process.exit(1);
}

let text;
try { text = readFileSync(file, "utf8"); }
catch { console.error("读不到文件: " + file); process.exit(1); }

// 拆成 { who, text } 序列
const msgs = [];
const re = new RegExp("^(" + [A, B].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\s*[：:](.*)$");
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  if (/^[─=-]{3,}/.test(line)) continue;          // 时间块分隔
  const m = re.exec(line);
  if (!m) continue;
  const body = m[2].trim();
  if (!body) continue;
  // 噪音行
  if (/^\[系统\]|消息已发出|拒收|无法查看|暂未公开|赞了你/.test(body)) continue;
  msgs.push({ who: m[1], text: body });
}

if (msgs.length < 20) {
  console.error("有效消息太少（" + msgs.length + " 条），至少需要 20 条");
  process.exit(1);
}

// 把连续同一个人的消息合成"一个回合"
const turns = { [A]: [], [B]: [] };
let cur = null, buf = [];
const flush = () => {
  if (cur && buf.length) turns[cur].push({ n: buf.length, chars: buf.reduce((a, t) => a + t.length, 0) });
  buf = [];
};
for (const m of msgs) {
  if (m.who !== cur) { flush(); cur = m.who; }
  if (m.who === cur) buf.push(m.text);
}
flush();

function report(name, arr) {
  if (!arr.length) { console.log(name + ": 没有消息"); return; }
  const totalMsgs = arr.reduce((a, t) => a + t.n, 0);
  const totalChars = arr.reduce((a, t) => a + t.chars, 0);
  const perTurnMsgs = totalMsgs / arr.length;
  const perTurnChars = totalChars / arr.length;
  const perMsgChars = totalChars / totalMsgs;

  console.log("");
  console.log("=== " + name + " ===");
  console.log("  回合数            " + arr.length);
  console.log("  消息总数          " + totalMsgs);
  console.log("  每回合平均条数    " + perTurnMsgs.toFixed(2) + "   ← AI 默认只有 1");
  console.log("  每回合平均字数    " + perTurnChars.toFixed(1) + "   ← 单条长短不重要，这个才重要");
  console.log("  每条平均字数      " + perMsgChars.toFixed(1));

  const dist = {};
  for (const t of arr) dist[t.n] = (dist[t.n] || 0) + 1;
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b).filter(k => k <= 6);
  console.log("");
  console.log("  连发分布：");
  for (const k of keys) {
    const pct = dist[k] / arr.length * 100;
    const bar = "█".repeat(Math.round(pct / 2));
    console.log("    " + String(k).padStart(2) + " 条  " + pct.toFixed(1).padStart(5) + "%  " + bar);
  }
  const multi = arr.filter(t => t.n >= 2).length;
  console.log("    ────────────────────────────────");
  console.log("    2 条以上: " + (multi / arr.length * 100).toFixed(1) + "%");

  // 给人格文件用的建议值
  console.log("");
  console.log("  写进人格的参考值：");
  console.log("    「平均每回合 " + perTurnMsgs.toFixed(2) + " 条，其中 " + (multi / arr.length * 100).toFixed(0) + "% 是连发 2 条以上」");
  const longTurn = arr.filter(t => t.chars >= 20).length;
  console.log("    「" + (longTurn / arr.length * 100).toFixed(0) + "% 的回合总字数超过 20 字」");
}

console.log("=== 聊天节奏分析 ===");
console.log("文件: " + file + "   有效消息 " + msgs.length + " 条");
report(A, turns[A]);
report(B, turns[B]);

console.log("");
console.log("=== 怎么用这些数字 ===");
console.log("1. 「每回合条数」决定你的 AI 要不要连发。1 条以上就是需要连发机制。");
console.log("2. 「每回合字数」是标尺 —— 不要只盯单条长短，会做过头。");
console.log("3. 「连发分布」直接抄进连发概率表。");
console.log("");
console.log("参考实现见 docs/rhythm.md。");
