#!/usr/bin/env bash
# Operator helper: write bootstrap manifest (run on VPS after copying shared install bundle from approved pin).
set -euo pipefail

BOOTSTRAP="${1:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh}"
VERIFY_LIB="${2:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh}"
MANIFEST="${3:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env}"
PIN_ROOT="${4:-}"
INSTALLED_FROM_COMMIT="${5:-}"

if [[ -z "$PIN_ROOT" || -z "$INSTALLED_FROM_COMMIT" ]]; then
  echo "usage: $0 [bootstrap_path] [verify_lib_path] [manifest_path] PIN_ROOT INSTALLED_FROM_COMMIT" >&2
  exit 1
fi
if [[ ! "$INSTALLED_FROM_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ABORT: INSTALLED_FROM_COMMIT must be 40-char hex" >&2
  exit 1
fi
for f in "$BOOTSTRAP" "$VERIFY_LIB"; do
  if [[ ! -f "$f" ]]; then
    echo "ABORT: missing file: $f" >&2
    exit 1
  fi
done

IMPL="${PIN_ROOT}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"
SESSION="${PIN_ROOT}/backend/scripts/ops/lib/vo5c-operator-deploy-session.lib.sh"
for f in "$IMPL" "$SESSION"; do
  [[ -f "$f" ]] || { echo "ABORT: pinned dependency missing: $f" >&2; exit 1; }
done

sha() { sha256sum "$1" | awk '{print $1}' | tr '[:upper:]' '[:lower:]'; }

BOOT_SHA="$(sha "$BOOTSTRAP")"
VERIFY_SHA="$(sha "$VERIFY_LIB")"
IMPL_SHA="$(sha "$IMPL")"
SESSION_SHA="$(sha "$SESSION")"
COMMIT="$(echo "$INSTALLED_FROM_COMMIT" | tr '[:upper:]' '[:lower:]')"

umask 077
cat >"$MANIFEST" <<EOF
VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256=${BOOT_SHA}
VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB_SHA256=${VERIFY_SHA}
VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALLED_FROM_COMMIT=${COMMIT}
VO5C_CLOUD_AGENT_PINNED_IMPL_SHA256=${IMPL_SHA}
VO5C_CLOUD_AGENT_PINNED_SESSION_LIB_SHA256=${SESSION_SHA}
VO5C_CLOUD_AGENT_BOOTSTRAP_VERSION=2
EOF
chmod 600 "$MANIFEST"
echo "Wrote manifest ${MANIFEST} (bootstrap=${BOOT_SHA:0:12}… impl=${IMPL_SHA:0:12}… commit=${COMMIT:0:12}…)"
