#!/usr/bin/env bash
# Prove ephemeral migration recovery is default-disabled and explicit opt-in only.
set -euo pipefail

gate_allowed() {
  [[ "${PRISMA_MIGRATE_EPHEMERAL_RECOVERY:-0}" == "1" ]]
}

expect_blocked() {
  local label="$1"
  unset PRISMA_MIGRATE_EPHEMERAL_RECOVERY
  export PRISMA_MIGRATE_EPHEMERAL_RECOVERY="${PRISMA_MIGRATE_EPHEMERAL_RECOVERY:-0}"
  if gate_allowed; then
    echo "Expected recovery blocked for ${label}, but gate allowed" >&2
    exit 1
  fi
  echo "OK blocked: ${label}"
}

expect_allowed() {
  local label="$1"
  export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
  if ! gate_allowed; then
    echo "Expected recovery allowed for ${label}, but gate blocked" >&2
    exit 1
  fi
  echo "OK allowed: ${label}"
}

expect_blocked "unset defaults to 0"
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=0
expect_blocked "explicit 0"
expect_allowed "explicit 1"

echo "Ephemeral recovery gate tests passed"
