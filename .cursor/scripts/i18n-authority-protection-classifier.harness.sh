#!/usr/bin/env bash
# Regression harness for i18n authority path classification.
# Extracts and executes the actual inline run script from
# .github/workflows/i18n-authority-protection.yml with mocked gh API responses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKFLOW="${REPO_ROOT}/.github/workflows/i18n-authority-protection.yml"

HARNESS_ROOT="${RUNNER_TEMP:-$(mktemp -d)}"
HARNESS_BIN="${HARNESS_ROOT}/bin"
mkdir -p "${HARNESS_BIN}"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=0

LAST_STDOUT=""
LAST_STDERR=""
LAST_EXIT_CODE=0
LAST_REASON=""
LAST_RESULT=""
HARNESS_LABEL_DELETE_INVOKED=false

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo "FAIL: $1" >&2
  exit 1
}

extract_workflow_run_script() {
  local source_workflow="$1"
  local output_script="$2"
  WORKFLOW_PATH="${source_workflow}" OUTPUT_SCRIPT="${output_script}" python3 - <<'PY'
import os
import yaml

workflow_path = os.environ["WORKFLOW_PATH"]
output_script = os.environ["OUTPUT_SCRIPT"]

with open(workflow_path, encoding="utf-8") as handle:
    workflow = yaml.safe_load(handle)

script = workflow["jobs"]["i18n-authority-protection"]["steps"][0]["run"]
if not isinstance(script, str) or not script.strip():
    raise SystemExit("workflow run script missing or empty")

with open(output_script, "w", encoding="utf-8") as handle:
    handle.write(script)
PY
}

build_files_json() {
  local -a paths=("$@")
  PATHS_JSON="$(python3 - "${paths[@]}" <<'PY'
import json
import sys

paths = sys.argv[1:]
print(json.dumps([[{"filename": path} for path in paths]]))
PY
)"
}

write_gh_mock() {
  local labels_json="${1:-[]}"
  cat > "${HARNESS_BIN}/gh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [[ "\$1" == "api" && "\$2" == "--paginate" && "\$3" == "--slurp" ]]; then
  printf '%s' "\${HARNESS_FILES_JSON}"
  exit 0
fi

if [[ "\$1" == "api" && "\$2" == "--method" && "\$3" == "DELETE" ]]; then
  : > "\${HARNESS_FLAG_FILE}"
  exit 0
fi

if [[ "\$1" == "api" ]]; then
  endpoint="\$2"
  case "\${endpoint}" in
    repos/*/issues/*/labels)
      printf '%s' '${labels_json}'
      exit 0
      ;;
  esac
fi

echo "unexpected gh invocation: \$*" >&2
exit 99
EOF
  chmod +x "${HARNESS_BIN}/gh"
}

run_extracted_script() {
  local extracted_script="$1"
  shift
  local -a pr_paths=("$@")

  build_files_json "${pr_paths[@]}"
  write_gh_mock "${HARNESS_LABELS_JSON:-[]}"

  local run_temp="${HARNESS_ROOT}/case-${TOTAL_TESTS}-$(date +%s%N)"
  mkdir -p "${run_temp}"
  local flag_file="${run_temp}/label-delete.flag"
  rm -f "${flag_file}"

  set +e
  HARNESS_FILES_JSON="${PATHS_JSON}" \
  HARNESS_FLAG_FILE="${flag_file}" \
  PATH="${HARNESS_BIN}:${PATH}" \
  RUNNER_TEMP="${run_temp}" \
  GITHUB_RUN_ID="harness" \
  GITHUB_RUN_ATTEMPT="1" \
  TRUSTED_AUTHORITY_ACTOR="${TRUSTED_AUTHORITY_ACTOR:-FATIHS-MGCKS}" \
  AUTHORITY_LABEL="${AUTHORITY_LABEL:-i18n-governance-authority-change}" \
  GH_TOKEN="test-token" \
  EVENT_REPOSITORY="${EVENT_REPOSITORY:-FATIHS-MGCKS/SYNQDRIVE-alpha}" \
  EVENT_PR_NUMBER="${EVENT_PR_NUMBER:-1581}" \
  EVENT_BASE_REF="${EVENT_BASE_REF:-main}" \
  EVENT_BASE_SHA="${EVENT_BASE_SHA:-e3ca36626a367008f858f02b1cca09efc1f79a29}" \
  EVENT_HEAD_SHA="${EVENT_HEAD_SHA:-adf600b7b4df6eacbedd3f52fa9993da66527598}" \
  EVENT_ACTION_VALUE="${EVENT_ACTION_VALUE:-opened}" \
  EVENT_CHANGED_FILES_VALUE="${EVENT_CHANGED_FILES_VALUE:-${#pr_paths[@]}}" \
  EVENT_LABEL_NAME="${EVENT_LABEL_NAME:-}" \
  EVENT_SENDER_LOGIN="${EVENT_SENDER_LOGIN:-}" \
  HAS_AUTHORITY_LABEL="${HAS_AUTHORITY_LABEL:-false}" \
  bash "${extracted_script}" > "${run_temp}/stdout.log" 2> "${run_temp}/stderr.log"
  local exit_code=$?
  set -e

  LAST_STDOUT="$(cat "${run_temp}/stdout.log")"
  LAST_STDERR="$(cat "${run_temp}/stderr.log")"
  LAST_EXIT_CODE="${exit_code}"

  LAST_REASON="$(printf '%s\n' "${LAST_STDOUT}" | sed -n 's/^REASON=//p' | tail -1)"
  LAST_RESULT="$(printf '%s\n' "${LAST_STDOUT}" | sed -n 's/^I18N_AUTHORITY_PROTECTION=//p' | tail -1)"
  HARNESS_LABEL_DELETE_INVOKED=false
  if [[ -f "${flag_file}" ]]; then
    HARNESS_LABEL_DELETE_INVOKED=true
  fi
}

