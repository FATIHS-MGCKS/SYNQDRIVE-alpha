#!/usr/bin/env bash
# REMOVED: tar-stream delegate retired (DSRG R4). Use vo5c-cloud-agent-pinned-deploy-bootstrap.sh on VPS.
set -euo pipefail
echo "ABORT: cloud-agent-vo5c-remote-pinned-deploy.sh (tar-stream) is retired. Install ${CLOUD_AGENT_VO5C_BOOTSTRAP_PATH:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh} on the VPS." >&2
exit 46
