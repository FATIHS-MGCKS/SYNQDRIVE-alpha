#!/usr/bin/env bash
# Test-only harness: define authority path before sourcing production bypass enforcement lib.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

if [[ -z "${_VO5C_SELFTEST_AUTHORITY_FILE:-}" ]]; then
  echo "ABORT: _VO5C_SELFTEST_AUTHORITY_FILE required for selftest harness" >&2
  return 1
fi

vps_vo5c_production_deploy_authority_file() {
  printf '%s' "${_VO5C_SELFTEST_AUTHORITY_FILE}"
}
