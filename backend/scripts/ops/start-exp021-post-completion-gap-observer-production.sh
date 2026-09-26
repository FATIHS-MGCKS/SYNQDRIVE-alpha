#!/usr/bin/env bash
# Start detached EXP-021 post-completion gap observer on production host (no PM2 backend restart).
set -euo pipefail

BACKEND_ROOT="${SYNQDRIVE_BACKEND_ROOT:-/opt/synqdrive/current/backend}"
OUTPUT_DIR="${EXP021_GAP_OBSERVER_OUTPUT_DIR:-/tmp/exp021-post-completion-gap-observer}"
PROCESS_NAME="exp021-post-completion-gap-observer"
LOG_FILE="${OUTPUT_DIR}/observer.log"
PID_FILE="${OUTPUT_DIR}/observer.pid"

mkdir -p "${OUTPUT_DIR}"

if [[ -f "${PID_FILE}" ]]; then
  old_pid="$(cat "${PID_FILE}")"
  if kill -0 "${old_pid}" 2>/dev/null; then
    echo "OBSERVER_ALREADY_RUNNING=YES"
    echo "OBSERVER_PID=${old_pid}"
    exit 0
  fi
fi

export SYNQDRIVE_BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
cd "${BACKEND_ROOT}"

nohup npm run exp021:post-completion-gap-observer >>"${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"

sleep 3
if kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "OBSERVER_PROCESS_NAME=${PROCESS_NAME}"
  echo "OBSERVER_PID=$(cat "${PID_FILE}")"
  echo "OUTPUT_DIRECTORY=${OUTPUT_DIR}"
  echo "OBSERVER_RUNNING=YES"
else
  echo "OBSERVER_RUNNING=NO"
  tail -n 40 "${LOG_FILE}" || true
  exit 1
fi
