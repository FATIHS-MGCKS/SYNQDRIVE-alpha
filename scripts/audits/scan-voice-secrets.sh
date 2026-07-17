#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EXCLUDES=(
  '--glob' '!.env.example'
  '--glob' '!**/*.md'
  '--glob' '!**/node_modules/**'
  '--glob' '!**/dist/**'
  '--glob' '!**/.git/**'
  '--glob' '!**/scan-voice-secrets.sh'
  '--glob' '!**/scripts/ops/**'
)

PATTERNS=(
  'sk_live_[0-9a-zA-Z]{20,}'
  'sk_test_[0-9a-zA-Z]{20,}'
  'AC[0-9a-fA-F]{32}'
  '-----BEGIN (RSA |EC )?PRIVATE KEY-----'
)

echo "Scanning tracked workspace for likely voice/provider secrets..."
FOUND=0
for pattern in "${PATTERNS[@]}"; do
  if rg -n "${EXCLUDES[@]}" "$pattern" . >/tmp/voice-secret-scan.txt 2>/dev/null; then
    echo "Pattern match: $pattern"
    cat /tmp/voice-secret-scan.txt
    FOUND=1
  fi
done

rm -f /tmp/voice-secret-scan.txt

if [[ "$FOUND" -ne 0 ]]; then
  echo "Voice secret scan failed."
  exit 1
fi

echo "Voice secret scan passed."
