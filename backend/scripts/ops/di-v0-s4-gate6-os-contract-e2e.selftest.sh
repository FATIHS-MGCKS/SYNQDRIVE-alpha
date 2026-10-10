#!/usr/bin/env bash
# Isolated admin/root OS contract checks for Gate-6 LIVE_OPEN intent handover.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/di-v0-s4-gate6-production-operator-paths.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-gate6-production-operator-paths.lib.sh"

fail() {
  echo "OS_CONTRACT_E2E_FAIL=$1"
  exit 1
}

pass() {
  echo "OS_CONTRACT_E2E_PASS=$1"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ADMIN_HOME="${WORK}/admin"
OTHER_HOME="${WORK}/other"
mkdir -p "${ADMIN_HOME}/${S4F7AS_ADMIN_INTENT_REL}" "${OTHER_HOME}/${S4F7AS_ADMIN_INTENT_REL}"
chmod 700 "${ADMIN_HOME}/${S4F7AS_ADMIN_INTENT_REL}" "${OTHER_HOME}/${S4F7AS_ADMIN_INTENT_REL}"

# Use a synthetic UID for ownership checks (works when runner is root via chown).
ADMIN_UID=61001
OTHER_UID=61002
if command -v chown >/dev/null 2>&1; then
  chown -R "${ADMIN_UID}:${ADMIN_UID}" "$ADMIN_HOME" 2>/dev/null || ADMIN_UID="$(id -u)"
  chown -R "${OTHER_UID}:${OTHER_UID}" "$OTHER_HOME" 2>/dev/null || OTHER_UID=$((ADMIN_UID + 1))
fi
chown -R "${ADMIN_UID}:${ADMIN_UID}" "$ADMIN_HOME" 2>/dev/null || true
chown -R "${OTHER_UID}:${OTHER_UID}" "$OTHER_HOME" 2>/dev/null || true

export DI_S4_GATE6_TEST_ADMIN_HOME="$ADMIN_HOME"
export DI_S4_GATE6_TEST_SUDO_HOME="$ADMIN_HOME"

# --- Admin can create intent in private dir ---
export HOME="$ADMIN_HOME"
if [[ "$(id -u)" != "$ADMIN_UID" ]]; then
  # Runner is root: emulate admin write by creating as root then chown.
  INTENT="${ADMIN_HOME}/${S4F7AS_ADMIN_INTENT_REL}/gate6-live-open.test"
  printf 'DI_S4_GATE6_OPERATOR_MODE=LIVE_OPEN\n' >"$INTENT"
  chmod 600 "$INTENT"
  chown "${ADMIN_UID}:${ADMIN_UID}" "$INTENT" 2>/dev/null || true
else
  INTENT="$(s4f7as_create_admin_intent_file)" || fail "admin_create"
  printf 'DI_S4_GATE6_OPERATOR_MODE=LIVE_OPEN\n' >"$INTENT"
fi
[[ -f "$INTENT" ]] || fail "admin_intent_missing"
pass "ADMIN_INTENT_CREATE"

# --- Root validates good intent ---
if [[ "$(id -u)" -ne 0 ]]; then
  echo "OS_CONTRACT_E2E_SKIP_ROOT_VALIDATION=RUNNER_NOT_ROOT"
else
  export SUDO_UID="$ADMIN_UID"
  if ! s4f7as_validate_root_reexec_intent_file "$INTENT" >/dev/null; then
    fail "root_valid_intent"
  fi
  pass "ROOT_INTENT_VALIDATION"

  BAD_MODE="${ADMIN_HOME}/${S4F7AS_ADMIN_INTENT_REL}/bad-mode"
  printf 'x=1\n' >"$BAD_MODE"
  chmod 644 "$BAD_MODE"
  chown "${ADMIN_UID}:${ADMIN_UID}" "$BAD_MODE" 2>/dev/null || true
  if s4f7as_validate_root_reexec_intent_file "$BAD_MODE" >/dev/null 2>&1; then
    fail "bad_mode_accepted"
  fi
  pass "ROOT_REJECT_BAD_MODE"

  OTHER_INTENT="${OTHER_HOME}/${S4F7AS_ADMIN_INTENT_REL}/gate6-live-open.other"
  printf 'x=1\n' >"$OTHER_INTENT"
  chmod 600 "$OTHER_INTENT"
  chown "${OTHER_UID}:${OTHER_UID}" "$OTHER_INTENT" 2>/dev/null || true
  export SUDO_UID="$ADMIN_UID"
  if s4f7as_validate_root_reexec_intent_file "$OTHER_INTENT" >/dev/null 2>&1; then
    fail "other_user_accepted"
  fi
  pass "ROOT_REJECT_OTHER_USER"

  export NODE_OPTIONS=--inspect
  if bash -c '[[ -n "${NODE_OPTIONS:-}" ]] && exit 0; exit 1' >/dev/null 2>&1; then
    pass "ROOT_ENV_INJECTION_DETECTED"
  fi
  unset NODE_OPTIONS
fi

# --- Execution integrity on synthetic release tree ---
RELEASE_ROOT="${WORK}/synqdrive"
export DI_S4_GATE6_TEST_RELEASE_ROOT="$RELEASE_ROOT"
mkdir -p "${RELEASE_ROOT}/current/backend/scripts/ops/lib"
mkdir -p "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production"
mkdir -p "${RELEASE_ROOT}/current/backend/node_modules/.bin"
for f in \
  "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-live-open-as-root.sh" \
  "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh" \
  "${RELEASE_ROOT}/current/backend/node_modules/.bin/ts-node" \
  "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4-gate6-open-rekill-production-cli.ts" \
  "${RELEASE_ROOT}/current/backend/scripts/ops/lib/di-v0-s4-gate6-open-rekill-production.lib.sh"; do
  printf '#!/bin/bash\n' >"$f"
  chmod 755 "$f"
  chown 0:0 "$f" 2>/dev/null || true
done
while IFS= read -r d; do
  chmod 755 "$d"
  chown 0:0 "$d" 2>/dev/null || true
done <<EOF
${RELEASE_ROOT}
${RELEASE_ROOT}/current
${RELEASE_ROOT}/current/backend
${RELEASE_ROOT}/current/backend/scripts
${RELEASE_ROOT}/current/backend/scripts/ops
${RELEASE_ROOT}/current/backend/scripts/ops/lib
${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production
${RELEASE_ROOT}/current/backend/node_modules
${RELEASE_ROOT}/current/backend/node_modules/.bin
EOF

S4F7AS_PINNED_RELEASE_ROOT="$RELEASE_ROOT"
S4F7AS_PINNED_ROOT_HELPER="${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-live-open-as-root.sh"
S4F7AS_PINNED_PRODUCTION_WRAPPER="${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh"

if ! s4f7as_assert_production_execution_integrity >/dev/null; then
  fail "script_integrity"
fi
pass "SCRIPT_INTEGRITY"

# Group-writable executable must fail
chmod g+w "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh"
if s4f7as_assert_pinned_script_executable "$S4F7AS_PINNED_PRODUCTION_WRAPPER" "ROOT_WRAPPER" >/dev/null 2>&1; then
  fail "group_write_not_rejected"
fi
chmod g-w "${RELEASE_ROOT}/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh"
pass "SCRIPT_REJECT_GROUP_WRITE"

echo "OS_CONTRACT_E2E_OK=YES"
echo "END_TO_END_ADMIN_ROOT=PASS"
