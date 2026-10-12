#!/usr/bin/env bash
# Cloud Agent ↔ VPS pinned bootstrap contract (paths and exit codes only).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

CLOUD_AGENT_VO5C_BOOTSTRAP_PATH="${CLOUD_AGENT_VO5C_BOOTSTRAP_PATH:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh}"
CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_MISSING=44
CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_INTEGRITY=45
CLOUD_AGENT_REMOTE_EXIT_MISSING_AUTH=42
