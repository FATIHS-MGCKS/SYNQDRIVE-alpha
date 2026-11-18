# Shared CI-local PostgreSQL isolation for Trip R12 BASE/HEAD red-proof harness scripts.
# Source after defining fail_infra() in the caller.
set -euo pipefail

TRIP_R12_BH_REPO_ROOT="${TRIP_R12_BH_REPO_ROOT:-}"
TRIP_R12_BH_DB_NAME_PREFIX="${TRIP_R12_BH_DB_NAME_PREFIX:-}"
TRIP_R12_BH_PROBE_RUN_ID="${TRIP_R12_BH_PROBE_RUN_ID:-${GITHUB_RUN_ID:-local}}"
TRIP_R12_BH_PARENT_CI_DATABASE_URL=""
TRIP_R12_BH_PG_ADMIN_HOST=""
TRIP_R12_BH_PG_ADMIN_PORT=""
TRIP_R12_BH_PG_ADMIN_USER=""
TRIP_R12_BH_PG_ADMIN_PASSWORD=""
TRIP_R12_BH_CREATED_DB_NAMES=()
TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME=""
TRIP_R12_BH_PARENT_DATABASE_URL_RESTORE=""
TRIP_R12_BH_EXIT_TRAP_INSTALLED=0
TRIP_R12_BH_SUPPRESS_EXIT_TRAP=0
TRIP_R12_BH_LIFECYCLE_LOG=()

trip_r12_bh_db_isolation_init() {
  TRIP_R12_BH_REPO_ROOT="$1"
  TRIP_R12_BH_DB_NAME_PREFIX="$2"
  TRIP_R12_BH_PROBE_RUN_ID="${3:-${GITHUB_RUN_ID:-local}}"
  if [[ -z "$TRIP_R12_BH_REPO_ROOT" || -z "$TRIP_R12_BH_DB_NAME_PREFIX" ]]; then
    echo "trip_r12_bh_db_isolation_init: repo_root and db_prefix required" >&2
    return 1
  fi
}

# Prints: scheme<TAB>hostname<TAB>port<TAB>database<TAB>schema
trip_r12_bh_parse_postgres_url_fields() {
  local url="$1"
  node --input-type=module -e "
const u = new URL(process.argv[1]);
const scheme = u.protocol.replace(/:$/, '').toLowerCase();
const host = (u.hostname || '').toLowerCase();
const port = u.port || '5432';
const db = decodeURIComponent((u.pathname || '/').replace(/^\\//, '').split('/')[0] || '');
const schema = (u.searchParams.get('schema') || 'public').toLowerCase();
if (!['postgres', 'postgresql'].includes(scheme)) {
  process.exit(2);
}
process.stdout.write([scheme, host, port, db, schema].join('\\t'));
" "$url"
}

trip_r12_bh_assert_hostname_ci_local() {
  local host="${1,,}"
  case "$host" in
    127.0.0.1 | localhost | ::1) return 0 ;;
    *)
      echo "hostname must be 127.0.0.1, localhost, or ::1 (got '${host}')" >&2
      return 1
      ;;
  esac
}

trip_r12_bh_assert_disposable_parent_database_name() {
  local db_name="$1"
  local db_lower="${db_name,,}"
  case "${db_lower}" in
    synqdrive | production | prod | postgres | template0 | template1)
      echo "Refusing production-like parent database name '${db_name}'" >&2
      return 1
      ;;
  esac
  if [[ "$db_name" =~ ^test_ ]] || [[ "$db_name" =~ ^synqdrive_ci_ephemeral ]]; then
    return 0
  fi
  echo "Parent database name must be disposable CI (test_* or synqdrive_ci_ephemeral*), got '${db_name}'" >&2
  return 1
}

