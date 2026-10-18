#!/usr/bin/env bash
# Fail CI when ops/deploy paths invoke raw prisma migrate without guard wrapper.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
violations=0

while IFS= read -r line; do
  echo "UNGUARDED_PRISMA: $line"
  violations=$((violations + 1))
done < <(rg -n '\bnpx prisma (migrate|db push|db execute)' "${ROOT}/scripts/ops" \
  --glob '!**/prisma-cli-guard.mjs' --glob '!**/prisma-with-guard.sh' 2>/dev/null || true)

while IFS= read -r line; do
  echo "UNGUARDED_PRISMA: $line"
  violations=$((violations + 1))
done < <(rg -n '"prisma:migrate:(dev|deploy)": "prisma ' "${ROOT}/package.json" 2>/dev/null || true)

if [[ "$violations" -gt 0 ]]; then
  echo "!! verify-unguarded-prisma-invocations: ${violations} finding(s)" >&2
  exit 1
fi
echo "verify-unguarded-prisma-invocations: PASS"
