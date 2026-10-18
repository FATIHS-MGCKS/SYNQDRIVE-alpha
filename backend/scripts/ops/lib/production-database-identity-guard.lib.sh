#!/usr/bin/env bash
# Fail-closed production database identity + destructive-operation guards.
# Source from deploy, test, and Prisma entrypoints — do not execute directly.
set -euo pipefail

_GUARD_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_GUARD_OPS_DIR="$(cd "${_GUARD_LIB_DIR}/.." && pwd)"
_GUARD_CONTRACT="${SYNQDRIVE_PRODUCTION_DB_CONTRACT:-${_GUARD_OPS_DIR}/contracts/production-database-identity.v1.json}"

PDB_GUARD_EXIT_IDENTITY=41
PDB_GUARD_EXIT_DESTRUCTIVE=42
PDB_GUARD_EXIT_BACKUP=43

pdb_guard_die() {
  local code=$1
  shift
  echo "!! PDB_GUARD_ABORT: $*" >&2
  exit "$code"
}

pdb_guard_contract_json() {
  [[ -f "$_GUARD_CONTRACT" ]] || pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "missing contract: ${_GUARD_CONTRACT}"
  python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))))' "$_GUARD_CONTRACT"
}

pdb_guard_parse_database_url() {
  local url="${1:-${DATABASE_URL:-}}"
  [[ -n "$url" ]] || pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "DATABASE_URL is empty"
  python3 - "$url" <<'PY'
import sys, urllib.parse
url = sys.argv[1]
# postgresql://user:pass@host:port/db?schema=public
parsed = urllib.parse.urlparse(url)
if parsed.scheme not in ("postgresql", "postgres"):
    print("ERROR:unsupported_scheme", parsed.scheme, sep="\t")
    sys.exit(0)
user = urllib.parse.unquote(parsed.username or "")
password = "set" if parsed.password else ""
host = parsed.hostname or ""
port = parsed.port or 5432
path = (parsed.path or "").lstrip("/")
db = path.split("/")[0] if path else ""
qs = urllib.parse.parse_qs(parsed.query)
schema = (qs.get("schema") or ["public"])[0]
print("\t".join([user, host, str(port), db, schema, password]))
PY
}

pdb_guard_url_field() {
  local url=$1
  local idx=$2
  pdb_guard_parse_database_url "$url" | awk -F'\t' -v i="$idx" '{print $i}'
}

pdb_guard_is_vps_production_context() {
  [[ -f /opt/synqdrive/shared/backend.env ]]
}

pdb_guard_profile() {
  if [[ -n "${SYNQDRIVE_DATABASE_IDENTITY_PROFILE:-}" ]]; then
    printf '%s' "$SYNQDRIVE_DATABASE_IDENTITY_PROFILE"
    return 0
  fi
  if pdb_guard_is_vps_production_context; then
    printf '%s' "production_vps"
    return 0
  fi
  printf '%s' "unset"
}

pdb_guard_database_name_is_reserved_production() {
  local db=$1
  python3 - "$db" "$_GUARD_CONTRACT" <<'PY'
import json, re, sys
db, path = sys.argv[1], sys.argv[2]
c = json.load(open(path))
if db in c.get("reservedProductionNames", []):
    sys.exit(0)
for pat in c.get("ephemeralDatabaseNamePatterns", []):
    if re.match(pat, db):
        sys.exit(1)
sys.exit(1)
PY
}