trip_r12_bh_assert_probe_database_name() {
  local db_name="$1"
  local prefix="${TRIP_R12_BH_DB_NAME_PREFIX}"
  if [[ ! "$db_name" =~ ^${prefix}_(base|head|pre_fix)_[a-zA-Z0-9_]+$ ]]; then
    echo "Refusing probe database name '${db_name}' (prefix=${prefix})" >&2
    return 1
  fi
  local db_lower="${db_name,,}"
  case "${db_lower}" in
    synqdrive | production | prod | postgres | template0 | template1)
      echo "Refusing production-like database name '${db_name}'" >&2
      return 1
      ;;
  esac
  return 0
}

# url_role: parent | probe
trip_r12_bh_assert_ci_local_postgres_url() {
  local url="$1"
  local label="${2:-DATABASE_URL}"
  local url_role="${3:-parent}"

  if [[ -z "$url" ]]; then
    echo "${label} is required for isolated probe bootstrap" >&2
    return 1
  fi

  local lower="${url,,}"
  case "$lower" in
    *srv1374778*|*app.synqdrive*|*hstgr.cloud*|*mein-vps*|*synqdrive.eu*)
      echo "${label} must not reference production hosts" >&2
      return 1
      ;;
  esac

  local fields scheme host port db schema
  if ! fields="$(trip_r12_bh_parse_postgres_url_fields "$url" 2>/dev/null)"; then
    echo "${label} is not a valid postgres/postgresql URL" >&2
    return 1
  fi
  IFS=$'\t' read -r scheme host port db schema <<<"$fields"

  if ! trip_r12_bh_assert_hostname_ci_local "$host"; then
    echo "${label}: strict host validation failed for parsed host='${host}'" >&2
    return 1
  fi

  if ! [[ "$port" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
    echo "${label} has invalid port '${port}'" >&2
    return 1
  fi

  if [[ "$schema" != "public" ]]; then
    echo "${label} must use schema=public for CI probe harness" >&2
    return 1
  fi

  if [[ -z "$db" ]]; then
    echo "${label} must include a database name" >&2
    return 1
  fi

  if [[ "$url_role" == "probe" ]]; then
    trip_r12_bh_assert_probe_database_name "$db"
  else
    trip_r12_bh_assert_disposable_parent_database_name "$db"
  fi
}

trip_r12_bh_parse_postgres_admin_from_url() {
  local url="$1"
  local fields scheme host port db _schema
  fields="$(trip_r12_bh_parse_postgres_url_fields "$url")"
  IFS=$'\t' read -r scheme host port db _schema <<<"$fields"
  local base="${url%%\?*}"
  local rest="${base#postgresql://}"
  rest="${rest#postgres://}"
  local userpass="${rest%%@*}"
  TRIP_R12_BH_PG_ADMIN_USER="${userpass%%:*}"
  TRIP_R12_BH_PG_ADMIN_PASSWORD="${userpass#*:}"
  TRIP_R12_BH_PG_ADMIN_HOST="$host"
  TRIP_R12_BH_PG_ADMIN_PORT="$port"
}

trip_r12_bh_bootstrap_parent_ci_database_context() {
  if [[ -n "$TRIP_R12_BH_PARENT_CI_DATABASE_URL" ]]; then
    return 0
  fi
  TRIP_R12_BH_PARENT_CI_DATABASE_URL="${DATABASE_URL:-}"
  if [[ -z "$TRIP_R12_BH_PARENT_CI_DATABASE_URL" ]]; then
    # shellcheck disable=SC1091
    source "${TRIP_R12_BH_REPO_ROOT}/backend/scripts/test/ci-ephemeral-database-url.sh"
    TRIP_R12_BH_PARENT_CI_DATABASE_URL="${DATABASE_URL}"
  fi
  if ! trip_r12_bh_assert_ci_local_postgres_url "$TRIP_R12_BH_PARENT_CI_DATABASE_URL" "PARENT_CI_DATABASE_URL" parent; then
    fail_infra "PARENT_DATABASE_URL_NOT_CI_LOCAL"
  fi
  trip_r12_bh_parse_postgres_admin_from_url "$TRIP_R12_BH_PARENT_CI_DATABASE_URL"
}

# Writes probe DATABASE_URL into the caller-named variable (nameref). No command substitution.
trip_r12_bh_allocate_probe_database() {
  local label="$1"
  local -n probe_url_out="$2"
  local label_lower="${label,,}"
  trip_r12_bh_bootstrap_parent_ci_database_context

  local db_name="${TRIP_R12_BH_DB_NAME_PREFIX}_${label_lower}_${TRIP_R12_BH_PROBE_RUN_ID}_${RANDOM}"
  if ! trip_r12_bh_assert_probe_database_name "$db_name"; then
    fail_infra "INVALID_PROBE_DATABASE_NAME"
  fi

  export PGPASSWORD="${TRIP_R12_BH_PG_ADMIN_PASSWORD}"
  local admin_url="postgresql://${TRIP_R12_BH_PG_ADMIN_USER}@${TRIP_R12_BH_PG_ADMIN_HOST}:${TRIP_R12_BH_PG_ADMIN_PORT}/postgres"

  if ! psql "${admin_url}" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    fail_infra "CI_POSTGRES_ADMIN_UNREACHABLE"
  fi

  if ! psql "${admin_url}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${db_name}\";" >/dev/null 2>&1; then
    fail_infra "PROBE_DATABASE_CREATE_FAILED label=${label}"
  fi

  TRIP_R12_BH_CREATED_DB_NAMES+=("$db_name")
  trip_r12_bh_lifecycle_note "CREATE label=${label} db=${db_name}"
  probe_url_out="postgresql://${TRIP_R12_BH_PG_ADMIN_USER}:${TRIP_R12_BH_PG_ADMIN_PASSWORD}@${TRIP_R12_BH_PG_ADMIN_HOST}:${TRIP_R12_BH_PG_ADMIN_PORT}/${db_name}?schema=public"
  if ! trip_r12_bh_assert_ci_local_postgres_url "$probe_url_out" "PROBE_DATABASE_URL" probe; then
    fail_infra "PROBE_DATABASE_URL_GUARD_FAILED label=${label}"
  fi

  echo "PROBE_DATABASE_ISOLATED=YES" >&2
  echo "PROBE_LABEL=${label}" >&2
  echo "PROBE_DATABASE_NAME=${db_name}" >&2
}

trip_r12_bh_database_name_from_url() {
  local url="$1"
  local fields _scheme host _port db _schema
  fields="$(trip_r12_bh_parse_postgres_url_fields "$url")"
  IFS=$'\t' read -r _scheme host _port db _schema <<<"$fields"
  printf '%s' "$db"
}

trip_r12_bh_lifecycle_note() {
  TRIP_R12_BH_LIFECYCLE_LOG+=("$1")
  echo "PROBE_DB_LIFECYCLE=${1}" >&2
}

trip_r12_bh_is_registered_probe_database() {
  local db_name="$1"
  local name
  for name in "${TRIP_R12_BH_CREATED_DB_NAMES[@]}"; do
    if [[ "$name" == "$db_name" ]]; then
      return 0
    fi
  done
  return 1
}

trip_r12_bh_ensure_exit_cleanup_trap() {
  if [[ "$TRIP_R12_BH_EXIT_TRAP_INSTALLED" == 1 ]]; then
    return 0
  fi
  trap '_trip_r12_bh_on_process_exit' EXIT
  TRIP_R12_BH_EXIT_TRAP_INSTALLED=1
}

_trip_r12_bh_on_process_exit() {
  local exit_rc=$?
  if [[ "${TRIP_R12_BH_SUPPRESS_EXIT_TRAP:-0}" == 1 ]]; then
    return
  fi
  if ! trip_r12_bh_finalize_all_probe_cleanup; then
    exit 2
  fi
  exit "$exit_rc"
}

trip_r12_bh_restore_parent_database_url() {
  if [[ -n "${TRIP_R12_BH_PARENT_DATABASE_URL_RESTORE:-}" ]]; then
    export DATABASE_URL="${TRIP_R12_BH_PARENT_DATABASE_URL_RESTORE}"
  else
    unset DATABASE_URL || true
  fi
}

trip_r12_bh_finalize_all_probe_cleanup() {
  local had_failure=0
  if [[ -n "${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}" ]]; then
    if ! trip_r12_bh_release_probe_database "${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}"; then
      had_failure=1
    fi
    TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME=""
    trip_r12_bh_restore_parent_database_url
  fi
  if ! trip_r12_bh_release_all_probe_databases; then
    had_failure=1
  fi
  return "$had_failure"
}

trip_r12_bh_release_probe_database() {
  local db_name="$1"
  if [[ -z "$db_name" ]]; then
    return 0
  fi
  if ! trip_r12_bh_assert_probe_database_name "$db_name"; then
    echo "PROBE_DB_DROP_REFUSED name=${db_name}" >&2
    return 1
  fi
  if ! trip_r12_bh_is_registered_probe_database "$db_name"; then
    echo "PROBE_DB_DROP_REFUSED not_registered name=${db_name}" >&2
    return 1
  fi
  trip_r12_bh_bootstrap_parent_ci_database_context
  export PGPASSWORD="${TRIP_R12_BH_PG_ADMIN_PASSWORD}"
  local admin_url="postgresql://${TRIP_R12_BH_PG_ADMIN_USER}@${TRIP_R12_BH_PG_ADMIN_HOST}:${TRIP_R12_BH_PG_ADMIN_PORT}/postgres"
  psql "${admin_url}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db_name}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  if ! psql "${admin_url}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${db_name}\";" >/dev/null 2>&1; then
    echo "PROBE_DB_CLEANUP_FAILED name=${db_name}" >&2
    return 1
  fi
  local -a remaining=()
  local name
  for name in "${TRIP_R12_BH_CREATED_DB_NAMES[@]}"; do
    if [[ "$name" != "$db_name" ]]; then
      remaining+=("$name")
    fi
  done
  TRIP_R12_BH_CREATED_DB_NAMES=("${remaining[@]}")
  trip_r12_bh_lifecycle_note "DROP db=${db_name}"
  return 0
}

trip_r12_bh_release_all_probe_databases() {
  if ((${#TRIP_R12_BH_CREATED_DB_NAMES[@]} == 0)); then
    return 0
  fi
  local had_failure=0
  local db_name
  for db_name in "${TRIP_R12_BH_CREATED_DB_NAMES[@]}"; do
    if ! trip_r12_bh_release_probe_database "$db_name"; then
      had_failure=1
    fi
  done
  return "$had_failure"
}

trip_r12_bh_probe_scope_leave() {
  if [[ -z "${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}" ]]; then
    return 0
  fi
  local active_db="${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}"
  trip_r12_bh_lifecycle_note "SCOPE_LEAVE db=${active_db}"
  if ! trip_r12_bh_release_probe_database "$active_db"; then
    fail_infra "PROBE_DB_CLEANUP_FAILED name=${active_db}"
  fi
  TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME=""
  trip_r12_bh_restore_parent_database_url
}

# Begin isolated probe DB scope; release explicitly via trip_r12_bh_probe_scope_leave (no RETURN trap).
trip_r12_bh_probe_scope_enter() {
  local label="$1"
  local -n probe_url_var="$2"
  local parent_url_snapshot="${3-}"

  trip_r12_bh_ensure_exit_cleanup_trap
  TRIP_R12_BH_PARENT_DATABASE_URL_RESTORE="${parent_url_snapshot}"
  trip_r12_bh_allocate_probe_database "$label" probe_url_var
  TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME="$(trip_r12_bh_database_name_from_url "$probe_url_var")"
  export DATABASE_URL="$probe_url_var"
  trip_r12_bh_lifecycle_note "SCOPE_ENTER label=${label} db=${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}"
}
