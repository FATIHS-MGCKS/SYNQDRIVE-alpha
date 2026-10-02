#!/usr/bin/env bash
# RFRF F10.2.2 metrics probe SIGPIPE/pipefail regression tests — fixtures only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "METRICS_PROBE_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "METRICS_PROBE_TEST_PASS: $*"; }

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

RFRF_METRIC='synqdrive_rfrf_branch_invocation_total'
PHYSICAL_METRIC='synqdrive_physical_refuel_recovery_backlog'
SIMILAR_METRIC='synqdrive_rfrf_branch_invocation_total_extra'

generate_large_payload() {
  local metric_line="$1" position="$2" pad_bytes="${3:-3145728}"
  local filler head tail
  filler="$(head -c "$pad_bytes" /dev/zero | tr '\0' 'x')"
  head="# HELP padding filler
# TYPE padding counter
padding_bytes ${pad_bytes}
"
  if [[ "$position" == "begin" ]]; then
    printf '%s\n%s\n%s' "$metric_line" "$head" "$filler"
  else
    printf '%s\n%s\n%s' "$head" "$filler" "$metric_line"
  fi
}

metric_line_rfrf="# HELP ${RFRF_METRIC} RFRF branch invocations
# TYPE ${RFRF_METRIC} counter
${RFRF_METRIC}{branch=\"native\"} 0"
metric_line_physical="# HELP ${PHYSICAL_METRIC} backlog
# TYPE ${PHYSICAL_METRIC} gauge
${PHYSICAL_METRIC} 0"

echo "OLD_PATTERN=echo \"\$body\" | grep -q METRIC"
echo "NEW_PATTERN=HELP/TYPE grep -Fq <<<\"\$body\" + line-prefix series scan (no pipe)"

body_end="$(generate_large_payload "$metric_line_rfrf" end)"
body_begin="$(generate_large_payload "$metric_line_rfrf" begin)"

set +e
echo "$body_begin" | grep -q "$RFRF_METRIC"
old_rc=$?
if echo "$body_begin" | grep -q "$RFRF_METRIC"; then
  old_if_result=pass
else
  old_if_result=fail
fi
set -e
echo "OLD_PATTERN_EXIT_CODE=${old_rc}"
echo "OLD_PATTERN_IF_RESULT=${old_if_result}"
if [[ "$old_rc" -eq 141 || "$old_if_result" == "fail" ]]; then
  pass "old pipeline pattern reproduces SIGPIPE/pipefail false negative"
  echo "PIPEFAIL_SIGPIPE_FALSE_NEGATIVE_REPRODUCED_ON_OLD_PATTERN=YES"
else
  fail "old pipeline pattern should reproduce pipefail false negative (rc=${old_rc} if=${old_if_result})"
fi

if rfrf_metrics_body_has_metric "$body_end" "$RFRF_METRIC"; then
  pass "new pattern metric at end"
  echo "NEW_PATTERN_SIGPIPE_SENSITIVE=NO"
else
  fail "new pattern failed metric at end"
fi

if rfrf_metrics_body_has_metric "$body_begin" "$RFRF_METRIC"; then
  pass "new pattern metric at begin"
else
  fail "new pattern failed metric at begin"
fi

if rfrf_metrics_body_has_metric "$body_begin" "$RFRF_METRIC"; then
  pass "large payload RFRF metric begin"
  echo "LARGE_PAYLOAD_RFRF_METRIC_BEGIN=PASS"
else
  fail "large payload RFRF metric begin"
fi

body_end_rfrf="$(generate_large_payload "$metric_line_rfrf" end)"
if rfrf_metrics_body_has_metric "$body_end_rfrf" "$RFRF_METRIC"; then
  pass "large payload RFRF metric end"
  echo "LARGE_PAYLOAD_RFRF_METRIC_END=PASS"
else
  fail "large payload RFRF metric end"
fi

body_begin_phys="$(generate_large_payload "$metric_line_physical" begin)"
if rfrf_metrics_body_has_metric "$body_begin_phys" "$PHYSICAL_METRIC"; then
  pass "large payload physical refuel begin"
  echo "LARGE_PAYLOAD_PHYSICAL_REFUEL_BEGIN=PASS"
else
  fail "large payload physical refuel begin"
fi

body_end_phys="$(generate_large_payload "$metric_line_physical" end)"
if rfrf_metrics_body_has_metric "$body_end_phys" "$PHYSICAL_METRIC"; then
  pass "large payload physical refuel end"
  echo "LARGE_PAYLOAD_PHYSICAL_REFUEL_END=PASS"
else
  fail "large payload physical refuel end"
fi

absent_body="$(generate_large_payload "# TYPE other counter
other_metric 1" end)"
if rfrf_metrics_body_has_metric "$absent_body" "$RFRF_METRIC"; then
  fail "absent metric should fail closed"
else
  pass "absent metric fail closed"
  echo "ABSENT_METRIC_FAIL_CLOSED=PASS"
fi

similar_body="$(generate_large_payload "# TYPE ${SIMILAR_METRIC} counter
${SIMILAR_METRIC} 1" begin)"
if rfrf_metrics_body_has_metric "$similar_body" "$RFRF_METRIC"; then
  fail "similar metric name must not match required RFRF metric"
else
  pass "similar metric name rejected"
fi

help_body="# HELP ${RFRF_METRIC} documented
# TYPE ${RFRF_METRIC} counter
${RFRF_METRIC} 0"
if rfrf_metrics_body_has_metric "$help_body" "$RFRF_METRIC"; then
  pass "metric in HELP/TYPE/series exposition matches fixed-string contract"
else
  fail "HELP/TYPE/series exposition should match"
fi

flake_count=0
repeat_body="$(generate_large_payload "$metric_line_rfrf" end)"
for _ in $(seq 1 50); do
  if ! rfrf_metrics_body_has_metric "$repeat_body" "$RFRF_METRIC"; then
    flake_count=$((flake_count + 1))
  fi
done
echo "REPEAT_50_FLAKE_COUNT=${flake_count}"
(( flake_count == 0 )) || fail "repeat 50 flake count=${flake_count}"
pass "repeat 50 stable"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

ENV_FILE="${TMP_DIR}/backend.env"
LARGE_OK="${TMP_DIR}/metrics-ok.txt"
LARGE_NO_RFRF="${TMP_DIR}/metrics-no-rfrf.txt"
metric_lines_ok="${metric_line_rfrf}
${metric_line_physical}"
generate_large_payload "$metric_lines_ok" end >"$LARGE_OK"
generate_large_payload "$metric_line_physical" end >"$LARGE_NO_RFRF"

cat >"$ENV_FILE" <<EOF
METRICS_BEARER_TOKEN=fixture-metrics-token
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture
EOF

curl() {
  if [[ "$*" == *"/api/v1/metrics"* ]]; then
    case "$*" in
      *":3001/"*) cat "$LARGE_OK"; return 0 ;;
      *":3002/"*) cat "$LARGE_OK"; return 0 ;;
      *":3998/"*) cat "$LARGE_NO_RFRF"; return 0 ;;
      *":3999/"*) return 22 ;;
    esac
  fi
  command curl "$@"
}

