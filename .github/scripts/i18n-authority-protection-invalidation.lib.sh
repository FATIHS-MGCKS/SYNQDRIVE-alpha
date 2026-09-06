#!/usr/bin/env bash
# Trusted i18n authority label invalidation helpers (sourced; not executed directly).
# Must run only from trusted pull_request_target workflows on the default-branch anchor.

sanitize_api_diagnostic() {
  local raw="${1:-}"
  raw="$(printf '%s' "${raw}" | tr '\n' ' ' | tr '\r' ' ')"
  raw="$(printf '%s' "${raw}" | sed -E \
    -e 's/ghs_[A-Za-z0-9_]+/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/github_pat_[A-Za-z0-9_]+/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/(Authorization:[[:space:]]*Bearer)[[:space:]]+[^[:space:]]+/\1 [REDACTED]/gi' \
    -e 's/(GH_TOKEN=)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/(token=)[^[:space:]]+/\1[REDACTED]/gi')"
  if [ "${#raw}" -gt 500 ]; then
    raw="${raw:0:500}...[truncated]"
  fi
  printf '%s' "${raw}"
}

authority_label_uri_encoded() {
  AUTHORITY_LABEL="${AUTHORITY_LABEL}" python3 - <<'PY'
import os
import urllib.parse

print(urllib.parse.quote(os.environ["AUTHORITY_LABEL"], safe=""))
PY
}

authority_label_present_on_pr() {
  local labels_json="${RUNNER_TEMP}/i18n-authority-labels-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}.json"
  if ! gh api "repos/${REPO}/issues/${PR_NUMBER}/labels" > "${labels_json}" 2>/dev/null; then
    return 2
  fi
  if AUTHORITY_LABEL="${AUTHORITY_LABEL}" LABELS_JSON="${labels_json}" python3 - <<'PY'
import json
import os
import sys

label = os.environ["AUTHORITY_LABEL"]
with open(os.environ["LABELS_JSON"], encoding="utf-8") as handle:
    names = [entry.get("name") for entry in json.load(handle)]
sys.exit(0 if label in names else 1)
PY
  then
    return 0
  fi
  return 1
}

invalidate_authority_label() {
  local delete_output="${RUNNER_TEMP}/i18n-authority-label-delete-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}.log"
  local encoded_label delete_status

  LABEL_INVALIDATION_API_RESULT=""
  LABEL_INVALIDATION_API_EXIT_CODE=""
  LABEL_INVALIDATION_API_DIAGNOSTIC=""

  encoded_label="$(authority_label_uri_encoded)"
  delete_status=0
  set +e
  gh api --method DELETE \
    "repos/${REPO}/issues/${PR_NUMBER}/labels/${encoded_label}" \
    >"${delete_output}" 2>&1
  delete_status=$?
  set -e

  if [ "${delete_status}" -ne 0 ]; then
    LABEL_INVALIDATION_API_RESULT=FAIL
    LABEL_INVALIDATION_API_EXIT_CODE="${delete_status}"
    LABEL_INVALIDATION_API_DIAGNOSTIC="$(sanitize_api_diagnostic "$(cat "${delete_output}" 2>/dev/null || true)")"
    return 1
  fi

  local label_presence_rc=0
  set +e
  authority_label_present_on_pr
  label_presence_rc=$?
  set -e

  case "${label_presence_rc}" in
    0)
      LABEL_INVALIDATION_API_RESULT=POSTCONDITION_FAIL
      LABEL_INVALIDATION_API_DIAGNOSTIC="authority label still present after DELETE exit 0"
      return 1
      ;;
    1)
      AUTHORITY_LABEL_PRESENT=false
      LABEL_INVALIDATION_API_RESULT=SUCCESS
      return 0
      ;;
    *)
      LABEL_INVALIDATION_API_RESULT=POSTCONDITION_VERIFY_FAILED
      LABEL_INVALIDATION_API_DIAGNOSTIC="unable to verify PR label state after DELETE"
      return 1
      ;;
  esac
}

emit_label_invalidation_diagnostics() {
  if [ -n "${LABEL_INVALIDATION_API_RESULT:-}" ]; then
    echo "LABEL_INVALIDATION_API_RESULT=${LABEL_INVALIDATION_API_RESULT}"
  fi
  if [ -n "${LABEL_INVALIDATION_API_EXIT_CODE:-}" ]; then
    echo "LABEL_INVALIDATION_API_EXIT_CODE=${LABEL_INVALIDATION_API_EXIT_CODE}"
  fi
  if [ -n "${LABEL_INVALIDATION_API_DIAGNOSTIC:-}" ]; then
    echo "LABEL_INVALIDATION_API_DIAGNOSTIC=${LABEL_INVALIDATION_API_DIAGNOSTIC}"
  fi
}
