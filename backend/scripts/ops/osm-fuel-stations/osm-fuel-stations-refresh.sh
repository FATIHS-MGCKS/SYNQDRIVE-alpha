#!/usr/bin/env bash
# SynqDrive OSM fuel-station dataset refresh (Geofabrik DE → osmium filter → PostGIS).
# Fail-closed: current osm.fuel_stations is never replaced unless all validation gates pass.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

GEOFABRIK_URL="${OSM_FUEL_GEOFABRIK_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
GEOFABRIK_SHA256_URL="${OSM_FUEL_GEOFABRIK_SHA256_URL:-${GEOFABRIK_URL}.sha256}"
WORK_ROOT="${OSM_FUEL_WORK_DIR:-/var/tmp/synqdrive-osm-fuel}"
MIN_FREE_GB="${OSM_FUEL_MIN_FREE_GB:-10}"
MIN_AVAIL_MEM_MB="${OSM_FUEL_MIN_AVAIL_MEM_MB:-1024}"
HEALTH_URL="${OSM_FUEL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
SKIP_HEALTH="${OSM_FUEL_SKIP_HEALTH:-0}"
SKIP_DOWNLOAD="${OSM_FUEL_SKIP_DOWNLOAD:-0}"
KEEP_FILTERED="${OSM_FUEL_KEEP_FILTERED:-0}"

log() { printf '[osm-fuel-refresh] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

load_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  if [[ -n "${OSM_FUEL_DATABASE_URL:-}" ]]; then
    DATABASE_URL="$OSM_FUEL_DATABASE_URL"
    export DATABASE_URL
    return 0
  fi
  local backend_env="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  if [[ -r "$backend_env" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$backend_env"
    set +a
    export DATABASE_URL
  elif [[ -r "/opt/synqdrive/shared/backend.env" ]] || sudo test -r "/opt/synqdrive/shared/backend.env" 2>/dev/null; then
    DATABASE_URL="$(sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; printf "%s" "$DATABASE_URL"')"
    export DATABASE_URL
  fi
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set (export or set BACKEND_ENV)"
  # Prisma URLs include ?schema=public — strip for psql/libpq.
  DATABASE_URL="${DATABASE_URL%%\?*}"
  export DATABASE_URL
}

check_resources() {
  local free_kb avail_mb disk_pct
  free_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
  avail_mb="$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
  disk_pct="$(df / | tail -1 | awk '{print $5}' | tr -d '%')"
  log "disk free: $((free_kb / 1024 / 1024)) GB (${disk_pct}% used on /)"
  log "mem available: ${avail_mb} MB"
  if [[ "$free_kb" -lt $((MIN_FREE_GB * 1024 * 1024)) ]]; then
    die "insufficient disk (need >= ${MIN_FREE_GB} GB free on /)"
  fi
  if [[ "$avail_mb" -lt "$MIN_AVAIL_MEM_MB" ]]; then
    die "insufficient RAM (need >= ${MIN_AVAIL_MEM_MB} MB MemAvailable)"
  fi
}

check_health() {
  if [[ "$SKIP_HEALTH" == "1" ]]; then
    log "skipping health check (OSM_FUEL_SKIP_HEALTH=1)"
    return 0
  fi
  curl -sf --max-time 15 "$HEALTH_URL" >/dev/null || die "application health check failed: $HEALTH_URL"
  log "application health OK"
}

dataset_version() {
  date -u +geofabrik-germany-%Y%m%d
}

run_psql() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

run_psql_file() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"
}

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

verify_geofabrik_checksum() {
  local pbf="$1"
  local expected actual
  if ! curl -sfL --max-time 120 "$GEOFABRIK_SHA256_URL" -o "${WORK_DIR}/germany-latest.osm.pbf.sha256"; then
    log "WARN: could not download Geofabrik sha256 sidecar — continuing with size/osmium checks only"
    return 0
  fi
  expected="$(awk '{print $1}' "${WORK_DIR}/germany-latest.osm.pbf.sha256")"
  actual="$(sha256_file "$pbf")"
  if [[ "$expected" != "$actual" ]]; then
    die "PBF sha256 mismatch (expected ${expected}, got ${actual})"
  fi
  log "PBF sha256 verified against Geofabrik sidecar"
}

download_pbf() {
  local dest="$1"
  local tmp="${dest}.partial"
  log "downloading ${GEOFABRIK_URL}"
  rm -f "$tmp"
  if ! curl -fL --retry 3 --retry-delay 5 --max-time 7200 \
    -o "$tmp" \
    -w 'http_code=%{http_code} size=%{size_download}\n' \
    "$GEOFABRIK_URL" | tee "${WORK_DIR}/download.meta"; then
    die "download failed"
  fi
  local size
  size="$(stat -c%s "$tmp")"
  [[ "$size" -gt 1000000 ]] || die "downloaded file too small (${size} bytes)"
  mv "$tmp" "$dest"
  log "download complete: ${size} bytes"
  verify_geofabrik_checksum "$dest"
  osmium fileinfo -e "$dest" >/dev/null || die "osmium fileinfo failed on downloaded PBF"
}

