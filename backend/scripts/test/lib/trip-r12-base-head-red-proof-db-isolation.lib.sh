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

trip_r12_bh_db_isolation_init() {
  TRIP_R12_BH_REPO_ROOT="$1"
  TRIP_R12_BH_DB_NAME_PREFIX="$2"
  TRIP_R12_BH_PROBE_RUN_ID="${3:-${GITHUB_RUN_ID:-local}}"
  if [[ -z "$TRIP_R12_BH_REPO_ROOT" || -z "$TRIP_R12_BH_DB_NAME_PREFIX" ]]; then
    echo "trip_r12_bh_db_isolation_init: repo_root and db_prefix required" >&2
    return 1
  fi
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

trip_r12_bh_assert_ci_local_postgres_url() {
  local url="$1"
  local label="${2:-DATABASE_URL}"
  if [[ -z "$url" ]]; then
    echo "${label} is required for isolated probe bootstrap" >&2
    return 1
  fi
  local lower="${url,,}"
  case "$lower" in
    *127.0.0.1*|*localhost*) ;;
    *)
      echo "${label} must target CI-local PostgreSQL (127.0.0.1 or localhost)" >&2
      return 1
      ;;
  esac
  case "$lower" in
    *srv1374778*|*app.synqdrive*|*hstgr.cloud*|*mein-vps*|*synqdrive.eu*)
      echo "${label} must not reference production hosts" >&2
      return 1
      ;;
  esac
  return 0
}

trip_r12_bh_parse_postgres_admin_from_url() {
  local url="$1"
  local base="${url%%\?*}"
  local rest="${base#postgresql://}"
  rest="${rest#postgres://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  TRIP_R12_BH_PG_ADMIN_USER="${userpass%%:*}"
  TRIP_R12_BH_PG_ADMIN_PASSWORD="${userpass#*:}"
  TRIP_R12_BH_PG_ADMIN_HOST="${hostport%%:*}"
  TRIP_R12_BH_PG_ADMIN_PORT="${hostport#*:}"
  if [[ "$TRIP_R12_BH_PG_ADMIN_PORT" == "$TRIP_R12_BH_PG_ADMIN_HOST" ]]; then
    TRIP_R12_BH_PG_ADMIN_PORT="5432"
  fi
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
  if ! trip_r12_bh_assert_ci_local_postgres_url "$TRIP_R12_BH_PARENT_CI_DATABASE_URL" "PARENT_CI_DATABASE_URL"; then
    fail_infra "PARENT_DATABASE_URL_NOT_CI_LOCAL"
  fi
  trip_r12_bh_parse_postgres_admin_from_url "$TRIP_R12_BH_PARENT_CI_DATABASE_URL"
}

trip_r12_bh_allocate_probe_database() {
  local label="$1"
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
  local probe_url="postgresql://${TRIP_R12_BH_PG_ADMIN_USER}:${TRIP_R12_BH_PG_ADMIN_PASSWORD}@${TRIP_R12_BH_PG_ADMIN_HOST}:${TRIP_R12_BH_PG_ADMIN_PORT}/${db_name}?schema=public"
  if ! trip_r12_bh_assert_ci_local_postgres_url "$probe_url" "PROBE_DATABASE_URL"; then
    fail_infra "PROBE_DATABASE_URL_GUARD_FAILED label=${label}"
  fi

  echo "PROBE_DATABASE_ISOLATED=YES" >&2
  echo "PROBE_LABEL=${label}" >&2
  echo "PROBE_DATABASE_NAME=${db_name}" >&2

  printf '%s' "$probe_url"
}

trip_r12_bh_database_name_from_url() {
  node --input-type=module -e "
const u = new URL(process.argv[1]);
process.stdout.write(u.pathname.replace(/^\\//, '').split('?')[0] ?? '');
" "$1"
}

trip_r12_bh_release_probe_database() {
  local db_name="$1"
  if [[ -z "$db_name" ]]; then
    return 0
  fi
  if ! trip_r12_bh_assert_probe_database_name "$db_name"; then
    echo "Refusing to drop non-probe database '${db_name}'" >&2
    return 1
  fi
  trip_r12_bh_bootstrap_parent_ci_database_context
  export PGPASSWORD="${TRIP_R12_BH_PG_ADMIN_PASSWORD}"
  local admin_url="postgresql://${TRIP_R12_BH_PG_ADMIN_USER}@${TRIP_R12_BH_PG_ADMIN_HOST}:${TRIP_R12_BH_PG_ADMIN_PORT}/postgres"
  psql "${admin_url}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db_name}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${admin_url}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${db_name}\";" >/dev/null 2>&1 || true
  local -a remaining=()
  local name
  for name in "${TRIP_R12_BH_CREATED_DB_NAMES[@]}"; do
    if [[ "$name" != "$db_name" ]]; then
      remaining+=("$name")
    fi
  done
  TRIP_R12_BH_CREATED_DB_NAMES=("${remaining[@]}")
}

trip_r12_bh_release_all_probe_databases() {
  if ((${#TRIP_R12_BH_CREATED_DB_NAMES[@]} == 0)); then
    return 0
  fi
  local db_name
  for db_name in "${TRIP_R12_BH_CREATED_DB_NAMES[@]}"; do
    trip_r12_bh_release_probe_database "$db_name" || true
  done
}

trip_r12_bh_register_probe_db_return_trap() {
  local probe_db_name="$1"
  local saved_database_url="${DATABASE_URL:-}"
  _trip_r12_bh_release_on_return() {
    trip_r12_bh_release_probe_database "$probe_db_name" || true
    if [[ -n "$saved_database_url" ]]; then
      export DATABASE_URL="$saved_database_url"
    else
      unset DATABASE_URL || true
    fi
  }
  trap _trip_r12_bh_release_on_return RETURN
}