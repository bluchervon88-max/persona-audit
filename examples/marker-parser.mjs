#!/usr/bin/env node
/**
 * 参考实现：把「动作标记」从聊天文本里抽出来。
 *
 * 用法：
 *   node examples/marker-parser.mjs "我刚看到个东西 [[表情包:无语]] 你猜是什么"
 *
 * 输出：
 *   { clean: "我刚看到个东西 你猜是什么", extras: [{ kind: "sticker", args: ["无语"] }] }
 *
 * 设计约束（很重要）：
 *   1. 解析失败一律降级成纯文本，绝不抛错
 *   2. 标记可以出现在任何位置，抽掉之后段落之间保留一个空格
 *   3. 顺序要保持（先说话，后动作由调用方负责）
 */

const MARKERS = [
  { re: /\[\[表情包[:：]([^\]]+)\]\]/g, kind: "sticker" },
  { re: /\[\[小黄脸[:：](\d+)\]\]/g, kind: "face" },
  { re: /\[\[戳一戳\]\]/g, kind: "poke" },
  { re: /\[\[语音[:：]([^\]|]+)\|([^\]]*)\]\]/g, kind: "voice" },
];

export function extractMarkers(text) {
  if (typeof text !== "string" || !text.includes("[[")) {
    return { clean: text ?? "", extras: [] };
  }

  const extras = [];
  let clean = text;

  for (const { re, kind } of MARKERS) {
    clean = clean.replace(re, (...groups) => {
      // groups: [match, g1, g2, offset, string]
      const args = groups.slice(1, -2).map((v) => (v ?? "").trim());
      extras.push({ kind, args });
      return " ";
    });
  }

  return {
    clean: clean.replace(/[ \t]{2,}/g, " ").trim(),
    extras,
  };
}

// --- 小自测：node examples/marker-parser.mjs --test ---
if (process.argv[2] === "--test") {
  const cases = [
    ["[[戳一戳]]", { clean: "", extras: [{ kind: "poke", args: [] }] }],
    ["无语 [[表情包:无语]]", { clean: "无语", extras: [{ kind: "sticker", args: ["无语"] }] }],
    ["[[语音:你干嘛呢|tired]] 快点", { clean: "快点", extras: [{ kind: "voice", args: ["你干嘛呢", "tired"] }] }],
    ["[[没写完", { clean: "[[没写完", extras: [] }],
  ];
  let ok = true;
  for (const [input, expected] of cases) {
    const got = extractMarkers(input);
    const pass = JSON.stringify(got) === JSON.stringify(expected);
    ok &&= pass;
    console.log(pass ? "✓" : "✗", input, pass ? "" : JSON.stringify(got));
  }
  process.exit(ok ? 0 : 1);
} else if (process.argv.length > 2) {
  console.log(JSON.stringify(extractMarkers(process.argv.slice(2).join(" ")), null, 2));
}
