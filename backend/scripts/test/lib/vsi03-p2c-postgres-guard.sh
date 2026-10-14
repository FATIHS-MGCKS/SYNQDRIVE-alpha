#!/usr/bin/env bash
# Fail-closed guard for VSI03 P2C disposable PostgreSQL certification (source before mutations).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

vsi03_p2c_guard_abort() {
  printf '[vsi03-p2c-postgres-guard] ABORT: %s\n' "$*" >&2
  exit 1
}

vsi03_p2c_assert_safe_database_name() {
  local db_name=$1
  if [[ -z "${db_name}" ]]; then
    vsi03_p2c_guard_abort "database name is required"
  fi
  if [[ ! "${db_name}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    vsi03_p2c_guard_abort "database name contains unsafe characters (${db_name})"
  fi
  if [[ ! "${db_name}" =~ ^vsi03_test_[a-zA-Z0-9_]+$ ]]; then
    vsi03_p2c_guard_abort "database name must match vsi03_test_* (got ${db_name})"
  fi
  local db_lower="${db_name,,}"
  case "${db_lower}" in
    synqdrive | production | prod | app | postgres | template0 | template1)
      vsi03_p2c_guard_abort "refusing production-like database name (${db_name})"
      ;;
  esac
}

vsi03_p2c_assert_safe_host() {
  local host=$1
  if [[ -z "${host}" ]]; then
    vsi03_p2c_guard_abort "database host is required"
  fi
  local host_lower="${host,,}"
  case "${host_lower}" in
    *synqdrive* | *hstgr* | *srv1374778* | *production* | app.synqdrive.eu)
      vsi03_p2c_guard_abort "refusing production-like database host (${host})"
      ;;
  esac
  if [[ "${host_lower}" != "127.0.0.1" && "${host_lower}" != "localhost" && "${host_lower}" != "postgres" ]]; then
    vsi03_p2c_guard_abort "refusing non-local database host (${host}); only 127.0.0.1, localhost, or postgres (CI service) allowed"
  fi
}

vsi03_p2c_assert_safe_admin_database_name() {
  local db_name=$1
  if [[ -z "${db_name}" ]]; then
    vsi03_p2c_guard_abort "admin database name is required"
  fi
  if [[ ! "${db_name}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    vsi03_p2c_guard_abort "admin database name contains unsafe characters (${db_name})"
  fi
  local db_lower="${db_name,,}"
  if [[ "${db_lower}" != "postgres" ]]; then
    vsi03_p2c_guard_abort "admin database must be postgres for CREATE DATABASE bootstrap (got ${db_name})"
  fi
}

vsi03_p2c_assert_disposable_target() {
  local host=$1
  local db_name=$2
  local database_url=$3

  vsi03_p2c_assert_safe_host "${host}"
  vsi03_p2c_assert_safe_database_name "${db_name}"

  if [[ "${database_url}" == *"app.synqdrive"* || "${database_url}" == *"srv1374778"* ]]; then
    vsi03_p2c_guard_abort "DATABASE_URL appears production-like"
  fi
}
