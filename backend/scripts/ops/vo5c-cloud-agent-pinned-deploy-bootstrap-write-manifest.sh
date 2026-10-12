#!/usr/bin/env bash
# Operator helper: write bootstrap manifest (run on VPS after copying bootstrap from approved pin).
set -euo pipefail

BOOTSTRAP="${1:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh}"
MANIFEST="${2:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env}"
INSTALLED_FROM_COMMIT="${3:-}"

if [[ -z "$INSTALLED_FROM_COMMIT" ]]; then
  echo "usage: $0 [bootstrap_path] [manifest_path] INSTALLED_FROM_COMMIT" >&2
  exit 1
fi
if [[ ! "$INSTALLED_FROM_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ABORT: INSTALLED_FROM_COMMIT must be 40-char hex" >&2
  exit 1
fi
if [[ ! -f "$BOOTSTRAP" ]]; then
  echo "ABORT: bootstrap file missing: $BOOTSTRAP" >&2
  exit 1
fi

SHA256="$(sha256sum "$BOOTSTRAP" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')"
umask 077
cat >"$MANIFEST" <<EOF
VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256=${SHA256}
VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALLED_FROM_COMMIT=${INSTALLED_FROM_COMMIT,,}
VO5C_CLOUD_AGENT_BOOTSTRAP_VERSION=1
EOF
chmod 600 "$MANIFEST"
echo "Wrote manifest ${MANIFEST} for bootstrap SHA256=${SHA256:0:12}... commit=${INSTALLED_FROM_COMMIT:0:12}..."
