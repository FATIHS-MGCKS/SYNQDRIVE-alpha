#!/usr/bin/env bash
# Fail when legacy surface classes appear outside the allowlist.
# Allowlist shrinks to zero as rollout completes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLOWLIST="${ROOT}/scripts/surface-legacy-allowlist.txt"

PATTERN='bg-card|sq-card(?!-)|sq-glass'
SCAN=(
  "$ROOT/src/rental"
  "$ROOT/src/operator"
  "$ROOT/src/master"
  "$ROOT/src/components"
  "$ROOT/src/pages"
)

hits=()
while IFS= read -r file; do
  rel="${file#"$ROOT"/}"
  if [[ -f "$ALLOWLIST" ]] && grep -qxF "$rel" "$ALLOWLIST" 2>/dev/null; then
    continue
  fi
  hits+=("$rel")
done < <(rg -l "$PATTERN" "${SCAN[@]}" --glob '*.{ts,tsx}' \
  --glob '!**/ui/card.tsx' \
  --glob '!**/ui/alert.tsx' \
  --glob '!**/ui/switch.tsx' \
  2>/dev/null || true)

if ((${#hits[@]} > 0)); then
  echo "Legacy surface classes found outside allowlist (${#hits[@]} files):"
  printf '  %s\n' "${hits[@]}"
  exit 1
fi

echo "surface-legacy check passed"