pdb_guard_assert_ephemeral_database_url() {
  local url="${1:-${DATABASE_URL:-}}"
  local user host port db schema _pw
  IFS=$'\t' read -r user host port db schema _pw < <(pdb_guard_parse_database_url "$url")
  if [[ "$user" == ERROR:* ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "unsupported DATABASE_URL scheme"
  fi

  local forbidden
  forbidden="$(python3 - "$url" "$_GUARD_CONTRACT" <<'PY'
import json, sys
url, path = sys.argv[1], sys.argv[2]
c = json.load(open(path))
for frag in c.get("forbiddenUrlSubstrings", []):
    if frag.lower() in url.lower():
        print(frag)
        break
PY
)"
  if [[ -n "$forbidden" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "DATABASE_URL references forbidden production host fragment: ${forbidden}"
  fi

  case "${host,,}" in
    localhost|127.0.0.1|::1) ;;
    *)
      pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "ephemeral DATABASE_URL host must be localhost (got ${host})"
      ;;
  esac

  if pdb_guard_database_name_is_reserved_production "$db"; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "reserved production database name '${db}' cannot be used as ephemeral test target"
  fi

  if [[ "${SYNQDRIVE_PRODUCTION_GUARD_BYPASS:-}" == "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "SYNQDRIVE_PRODUCTION_GUARD_BYPASS=1 is forbidden (undocumented bypass)"
  fi
}

pdb_guard_normalize_host() {
  local h="${1,,}"
  case "$h" in
    ""|localhost|127.0.0.1|::1) printf '%s' "local" ;;
    *) printf '%s' "$h" ;;
  esac
}

pdb_guard_assert_parsed_urls_equivalent() {
  local url_a="${1:-}"
  local url_b="${2:-}"
  local label_a="${3:-first}"
  local label_b="${4:-second}"
  [[ -n "$url_a" && -n "$url_b" ]] || pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "connection comparison requires two URLs"
  local ua ha pa da sa _pa ub hb pb db sb _pb
  IFS=$'\t' read -r ua ha pa da sa _pa < <(pdb_guard_parse_database_url "$url_a")
  IFS=$'\t' read -r ub hb pb db sb _pb < <(pdb_guard_parse_database_url "$url_b")
  if [[ "$(pdb_guard_normalize_host "$ha")" != "$(pdb_guard_normalize_host "$hb")" || "$pa" != "$pb" || "$da" != "$db" || "$sa" != "$sb" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "${label_a} vs ${label_b} DSN mismatch (host/port/db/schema)"
  fi
}

pdb_guard_live_server_fingerprint() {
  local db="${1:-synqdrive}"
  pdb_guard_psql_as_postgres "$db" -tAc "
SELECT current_database(),
       (SELECT oid::text FROM pg_database WHERE datname = current_database()),
       COALESCE(inet_server_addr()::text, 'local'),
       COALESCE(inet_server_port()::text, '0'),
       current_setting('search_path');
"
}

pdb_guard_assert_runtime_matches_live_fingerprint() {
  local url="${1:-${DATABASE_URL:-}}"
  local migrate_url="${2:-${SYNQDRIVE_MIGRATION_DATABASE_URL:-$url}}"
  local db
  db="$(pdb_guard_url_field "$url" 4)"
  pdb_guard_assert_parsed_urls_equivalent "$url" "$migrate_url" "runtime DATABASE_URL" "migration DSN"
  if [[ -n "${DIRECT_URL:-}" ]]; then
    pdb_guard_assert_parsed_urls_equivalent "$url" "$DIRECT_URL" "runtime DATABASE_URL" "DIRECT_URL"
  fi

  local live_line db_live oid srv_port
  live_line="$(pdb_guard_live_server_fingerprint "$db")"
  db_live="$(echo "$live_line" | awk -F'|' '{gsub(/ /,"",$1); print $1}')"
  oid="$(echo "$live_line" | awk -F'|' '{gsub(/ /,"",$2); print $2}')"
  srv_port="$(echo "$live_line" | awk -F'|' '{gsub(/ /,"",$4); print $4}')"

  local url_db url_host url_port url_schema
  url_db="$(pdb_guard_url_field "$url" 4)"
  url_host="$(pdb_guard_url_field "$url" 2)"
  url_port="$(pdb_guard_url_field "$url" 3)"
  url_schema="$(pdb_guard_url_field "$url" 5)"

  if [[ "$url_db" != "$db_live" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "DATABASE_URL database ${url_db} != live session ${db_live}"
  fi
  if [[ "$url_schema" != "public" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "DATABASE_URL schema must be public (got ${url_schema})"
  fi
  case "$(pdb_guard_normalize_host "$url_host")" in
    local) ;;
    *)
      pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production DATABASE_URL host must be local (got ${url_host})"
      ;;
  esac
  if [[ "$url_port" != "$srv_port" && "$srv_port" != "0" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "DATABASE_URL port ${url_port} != live server port ${srv_port}"
  fi

  printf '%s' "${oid}|${db_live}|${url_host}|${url_port}|public"
}

pdb_guard_assert_backup_dump_target_parity() {
  local url="${1:-${DATABASE_URL:-}}"
  local backup_file="${2:-}"
  local backup_db_name="${3:-synqdrive}"
  [[ -f "$backup_file" ]] || pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup file missing for parity check"
  local url_db
  url_db="$(pdb_guard_url_field "$url" 4)"
  if [[ "$url_db" != "$backup_db_name" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "pg_dump target ${backup_db_name} != DATABASE_URL database ${url_db}"
  fi
  if ! gzip -dc "$backup_file" 2>/dev/null | head -n 200 | grep -qE "PostgreSQL database dump|CREATE DATABASE|\\\\connect|${backup_db_name}"; then
    pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup artifact does not appear to target database ${backup_db_name}"
  fi
  pdb_guard_assert_runtime_matches_live_fingerprint "$url" >/dev/null
}

PDB_GUARD_AUTHORITY_STAMP_PATH="${SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_PATH:-/opt/synqdrive/shared/state/migration-authority.stamp}"

pdb_guard_write_migration_authority_stamp() {
  local url="${1:-${DATABASE_URL:-}}"
  local fp oid db_live ledger_distinct issued_at body
  fp="$(pdb_guard_assert_runtime_matches_live_fingerprint "$url")"
  oid="${fp%%|*}"
  db_live="$(pdb_guard_url_field "$url" 4)"
  ledger_distinct="$(pdb_guard_psql_as_postgres "$db_live" -tAc \
    "SELECT count(DISTINCT migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" | tr -d '[:space:]')"
  issued_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  body="v1|oid=${oid}|db=${db_live}|ledger=${ledger_distinct}|issued=${issued_at}"
  local mac
  mac="$(printf '%s' "$body" | sha256sum | awk '{print $1}')"
  mkdir -p "$(dirname "$PDB_GUARD_AUTHORITY_STAMP_PATH")" 2>/dev/null || true
  if [[ -w "$(dirname "$PDB_GUARD_AUTHORITY_STAMP_PATH")" ]] 2>/dev/null; then
    printf '%s\nmac=%s\n' "$body" "$mac" > "$PDB_GUARD_AUTHORITY_STAMP_PATH"
    chmod 600 "$PDB_GUARD_AUTHORITY_STAMP_PATH" 2>/dev/null || true
  fi
  printf '%s\nmac=%s\n' "$body" "$mac"
}

pdb_guard_assert_migration_authority_stamp() {
  local url="${1:-${DATABASE_URL:-}}"
  local stamp_file="${SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE:-$PDB_GUARD_AUTHORITY_STAMP_PATH}"
  [[ -f "$stamp_file" ]] || pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "missing migration authority stamp (run deploy preflight first)"
  local body mac_file mac_exp
  body="$(grep -v '^mac=' "$stamp_file" | head -1)"
  mac_file="$(grep '^mac=' "$stamp_file" | cut -d= -f2-)"
  mac_exp="$(printf '%s' "$body" | sha256sum | awk '{print $1}')"
  if [[ "$mac_file" != "$mac_exp" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migration authority stamp integrity check failed"
  fi
  local fp oid_live
  fp="$(pdb_guard_assert_runtime_matches_live_fingerprint "$url")"
  oid_live="${fp%%|*}"
  local oid_stamp="${body#*oid=}"; oid_stamp="${oid_stamp%%|*}"
  if [[ "$oid_stamp" != "$oid_live" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migration authority stamp database OID mismatch"
  fi
  local issued="${body#*issued=}"
  local now_epoch stamp_epoch
  now_epoch="$(date -u +%s)"
  stamp_epoch="$(date -u -d "$issued" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$issued" +%s 2>/dev/null || echo 0)"
  if [[ "$stamp_epoch" -gt 0 && $((now_epoch - stamp_epoch)) -gt 7200 ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migration authority stamp expired (>${issued})"
  fi
}

pdb_guard_assert_no_destructive_recovery_flags() {
  if [[ "${SYNQDRIVE_ISOLATED_RECOVERY_AUTHORIZED:-}" == "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "isolated recovery authorization active — deploy blocked"
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_DB_CUTOVER_AUTHORIZED:-}" == "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production DB cutover authorization active — deploy blocked"
  fi
}

pdb_guard_psql_as_postgres() {
  local db=$1
  shift
  if [[ "${SYNQDRIVE_GUARD_TEST_MODE:-}" == "1" ]]; then
    PGPASSWORD="${PGPASSWORD:-${CI_PG_PASSWORD:-synqdrive}}" psql -h "${CI_PG_HOST:-127.0.0.1}" -p "${CI_PG_PORT:-5432}" \
      -U "${CI_PG_USER:-synqdrive}" -v ON_ERROR_STOP=1 -d "$db" "$@"
    return 0
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db" "$@"
}

pdb_guard_assert_live_schema_contract() {
  local db="${1:-synqdrive}"
  local contract_path="$_GUARD_CONTRACT"
  pdb_guard_psql_as_postgres "$db" -tAc "
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
" | {
    read -r table_count
    python3 - "$table_count" "$contract_path" <<'PY'
import json, sys
count = int(sys.argv[1])
c = json.load(open(sys.argv[2]))
min_t = int(c.get("minPublicTableCount", 0))
if count < min_t:
    raise SystemExit(f"public table count {count} < contract min {min_t}")
print("OK", count)
PY
  } || pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "public schema table count below contract minimum"

  local required_tables
  required_tables="$(python3 - "$contract_path" <<'PY'
import json, sys
print(",".join(json.load(open(sys.argv[1]))["requiredPublicTables"]))
PY
)"
  IFS=',' read -ra req <<< "$required_tables"
  local t missing=""
  for t in "${req[@]}"; do
    local exists
    exists="$(pdb_guard_psql_as_postgres "$db" -tAc "SELECT to_regclass('public.${t}') IS NOT NULL")"
    if [[ "$exists" != "t" ]]; then
      missing="${missing} ${t}"
    fi
  done
  if [[ -n "$missing" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "missing required tables:${missing}"
  fi

  local floor_err
  floor_err="$(python3 - "$db" "$contract_path" <<'PY'
import json, subprocess, sys
db, path = sys.argv[1], sys.argv[2]
c = json.load(open(path))
floors = c.get("coreTableRowFloors", {})
errors = []
for table, floor in floors.items():
    q = f'SELECT count(*)::text FROM public."{table}"'
    out = subprocess.check_output(["sudo", "-u", "postgres", "psql", "-d", db, "-tAc", q], text=True).strip()
    n = int(out or "0")
    if n < int(floor):
        errors.append(f"{table} rows={n} < floor={floor}")
if errors:
    print("; ".join(errors))
PY
)"
  if [[ -n "$floor_err" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "core table row floors: ${floor_err}"
  fi

  pdb_guard_psql_as_postgres "$db" -tAc "
SELECT count(*) AS total,
       count(DISTINCT migration_name) AS distinct_ok,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS successful_rows,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back
FROM _prisma_migrations;
" | {
    IFS='|' read -r total distinct_ok successful_rows rolled_back
    total="${total// /}"
    distinct_ok="${distinct_ok// /}"
    successful_rows="${successful_rows// /}"
    rolled_back="${rolled_back// /}"
    python3 - "$distinct_ok" "$rolled_back" "$total" "$contract_path" <<'PY'
import json, sys
distinct_ok = int(sys.argv[1])
rolled_back = int(sys.argv[2])
total = int(sys.argv[3])
c = json.load(open(sys.argv[4]))
exp = c["ledgerExpectations"]
if distinct_ok < int(exp["minSuccessfulDistinctMigrations"]):
    raise SystemExit(f"distinct successful migration names {distinct_ok} < {exp['minSuccessfulDistinctMigrations']}")
if total > 0 and (rolled_back / total) > float(exp["maxRolledBackRowFraction"]):
    raise SystemExit(f"rolled_back fraction {rolled_back}/{total} exceeds contract")
print("ledger_ok", distinct_ok, rolled_back)
PY
  } || pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "prisma ledger contract check failed"
}

pdb_guard_assert_production_vps_target() {
  local url="${1:-${DATABASE_URL:-}}"
  local profile
  profile="$(pdb_guard_profile)"
  if [[ "$profile" != "production_vps" && ! pdb_guard_is_vps_production_context ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production VPS target assertion requires production_vps profile or VPS marker"
  fi

  local prod_name
  prod_name="$(python3 - "$_GUARD_CONTRACT" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["productionDatabaseName"])
PY
)"
  local user host port db schema _pw
  IFS=$'\t' read -r user host port db schema _pw < <(pdb_guard_parse_database_url "$url")
  if [[ "$db" != "$prod_name" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production deploy DATABASE_URL database must be ${prod_name} (got ${db})"
  fi
  case "${host,,}" in
    localhost|127.0.0.1|::1) ;;
    *)
      pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production deploy DATABASE_URL host must be local socket/TCP (got ${host})"
      ;;
  esac
  if [[ "$schema" != "public" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_IDENTITY" "production deploy schema must be public (got ${schema})"
  fi

  pdb_guard_assert_no_destructive_recovery_flags
  pdb_guard_assert_runtime_matches_live_fingerprint "$url" >/dev/null
  pdb_guard_assert_live_schema_contract "$db"
}

pdb_guard_assert_migration_deploy_authority() {
  if [[ "${SYNQDRIVE_MIGRATION_AUTHORITY:-}" != "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migrate deploy on production requires deploy pipeline authority"
  fi
  pdb_guard_assert_migration_authority_stamp "${DATABASE_URL:-}"
}

pdb_guard_assert_migration_resolve_authority() {
  if [[ "${SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED:-}" != "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migrate resolve on production requires SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED=1"
  fi
  if [[ "${SYNQDRIVE_MIGRATION_AUTHORITY:-}" == "1" ]]; then
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "migrate resolve cannot run under normal deploy migration authority"
  fi
}

pdb_guard_prisma_argv_destructive() {
  local args=("$@")
  local joined=" ${args[*]} "
  joined="${joined,,}"
  case "$joined" in
    *" migrate reset"*|*" migrate dev"*) return 0 ;;
    *" db push"*)
      if [[ "$joined" == *"force-reset"* || "$joined" == *"accept-data-loss"* ]]; then
        return 0
      fi
      ;;
  esac
  return 1
}

pdb_guard_assert_prisma_command_allowed() {
  local args=("$@")
  if pdb_guard_prisma_argv_destructive "${args[@]}"; then
    local url="${DATABASE_URL:-}"
    local db host
    db="$(pdb_guard_url_field "$url" 4 2>/dev/null || echo "")"
    host="$(pdb_guard_url_field "$url" 2 2>/dev/null || echo "")"
    if [[ -z "$db" ]]; then
      pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "destructive prisma command blocked (no DATABASE_URL)"
    fi
    if pdb_guard_database_name_is_reserved_production "$db"; then
      pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "destructive prisma command blocked for reserved database '${db}'"
    fi
    case "${host,,}" in
      localhost|127.0.0.1|::1|"")
        if pdb_guard_is_vps_production_context || [[ "$(pdb_guard_profile)" == "production_vps" ]]; then
          pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "destructive prisma command blocked in production VPS context"
        fi
        ;;
      *)
        pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "destructive prisma command blocked for non-local host ${host}"
        ;;
    esac
    if [[ "${SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA:-}" == "1" ]]; then
      pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA=1 is not an approved bypass"
    fi
    pdb_guard_die "$PDB_GUARD_EXIT_DESTRUCTIVE" "destructive prisma command blocked"
  fi

  local joined=" ${args[*]} "
  joined="${joined,,}"
  if [[ "$joined" == *" migrate deploy"* ]]; then
    local db
    db="$(pdb_guard_url_field "${DATABASE_URL:-}" 4 2>/dev/null || echo "")"
    if pdb_guard_database_name_is_reserved_production "$db" && pdb_guard_is_vps_production_context; then
      pdb_guard_assert_migration_deploy_authority
      pdb_guard_assert_production_vps_target "${DATABASE_URL:-}"
    fi
  fi
  if [[ "$joined" == *" migrate resolve"* ]]; then
    local db
    db="$(pdb_guard_url_field "${DATABASE_URL:-}" 4 2>/dev/null || echo "")"
    if pdb_guard_database_name_is_reserved_production "$db" && pdb_guard_is_vps_production_context; then
      pdb_guard_assert_migration_resolve_authority
    fi
  fi
}
