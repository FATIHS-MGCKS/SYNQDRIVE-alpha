#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO="$(cd "${ROOT}/.." && pwd)"
MANIFEST="${ROOT}/scripts/ops/contracts/production-database-guard-bundle.manifest"
LIST="${MANIFEST%.manifest}"
tmp="$(mktemp)"
grep -v '^#' "$MANIFEST" | grep -v '^$' | while read -r rel; do
  [[ -f "${REPO}/${rel}" ]] || { echo "missing ${rel}" >&2; exit 1; }
  sha256sum "${REPO}/${rel}" | awk -v p="$rel" '{print $1"  "p}'
done > "$tmp"
mv "$tmp" "${LIST}.sha256"
echo "Wrote ${LIST}.sha256"
