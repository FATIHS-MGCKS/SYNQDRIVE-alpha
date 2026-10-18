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
REQUIRED_SHA="${SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA:-}"
if [[ -z "$REQUIRED_SHA" ]]; then
  echo "!! ABORT: SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA must pin the verified git commit" >&2
  exit 41
fi
ACTUAL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
if [[ "$ACTUAL_SHA" != "$REQUIRED_SHA" ]]; then
  echo "!! ABORT: bundle source SHA ${ACTUAL_SHA:-unknown} != required ${REQUIRED_SHA}" >&2
  exit 41
fi
[[ -f "$MANIFEST_SHA" ]] || { echo "!! ABORT: missing ${MANIFEST_SHA}" >&2; exit 1; }
[[ -d "$TARGET_OPS" ]] || { echo "!! ABORT: target ops dir missing: ${TARGET_OPS}" >&2; exit 1; }
echo "==> Guard bundle SHA pin verified: ${REQUIRED_SHA:0:12}"

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
    backend/package.json)
      src="${REPO_ROOT}/${rel}"
      dest="$(dirname "$(dirname "$TARGET_OPS")")/package.json"
      ;;
    backend/scripts/test/*)
      src="${REPO_ROOT}/${rel}"
      if [[ "$TARGET_OPS" == /opt/synqdrive/current/* ]]; then
        dest="/opt/synqdrive/current/${rel#backend/}"
      else
        dest="$(dirname "$(dirname "$TARGET_OPS")")/scripts/test/${rel#backend/scripts/test/}"
      fi
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
