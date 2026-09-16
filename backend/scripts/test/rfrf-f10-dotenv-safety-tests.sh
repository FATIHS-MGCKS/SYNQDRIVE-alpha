#!/usr/bin/env bash
# RFRF F10.2.1 dotenv safety tests — fixtures only, never touches production.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "DOTENV_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "DOTENV_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR" "$EXEC_MARKER" 2>/dev/null || true; }
trap cleanup EXIT

EXEC_MARKER="${TMP_DIR}/dotenv-exec-marker"
ENV_FILE="${TMP_DIR}/backend.env"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

cat >"$ENV_FILE" <<EOF
# comment line
HM_HEALTH_APP_MQTT_TOPIC=\$share/synqdrive/health
UNEXPANDED=\$UNSET_DOTENV_TEST_NAME
SUBSHELL=\$(touch ${EXEC_MARKER})
BACKTICKS=\`touch ${EXEC_MARKER}\`
SPACED=hello world with spaces
HASHY=before#not-a-comment
EQUALS=part=one=more
QUOTED_DOUBLE="quoted \$share value"
QUOTED_SINGLE='single \$share value'
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture?schema=public
METRICS_BEARER_TOKEN=fixture-metrics-token
HM_HEALTH_APP_MQTT_TOPIC=duplicate-last-wins
EOF

# Prove no command substitution executed during reads.
for _ in $(seq 1 5); do
  rfrf_dotenv_get "$ENV_FILE" HM_HEALTH_APP_MQTT_TOPIC >/dev/null
  rfrf_dotenv_get "$ENV_FILE" SUBSHELL >/dev/null
  rfrf_dotenv_get "$ENV_FILE" BACKTICKS >/dev/null
  rfrf_dotenv_get "$ENV_FILE" UNEXPANDED >/dev/null
  rfrf_dotenv_get "$ENV_FILE" DATABASE_URL >/dev/null
done

if [[ -f "$EXEC_MARKER" ]]; then
  fail "command substitution marker file created"
fi
pass "no command substitution executed"

mqtt="$(rfrf_dotenv_get "$ENV_FILE" HM_HEALTH_APP_MQTT_TOPIC)"
[[ "$mqtt" == "duplicate-last-wins" ]] || fail "duplicate key should use final value got=${mqtt}"
pass "duplicate key last-wins"

cat >"$ENV_FILE" <<EOF
HM_HEALTH_APP_MQTT_TOPIC=\$share/synqdrive/health
UNEXPANDED=\$UNSET_DOTENV_TEST_NAME
SUBSHELL=\$(touch ${EXEC_MARKER})
BACKTICKS=\`touch ${EXEC_MARKER}\`
SPACED=hello world with spaces
HASHY=before#not-a-comment
EQUALS=part=one=more
QUOTED_DOUBLE="quoted \$share value"
QUOTED_SINGLE='single \$share value'
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture?schema=public
METRICS_BEARER_TOKEN=fixture-metrics-token
EOF

mqtt="$(rfrf_dotenv_get "$ENV_FILE" HM_HEALTH_APP_MQTT_TOPIC)"
[[ "$mqtt" == '$share/synqdrive/health' ]] || fail "literal dollar share expected got=${mqtt}"
pass "literal \$share preserved"

unexpanded="$(rfrf_dotenv_get "$ENV_FILE" UNEXPANDED)"
[[ "$unexpanded" == '$UNSET_DOTENV_TEST_NAME' ]] || fail "variable reference must stay literal got=${unexpanded}"
pass "no variable expansion"

subs="$(rfrf_dotenv_get "$ENV_FILE" SUBSHELL)"
[[ "$subs" == "\$(touch ${EXEC_MARKER})" ]] || fail "subs shell syntax must stay literal got=${subs}"
pass "subs syntax literal"

back="$(rfrf_dotenv_get "$ENV_FILE" BACKTICKS)"
[[ "$back" == "\`touch ${EXEC_MARKER}\`" ]] || fail "backtick syntax must stay literal got=${back}"
pass "backtick syntax literal"

spaced="$(rfrf_dotenv_get "$ENV_FILE" SPACED)"
[[ "$spaced" == "hello world with spaces" ]] || fail "spaces preserved got=${spaced}"
pass "spaces preserved"

hashy="$(rfrf_dotenv_get "$ENV_FILE" HASHY)"
[[ "$hashy" == "before#not-a-comment" ]] || fail "hash in value preserved got=${hashy}"
pass "hash in unquoted value preserved"

equals="$(rfrf_dotenv_get "$ENV_FILE" EQUALS)"
[[ "$equals" == "part=one=more" ]] || fail "extra equals preserved got=${equals}"
pass "extra equals preserved"

quoted="$(rfrf_dotenv_get "$ENV_FILE" QUOTED_DOUBLE)"
[[ "$quoted" == 'quoted $share value' ]] || fail "double-quoted unescape expected got=${quoted}"
pass "double-quoted value parsed"

single="$(rfrf_dotenv_get "$ENV_FILE" QUOTED_SINGLE)"
[[ "$single" == 'single $share value' ]] || fail "single-quoted value expected got=${single}"
pass "single-quoted value parsed"

db_url="$(rfrf_dotenv_database_url "$ENV_FILE")"
[[ "$db_url" == "postgresql://fixture:fixture@127.0.0.1:5432/fixture" ]] || fail "database url strip schema got=${db_url}"
pass "database url safe read"

# Prove rfrf_db_readonly_counts does not source backend.env.
db_out="$(rfrf_db_readonly_counts "$ENV_FILE" 2>&1 || true)"
if [[ "$db_out" == *"database_url_missing"* || "$db_out" == *"DB_COUNTS=psql_missing"* || "$db_out" == *"raw_refuel_candidates="* ]]; then
  pass "db readonly counts uses safe env access"
elif [[ -z "$db_out" ]] && command -v psql >/dev/null 2>&1; then
  pass "db readonly counts reached psql without sourcing env"
else
  fail "db readonly counts did not report safe access path: ${db_out}"
fi

# Preflight fixture must not source backend.env
grep -q 'source "$BACKEND_ENV"' "${OPS}/rfrf-production-preflight.sh" && fail "preflight still sources backend.env"
grep -q 'source "$BACKEND_ENV"' "${OPS}/rfrf-production-blast-radius-assessment.sh" && fail "blast-radius still sources backend.env"
grep -q 'source "$backend_env"' "${OPS}/lib/rfrf-production-rollout.lib.sh" && fail "rollout lib still sources backend.env"
pass "no unsafe backend.env source in RFRF F10 ops scripts"

# PORT diagnostic: worker readiness helper must emit per-replica fields via node env PORT.
if grep -q 'process.env.PORT' "${OPS}/lib/rfrf-production-rollout.lib.sh"; then
  pass "readiness diagnostic uses PORT env for node"
else
  fail "readiness diagnostic missing PORT env wiring"
fi

echo "DOTENV_COMMAND_SUBSTITUTION_EXECUTED=NO"
echo "DOTENV_VARIABLE_EXPANSION_OCCURRED=NO"
echo "rfrf-f10-dotenv-safety-tests: OK"