run_extracted_workflow() {
  local workflow_source="$1"
  shift
  local extracted_script="${HARNESS_ROOT}/authority-protection-run-${TOTAL_TESTS}.sh"
  extract_workflow_run_script "${workflow_source}" "${extracted_script}"
  run_extracted_script "${extracted_script}" "$@"
}

assert_reason() {
  local expected="$1"
  [[ "${LAST_REASON}" == "${expected}" ]] || fail "expected REASON=${expected}, got ${LAST_REASON:-<missing>} (exit=${LAST_EXIT_CODE})"
}

assert_exit() {
  local expected="$1"
  [[ "${LAST_EXIT_CODE}" -eq "${expected}" ]] || fail "expected exit ${expected}, got ${LAST_EXIT_CODE} (REASON=${LAST_REASON:-<missing>})"
}

patch_product_detection_disabled() {
  local input_script="$1"
  local output_script="$2"
  python3 - <<'PY' "${input_script}" "${output_script}"
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
lines = source.read_text(encoding="utf-8").splitlines()

output = []
index = 0
while index < len(lines):
    line = lines[index]
    if line.startswith("is_product_or_presentation_path() {"):
        output.append("is_product_or_presentation_path() {")
        output.append("  return 1")
        output.append("}")
        index += 1
        while index < len(lines) and lines[index] != "}":
            index += 1
        if index < len(lines):
            index += 1
        continue
    output.append(line)
    index += 1

patched = "\n".join(output) + "\n"
if "is_product_or_presentation_path() {\n  return 1\n}" not in patched:
    raise SystemExit("failed to patch is_product_or_presentation_path in extracted workflow script")
target.write_text(patched, encoding="utf-8")
PY
}

PR1581_PATHS=(
  "frontend/src/i18n/i18n-structural-check.test.ts"
  "frontend/src/i18n/translation-coverage-baseline.json"
  "frontend/src/i18n/translation-coverage.test.ts"
)

# --- Test 1: workflow classifier includes translation coverage governance paths ---
echo "==> 1. workflow classifier includes translation coverage governance paths"
CASE_LINE="$(awk '
  /is_authority_path\(\) \{/ { in_fn=1; next }
  in_fn && /frontend\/src\/i18n\// {
    sub(/^[[:space:]]+/, "", $0)
    sub(/\)$/, "", $0)
    print $0
    exit
  }
' "${WORKFLOW}")"
[[ -n "${CASE_LINE}" ]] || fail "unable to extract workflow authority case line"
[[ "${CASE_LINE}" == *"frontend/src/i18n/translation-coverage-baseline.json"* ]] || fail "missing translation-coverage-baseline.json in workflow classifier"
[[ "${CASE_LINE}" == *"frontend/src/i18n/translation-coverage.test.ts"* ]] || fail "missing translation-coverage.test.ts in workflow classifier"
pass "workflow classifier includes translation coverage governance paths"

# --- Test 2: PR #1581 paths + trusted owner label pass ---
echo "==> 2. PR #1581 authority paths + trusted owner label pass"
EVENT_ACTION_VALUE=labeled
EVENT_LABEL_NAME=i18n-governance-authority-change
EVENT_SENDER_LOGIN=FATIHS-MGCKS
HAS_AUTHORITY_LABEL=true
HARNESS_LABELS_JSON='[{"name":"i18n-governance-authority-change"}]'
run_extracted_workflow "${WORKFLOW}" "${PR1581_PATHS[@]}"
assert_exit 0
assert_reason GOVERNANCE_AUTHORITY_APPROVED
pass "PR #1581 authority paths + trusted owner label pass"

