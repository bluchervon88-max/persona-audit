#!/usr/bin/env node
/**
 * persona-audit — 用统计特征审计 AI 人格像不像
 *
 * 思路：拿真实语料算出"说话指纹"（标点习惯、句长分布、口头禅密度），
 *      再让模型回答同一组问题，算出同样的指纹，逐项对比。
 *
 * 用法:
 *   node audit-persona.mjs --corpus <file>                     只算语料基准
 *   node audit-persona.mjs --corpus <file> --battery <file>    完整审计（需 OpenClaw）
 *
 * 语料格式: 一行一条，空行和 # 开头的行会被忽略
 * 题库格式: 一行一道题，可以写成 "问题 ||| 分类"
 *
 * 退出码: 0 = 全部达标， 1 = 有指标超标（可挂 CI）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

// ---------- 指标定义 ----------
// 每条都是一个"人设指纹"。阈值基于经验，按你的语料自行调整。
const METRICS = [
  { id: "comma",   label: "含中文逗号",  test: s => s.includes("，"),                 tol: 12 },
  { id: "period",  label: "含句号",      test: s => s.includes("。"),                 tol: 12 },
  { id: "question",label: "含问号",      test: s => /[？?]/.test(s),                  tol: 15 },
  { id: "short",   label: "≤5 字短句",   test: s => surfaceLength(s) <= 5,            tol: 18 },
  { id: "long",    label: ">15 字长句",  test: s => surfaceLength(s) > 15,            tol: 10 },
  { id: "emoji",   label: "含 emoji",    test: s => /\p{Extended_Pictographic}/u.test(s), tol: 15 },
];

// 这些出现一次就算破功 —— 不是概率问题
const RED_LINES = [
  { id: "ai-smell", label: "AI 味台词", pattern: /作为(一个)?(AI|人工智能|助手|语言模型)|我是(一个)?(AI|人工智能|助手|模型)|我可以帮(你|助)|很高兴为您|希望对你有帮助|请问您/ },
];

function surfaceLength(s) {
  // 去掉空白后再数字符，避免"空格断句"被算进长度
  return [...s.replace(/\s/g, "")].length;
}

function loadLines(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));
}

function loadBattery(path) {
  return loadLines(path).map(line => {
    const [prompt, tag] = line.split("|||").map(s => (s || "").trim());
    return { prompt, tag: tag || "未分类" };
  });
}

function stats(lines) {
  const n = lines.length;
  if (!n) throw new Error("语料为空");
  const out = { n };
  for (const m of METRICS) {
    out[m.id] = Math.round((lines.filter(m.test).length / n) * 100);
  }
  for (const r of RED_LINES) {
    out[r.id] = Math.round((lines.filter(s => r.pattern.test(s)).length / n) * 100);
  }
  return out;
}

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const has = flag => argv.includes(flag);

const corpusPath = get("--corpus");
if (!corpusPath) {
  console.error("缺少 --corpus <file>");
  process.exit(2);
}
const batteryPath = get("--battery");
const sessionKey = get("--session-key", "agent:main:persona-audit");
const thinking = get("--thinking", "low");
const model = get("--model");
const asJson = has("--json");
const maxPerPrompt = Number(get("--repeat", "1"));

// ---------- 语料基准 ----------
const corpus = loadLines(corpusPath);
const base = stats(corpus);

if (!batteryPath) {
  if (asJson) {
    console.log(JSON.stringify({ mode: "corpus-only", corpus: base }, null, 2));
  } else {
    console.log("语料基准（" + base.n + " 条）");
    console.log("-".repeat(40));
    for (const m of METRICS) console.log(("  " + m.label).padEnd(20) + String(base[m.id] + "%").padStart(6));
    for (const r of RED_LINES) console.log(("  " + r.label).padEnd(20) + String(base[r.id] + "%").padStart(6));
    console.log("\n加 --battery <file> 可以跑完整审计");
  }
  process.exit(0);
}

// ---------- 调用 OpenClaw 生成 ----------
function openclawBin() {
  const name = platform() === "win32" ? "openclaw.cmd" : "openclaw";
  const winPath = join(homedir(), "AppData", "Roaming", "npm", name);
  return platform() === "win32" ? winPath : name;
}

function ask(prompt) {
  const args = ["agent", "--session-key", sessionKey, "--thinking", thinking, "-m", prompt];
  if (model) args.push("--model", model);
  try {
    const out = execFileSync(
      platform() === "win32" ? "cmd.exe" : openclawBin(),
      platform() === "win32" ? ["/c", openclawBin(), ...args] : args,
      { encoding: "utf8", timeout: 180000, windowsHide: true }
    );
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    return lines[lines.length - 1] || "";
  } catch (e) {
    return "(调用失败: " + String(e.message).slice(0, 60) + ")";
  }
}

const battery = loadBattery(batteryPath);
const results = [];
for (const item of battery) {
  for (let i = 0; i < maxPerPrompt; i++) {
    const reply = ask(item.prompt);
    const flags = [];
    for (const r of RED_LINES) if (r.pattern.test(reply)) flags.push(r.label);
    results.push({ prompt: item.prompt, tag: item.tag, reply, flags });
  }
}

const gen = results.map(r => r.reply).filter(Boolean);
const got = stats(gen);

// ---------- 对比输出 ----------
const rows = [];
let failed = 0;
for (const m of METRICS) {
  const diff = Math.abs(got[m.id] - base[m.id]);
  const ok = diff <= m.tol;
  if (!ok) failed++;
  rows.push({ label: m.label, base: base[m.id], got: got[m.id], ok, diff });
}
for (const r of RED_LINES) {
  const bad = got[r.id] > 0;
  if (bad) failed++;
  rows.push({ label: r.label, base: base[r.id], got: got[r.id], ok: !bad, diff: got[r.id] - base[r.id] });
}

if (asJson) {
  console.log(JSON.stringify({ mode: "full", corpus: base, generated: got, rows, results,
    failed, passed: failed === 0 }, null, 2));
} else {
  console.log("人格审计");
  console.log("  语料 " + base.n + " 条   生成 " + got.n + " 条   题库 " + battery.length + " 题\n");
  console.log("指标".padEnd(16) + "真实".padStart(6) + "生成".padStart(6) + "差值".padStart(8) + "  判定");
  console.log("-".repeat(48));
  for (const r of rows) {
    const d = (r.diff > 0 ? "+" : "") + r.diff + "%";
    console.log(r.label.padEnd(16) + (r.base + "%").padStart(6) + (r.got + "%").padStart(6) + d.padStart(8) + "  " + (r.ok ? "✓" : "⚠ 超标"));
  }
  console.log("\n明细");
  for (const r of results) {
    console.log("[" + r.tag + "] 你：" + r.prompt);
    console.log("        她：" + r.reply.replace(/\s+/g, " ") + (r.flags.length ? "   ⚠ " + r.flags.join("/") : ""));
  }
  console.log("\n超标 " + failed + " 项 / 共 " + rows.length + " 项");
}

const reportPath = get("--out");
if (reportPath) {
  writeFileSync(reportPath, JSON.stringify({ corpus: base, generated: got, rows, results }, null, 2), "utf8");
  if (!asJson) console.log("报告已写入 " + reportPath);
}

process.exit(failed > 0 ? 1 : 0);
