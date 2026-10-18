#!/usr/bin/env bash
# One-time verified install of guard bundle onto the CURRENT VPS executor tree (no app deploy).
set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${OPS_DIR}/../../.." && pwd)"
MANIFEST_SHA="${OPS_DIR}/contracts/production-database-guard-bundle.manifest.sha256"
TARGET_OPS="${1:-/opt/synqdrive/current/backend/scripts/ops}"
SOURCE_OPS="${SYNQDRIVE_GUARD_BUNDLE_SOURCE_OPS:-$OPS_DIR}"

if [[ "${SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED:-}" != "1" ]]; then
  echo "!! ABORT: SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1 required (owner GO)" >&2
  exit 41
fi
[[ -f "$MANIFEST_SHA" ]] || { echo "!! ABORT: missing ${MANIFEST_SHA}" >&2; exit 1; }
[[ -d "$TARGET_OPS" ]] || { echo "!! ABORT: target ops dir missing: ${TARGET_OPS}" >&2; exit 1; }

echo "==> Verifying guard bundle manifest"
while read -r line; do
  [[ -z "$line" ]] && continue
  hash="${line%%  *}"
  rel="${line#*  }"
  src="${REPO_ROOT}/${rel}"
  [[ -f "$src" ]] || { echo "!! ABORT: bundle file missing: ${rel}" >&2; exit 1; }
  actual="$(sha256sum "$src" | awk '{print $1}')"
  if [[ "$actual" != "$hash" ]]; then
    echo "!! ABORT: hash mismatch ${rel}" >&2
    exit 1
  fi
done < "$MANIFEST_SHA"

echo "==> Installing verified guard bundle into ${TARGET_OPS}"
while read -r line; do
  [[ -z "$line" ]] && continue
  rel="${line#*  }"
  case "$rel" in
    backend/scripts/ops/*)
      src="${REPO_ROOT}/${rel}"
      dest="${TARGET_OPS}/${rel#backend/scripts/ops/}"
      ;;
    backend/scripts/test/prisma-migrate-deploy-resilient.sh|backend/scripts/test/production-database-guard-postgres-gate.sh|backend/scripts/test/verify-destructive-prisma-entrypoints.sh|backend/scripts/test/verify-unguarded-prisma-invocations.sh)
      src="${REPO_ROOT}/${rel}"
      dest="/opt/synqdrive/current/${rel#backend/}"
      ;;
    *)
      continue
      ;;
  esac
  mkdir -p "$(dirname "$dest")"
  install -m 0644 "$src" "$dest"
  echo "installed ${dest}"
done < "$MANIFEST_SHA"

echo "==> Guard bundle install complete (no deploy performed)"
