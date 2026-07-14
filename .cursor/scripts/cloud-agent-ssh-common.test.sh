#!/usr/bin/env bash
# Unit tests for cloud-agent-ssh-common.sh (no secrets logged).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

assert_key_parseable() {
  local key_file="$1"
  local label="$2"
  local lines
  lines="$(wc -l < "$key_file")"
  if [[ "$lines" -lt 3 ]]; then
    fail "$label: expected multi-line PEM, got ${lines} line(s)"
  fi
  if ! ssh-keygen -y -f "$key_file" >/dev/null 2>&1; then
    fail "$label: ssh-keygen could not parse key"
  fi
  pass "$label"
}

echo "==> Generating ephemeral ed25519 test key"
ssh-keygen -t ed25519 -f "${TMPDIR}/fixture" -N "" -q
FIXTURE_PEM="$(cat "${TMPDIR}/fixture")"
FIXTURE_BODY="$(cloud_agent_openssh_pem_body "$FIXTURE_PEM")"
FIXTURE_SINGLE_LINE="-----BEGIN OPENSSH PRIVATE KEY-----${FIXTURE_BODY}-----END OPENSSH PRIVATE KEY-----"

echo "==> bare base64 (Option B)"
CLOUD_AGENT_SSH_PRIVATE_KEY="$FIXTURE_BODY"
cloud_agent_materialize_ssh_key "${TMPDIR}/bare"
assert_key_parseable "${TMPDIR}/bare" "bare base64"

echo "==> single-line PEM"
CLOUD_AGENT_SSH_PRIVATE_KEY="$FIXTURE_SINGLE_LINE"
cloud_agent_materialize_ssh_key "${TMPDIR}/single"
assert_key_parseable "${TMPDIR}/single" "single-line PEM"

echo "==> multi-line PEM"
CLOUD_AGENT_SSH_PRIVATE_KEY="$FIXTURE_PEM"
cloud_agent_materialize_ssh_key "${TMPDIR}/multi"
assert_key_parseable "${TMPDIR}/multi" "multi-line PEM"

echo "==> cloud_agent_ssh_user trims whitespace"
CLOUD_AGENT_SSH_USER=$' root \n'
[[ "$(cloud_agent_ssh_user)" == "root" ]] || fail "ssh user trim"
pass "ssh user trim"

if [[ -n "${CLOUD_AGENT_SSH_PRIVATE_KEY:-}" ]]; then
  echo "==> live secret from environment"
  LIVE_KEY="${TMPDIR}/live"
  cloud_agent_materialize_ssh_key "$LIVE_KEY"
  assert_key_parseable "$LIVE_KEY" "live CLOUD_AGENT_SSH_PRIVATE_KEY"
else
  echo "SKIP: live secret (CLOUD_AGENT_SSH_PRIVATE_KEY not set)"
fi

echo "All cloud-agent-ssh-common tests passed."
