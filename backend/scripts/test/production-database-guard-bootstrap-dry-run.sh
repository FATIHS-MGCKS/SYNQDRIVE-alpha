#!/usr/bin/env bash
# Prove SHA-pinned bundle bootstrap enables guard before backup/migrate (no VPS mutation).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO="$(cd "${ROOT}/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OLD_SHA="${SYNQDRIVE_GUARD_BOOTSTRAP_OLD_EXECUTOR_SHA:-d43ff4500000000000000000000000000000000}"
if ! git -C "$REPO" cat-file -e "${OLD_SHA}^{commit}" 2>/dev/null; then
  OLD_SHA="560d5667b5784b9eead336ccb961024059145ff0"
fi
REQUIRED_SHA="$(git -C "$REPO" rev-parse HEAD)"

mkdir -p "${TMP}/executor/backend/scripts/ops" "${TMP}/executor/backend"
git -C "$REPO" show "${OLD_SHA}:backend/scripts/ops/vps-deploy-release.sh" > "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh" 2>/dev/null || \
  cp "${ROOT}/scripts/ops/vps-deploy-release.sh" "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh"

if grep -q 'vps_run_production_db_preflight ""' "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh" && \
   grep -q 'Pre-deploy production database identity preflight' "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh"; then
  echo "SKIP: OLD_SHA already contains guard preflight — using synthetic unguarded fixture"
  sed '/vps_run_production_db_preflight/d;/production database identity preflight/d' \
    "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh" > "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh"
fi

if grep -q 'Pre-deploy production database identity preflight' "${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh"; then
  echo "!! FAIL: unguarded executor fixture still contains preflight hook" >&2
  exit 1
fi

export SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1
export SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA="$REQUIRED_SHA"
bash "${ROOT}/scripts/ops/vps-production-database-guard-install-verified-bundle.sh" "${TMP}/executor/backend/scripts/ops"

NEW_DEPLOY="${TMP}/executor/backend/scripts/ops/vps-deploy-release.sh"
grep -q 'vps_run_production_db_preflight ""' "$NEW_DEPLOY" || { echo "!! FAIL: bootstrap missing live preflight" >&2; exit 1; }
grep -q 'pdb_guard_write_backup_capture_sidecar' "$NEW_DEPLOY" || { echo "!! FAIL: bootstrap missing backup capture" >&2; exit 1; }
line_pf="$(grep -n 'vps_run_production_db_preflight ""' "$NEW_DEPLOY" | head -1 | cut -d: -f1)"
line_bk="$(grep -n 'Pre-deploy DB backup' "$NEW_DEPLOY" | head -1 | cut -d: -f1)"
if [[ -z "$line_pf" || -z "$line_bk" || "$line_pf" -ge "$line_bk" ]]; then
  echo "!! FAIL: preflight must run before backup (pf=${line_pf} backup=${line_bk})" >&2
  exit 1
fi

[[ -f "${TMP}/executor/backend/package.json" ]] || cp "${ROOT}/package.json" "${TMP}/executor/backend/package.json"
grep -q 'prisma-cli-guard' "${TMP}/executor/backend/package.json" || {
  install -m 0644 "${ROOT}/package.json" "${TMP}/executor/backend/package.json"
}

echo "production-database-guard-bootstrap-dry-run: PASS (required_sha=${REQUIRED_SHA:0:12})"