# --- Test 3: missing approval fails ---
echo "==> 3. missing approval fails"
EVENT_ACTION_VALUE=opened
EVENT_LABEL_NAME=
EVENT_SENDER_LOGIN=
HAS_AUTHORITY_LABEL=false
HARNESS_LABELS_JSON='[]'
run_extracted_workflow "${WORKFLOW}" "frontend/src/i18n/translation-coverage.test.ts"
assert_exit 1
assert_reason GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL
pass "missing approval fails closed"

# --- Test 4: adding product code fails even with trusted owner approval ---
echo "==> 4. adding product code fails even with trusted owner approval"
EVENT_ACTION_VALUE=labeled
EVENT_LABEL_NAME=i18n-governance-authority-change
EVENT_SENDER_LOGIN=FATIHS-MGCKS
HAS_AUTHORITY_LABEL=true
HARNESS_LABELS_JSON='[{"name":"i18n-governance-authority-change"}]'
run_extracted_workflow "${WORKFLOW}" \
  "frontend/src/i18n/translation-coverage-baseline.json" \
  "frontend/src/rental/components/TopBar.tsx"
assert_exit 1
assert_reason MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE
pass "mixed authority + product change fails even with trusted owner approval"

# --- Test 5: untrusted labeling actor cannot approve ---
echo "==> 5. untrusted labeling actor cannot approve"
EVENT_ACTION_VALUE=labeled
EVENT_LABEL_NAME=i18n-governance-authority-change
EVENT_SENDER_LOGIN=untrusted-bot
HAS_AUTHORITY_LABEL=true
HARNESS_LABELS_JSON='[]'
run_extracted_workflow "${WORKFLOW}" "frontend/src/i18n/translation-coverage.test.ts"
assert_exit 1
assert_reason UNTRUSTED_AUTHORITY_APPROVAL_ACTOR
[[ "${HARNESS_LABEL_DELETE_INVOKED}" == "true" ]] || fail "expected label invalidation DELETE on untrusted actor"
pass "untrusted labeling actor cannot approve"

# --- Test 6: negative control — disabled product detection must fail regression ---
echo "==> 6. negative control: disabled product detection fails regression"
REAL_SCRIPT="${HARNESS_ROOT}/real-run.sh"
BROKEN_SCRIPT="${HARNESS_ROOT}/broken-run.sh"
extract_workflow_run_script "${WORKFLOW}" "${REAL_SCRIPT}"
patch_product_detection_disabled "${REAL_SCRIPT}" "${BROKEN_SCRIPT}"

EVENT_ACTION_VALUE=labeled
EVENT_LABEL_NAME=i18n-governance-authority-change
EVENT_SENDER_LOGIN=FATIHS-MGCKS
HAS_AUTHORITY_LABEL=true
HARNESS_LABELS_JSON='[{"name":"i18n-governance-authority-change"}]'
run_extracted_script "${BROKEN_SCRIPT}" \
  "frontend/src/i18n/translation-coverage-baseline.json" \
  "frontend/src/rental/components/TopBar.tsx"
if [[ "${LAST_EXIT_CODE}" -eq 0 && "${LAST_REASON}" == "GOVERNANCE_AUTHORITY_APPROVED" ]]; then
  pass "negative control: broken workflow incorrectly approves mixed change (regression would fail)"
else
  fail "negative control: expected broken workflow to approve mixed change, got exit=${LAST_EXIT_CODE} reason=${LAST_REASON:-<missing>}"
fi

# --- Test 7: no checkout in trusted workflow ---
echo "==> 7. no checkout in trusted workflow"
CHECKOUT_COUNT="$(grep -c 'uses:.*actions/checkout' "${WORKFLOW}" 2>/dev/null || true)"
[[ "${CHECKOUT_COUNT}" -eq 0 ]] || fail "actions/checkout present (count=${CHECKOUT_COUNT})"
pass "no actions/checkout in trusted workflow"

# --- Test 8: no repository runtime helper dependency ---
echo "==> 8. no repository runtime helper dependency"
if grep -qE '(source|\. )[[:space:]]*.*\.github/scripts/' "${WORKFLOW}"; then
  fail "workflow sources .github/scripts runtime helper"
fi
pass "no repository runtime helper dependency"

echo ""
echo "Harness complete: ${PASS_COUNT}/${TOTAL_TESTS} tests passed, ${FAIL_COUNT} failures"
[[ "${PASS_COUNT}" -eq "${TOTAL_TESTS}" ]] || fail "expected ${TOTAL_TESTS} passing tests, got ${PASS_COUNT}"
