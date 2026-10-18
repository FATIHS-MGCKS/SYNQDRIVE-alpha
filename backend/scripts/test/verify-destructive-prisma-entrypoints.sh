#!/usr/bin/env bash
# CI grep gate: destructive Prisma usage in ops/deploy paths must go through guards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

violations=0

while IFS= read -r line; do
  echo "OPS_DESTRUCTIVE_PRISMA: $line"
  violations=$((violations + 1))
done < <(rg -n "prisma migrate reset|prisma migrate dev|db push --force-reset" "${ROOT}/scripts/ops" --glob '!**/prisma-cli-guard.mjs' 2>/dev/null || true)

if rg -n '"prisma:migrate:(dev|deploy)": "prisma ' package.json >/dev/null 2>&1; then
  echo "PACKAGE_JSON_UNGUARDED_PRISMA_MIGRATE"
  violations=$((violations + 1))
fi

if [[ "$violations" -gt 0 ]]; then
  echo "!! verify-destructive-prisma-entrypoints: ${violations} finding(s)" >&2
  exit 1
fi

echo "verify-destructive-prisma-entrypoints: PASS"
