#!/usr/bin/env bash
# 检查仓库里有没有意外混进来的个人数据 / 密钥
#
# 用法:
#   ./scripts/check-pii.sh                 # 用默认规则 + .pii-denylist.txt
#   ./scripts/check-pii.sh my-words.txt    # 额外指定一个词表
#
# 退出码: 0 = 干净， 1 = 命中
set -uo pipefail

DENYLIST=".pii-denylist.txt"
EXTRA="${1:-}"
fail=0

# 通用危险模式：凭证、真实 IM id、超长随机串
GENERIC=(
  'Bearer [A-Za-z0-9._-]{20,}'
  '[A-Za-z0-9]{32,}'                 # 长 hex / token 特征
  '[0-9]{6,}@im\.wechat'             # 真实微信 id
  'ou_[0-9a-f]{20,}'                  # 真实飞书 open_id
  'cli_[a-z0-9]{16,}'                 # 真实飞书 app id
  'AKIA[0-9A-Z]{16}'                  # AWS key
  'sk-[A-Za-z0-9]{20,}'               # OpenAI 风格 key
)

scan_file() {
  local pattern="$1" label="$2"
  local hits
  hits=$(git grep -nI -E "$pattern" -- . 2>/dev/null | grep -v 'check-pii.sh' || true)
  if [ -n "$hits" ]; then
    echo "⚠ 命中 [$label]:"
    echo "$hits" | head -5
    fail=1
  fi
}

echo "扫描通用密钥/标识模式…"
for p in "${GENERIC[@]}"; do
  scan_file "$p" "$p"
done

for list in "$DENYLIST" "$EXTRA"; do
  [ -f "$list" ] || continue
  echo "扫描词表 $list…"
  while IFS= read -r word; do
    [ -z "$word" ] && continue
    case "$word" in \#*) continue ;; esac
    scan_file "$word" "$word"
  done < "$list"
done

if [ "$fail" -eq 0 ]; then
  echo "✓ 没发现可疑内容"
  exit 0
else
  echo ""
  echo "✗ 发现可疑内容，请确认后再提交"
  exit 1
fi