filter_fuel_pbf() {
  local src="$1" dest="$2"
  log "filtering fuel stations (nwr/amenity=fuel, referenced nodes retained)"
  osmium tags-filter "$src" nwr/amenity=fuel -o "$dest" --overwrite
  local fsize
  fsize="$(stat -c%s "$dest")"
  [[ "$fsize" -gt 1000 ]] || die "filtered PBF too small"
  log "filtered PBF size: ${fsize} bytes"
  osmium check-refs "$dest" || die "osmium check-refs failed — aborting (live dataset untouched)"
  osmium fileinfo -e "$dest" | tee "${WORK_DIR}/filtered-fileinfo.txt"
}

insert_metadata_staging() {
  local version="$1" station_count="$2" downloaded_at="$3"
  local source_sha filtered_sha
  source_sha="$(sha256_file "${WORK_DIR}/germany-latest.osm.pbf" 2>/dev/null || echo '')"
  filtered_sha="$(sha256_file "${WORK_DIR}/germany-fuel.osm.pbf")"
  run_psql -c "TRUNCATE osm.dataset_metadata_staging;"
  run_psql -c "
    INSERT INTO osm.dataset_metadata_staging (
      dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
      station_count, downloaded_at, imported_at, is_current
    ) VALUES (
      '${version}',
      '${GEOFABRIK_URL}',
      NULLIF('${source_sha}', ''),
      '${filtered_sha}',
      ${station_count},
      '${downloaded_at}'::timestamptz,
      now(),
      false
    );
  "
}

main() {
  require_cmd curl
  require_cmd osmium
  require_cmd psql
  require_cmd python3
  require_cmd sha256sum
  python3 -c 'import osmium, psycopg2' 2>/dev/null \
    || die 'install python3-pyosmium and python3-psycopg2 (apt install python3-pyosmium python3-psycopg2)'

  load_database_url
  check_resources
  check_health

  local version downloaded_at
  version="$(dataset_version)"
  downloaded_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  WORK_DIR="${WORK_ROOT}/${version}"
  mkdir -p "$WORK_DIR"

  log "dataset version: ${version}"
  log "work directory: ${WORK_DIR}"

  log "applying schema (idempotent)"
  run_psql_file "${SCRIPT_DIR}/schema.sql"

  local pbf="${WORK_DIR}/germany-latest.osm.pbf"
  local filtered="${WORK_DIR}/germany-fuel.osm.pbf"

  if [[ "$SKIP_DOWNLOAD" == "1" && -f "$filtered" ]]; then
    log "OSM_FUEL_SKIP_DOWNLOAD=1 and filtered PBF exists — reusing ${filtered}"
  else
    download_pbf "$pbf"
    filter_fuel_pbf "$pbf" "$filtered"
    log "deleting full Germany PBF to reclaim disk"
    rm -f "$pbf" "${WORK_DIR}/germany-latest.osm.pbf.sha256"
  fi

  log "importing into osm.fuel_stations_staging"
  PYTHONPATH="$LIB_DIR" python3 "${LIB_DIR}/fuel_station_importer.py" \
    --pbf "$filtered" \
    --dataset-version "$version" \
    --database-url "$DATABASE_URL"

  local station_count
  station_count="$(run_psql -tAc 'SELECT COUNT(*) FROM osm.fuel_stations_staging;')"
  log "staging row count: ${station_count}"

  insert_metadata_staging "$version" "$station_count" "$downloaded_at"

  log "building staging GiST indexes"
  run_psql_file "${SCRIPT_DIR}/build_staging_indexes.sql"

  log "running validation gates"
  if ! PYTHONPATH="$LIB_DIR" python3 "${LIB_DIR}/validate_dataset.py" \
    --dataset-version "$version" \
    --database-url "$DATABASE_URL" \
    --json-out "${WORK_DIR}/validation-report.json"; then
    die "validation failed — live dataset untouched (see ${WORK_DIR}/validation-report.json)"
  fi

  log "atomic promotion"
  run_psql_file "${SCRIPT_DIR}/promote.sql"

  if [[ "$KEEP_FILTERED" != "1" ]]; then
    log "cleaning filtered PBF artifact"
    rm -f "$filtered"
  fi

  log "refresh complete: version=${version} stations=${station_count}"
  log "retention: osm.fuel_stations_old kept for manual 24h cleanup"
}

main "$@"