if out="$(rfrf_metrics_probe "$ENV_FILE" 3001 2>&1)"; then
  [[ "$out" == *"METRICS_3001_RFRF=YES"* ]] || fail "probe large ok missing RFRF yes: ${out}"
  [[ "$out" == *"METRICS_3001_PHYSICAL_REFUEL=YES"* ]] || fail "probe large ok missing physical yes: ${out}"
  pass "real probe large body with metrics"
else
  fail "real probe large body should pass: ${out}"
fi

set +e
out="$(rfrf_metrics_probe "$ENV_FILE" 3998 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "probe missing RFRF should fail"
[[ "$out" == *"METRICS_3998_RFRF=NO"* ]] || fail "probe missing RFRF output: ${out}"
pass "real probe missing RFRF metric fail closed"

curl() { return 22; }
set +e
out="$(rfrf_metrics_probe "$ENV_FILE" 3999 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "unreachable should fail"
[[ "$out" == *"METRICS_3999=unreachable"* ]] || fail "unreachable output: ${out}"
pass "real probe unreachable fail closed"

unset -f curl
cat >"$ENV_FILE" <<EOF
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture
EOF
set +e
out="$(rfrf_metrics_probe "$ENV_FILE" 3001 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "missing token should fail"
[[ "$out" == *"METRICS_3001=token_missing"* ]] || fail "token missing output: ${out}"
pass "real probe token missing fail closed"

grep -q 'rfrf_metrics_body_has_metric' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "helper missing"
! grep -q 'echo "$body" | grep -q' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "old echo pipe grep pattern remains"
! grep -q 'printf.*| grep -q' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "printf pipe grep pattern remains"

echo "REAL_METRICS_PROBE_FIXTURE_TEST=PASS"
echo "rfrf-f10-metrics-probe-regression: OK"
