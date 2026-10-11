#!/usr/bin/env bash
# READ-ONLY: aggregate nginx POST /api/v1/webhooks/dimo by UTC calendar day and HTTP status.
# Usage (on VPS): sudo bash r22-nginx-dimo-webhook-aggregate.sh [YYYY-MM-DD]
set -euo pipefail
DAY_FILTER="${1:-}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
for f in /var/log/nginx/access.log /var/log/nginx/access.log.*; do
  [[ -e "$f" ]] || continue
  zgrep -h 'POST.*webhooks/dimo' "$f" 2>/dev/null || true
done >"$TMP"
if [[ -n "$DAY_FILTER" ]]; then
  # nginx date token: [DD/Mon/YYYY: — map 2026-10-09 -> 09/Oct/2026:
  DD="${DAY_FILTER:8:2}"
  MON="$(date -d "$DAY_FILTER" +%b)"
  YYYY="${DAY_FILTER:0:4}"
  PAT="${DD}/${MON}/${YYYY}:"
  grep "$PAT" "$TMP" >"${TMP}.day" || true
  mv "${TMP}.day" "$TMP"
fi
TOTAL="$(wc -l <"$TMP" | tr -d ' ')"
echo "total_post_lines=$TOTAL"
awk '{print $9}' "$TMP" | sort | uniq -c | sort -rn | sed 's/^/status /'
