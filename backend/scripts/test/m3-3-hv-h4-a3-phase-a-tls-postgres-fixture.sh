#!/usr/bin/env bash
# Generates ephemeral test CA/server TLS material and starts PostgreSQL 16 with SSL on localhost:5433.
# Private keys never leave the runner workspace and are gitignored (.phase-a-tls-fixture/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE_DIR="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DIR:-$ROOT/.phase-a-tls-fixture}"
CONTAINER_NAME="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_CONTAINER:-phase_a_tls_postgres_ci}"
PG_PORT="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PORT:-5433}"
PG_USER="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_USER:-synqdrive}"
PG_PASSWORD="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PASSWORD:-synqdrive}"
PG_DB="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DB:-synqdrive}"

log() { printf '[phase-a-tls-postgres-fixture] %s\n' "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "missing required command: $1" >&2
    exit 1
  }
}

require_cmd openssl
require_cmd docker
if ! docker info >/dev/null 2>&1; then
  log "docker daemon is not available" >&2
  exit 1
fi

mkdir -p "$FIXTURE_DIR/trusted-ca" "$FIXTURE_DIR/wrong-ca" "$FIXTURE_DIR/server-valid" "$FIXTURE_DIR/server-bad-host" "$FIXTURE_DIR/server-expired"

gen_ca() {
  local dir="$1"
  local cn="$2"
  openssl req -new -x509 -days 3650 -nodes -text \
    -subj "/CN=${cn}" \
    -keyout "$dir/ca.key" -out "$dir/ca.crt" 2>/dev/null
}

gen_server() {
  local ca_dir="$1"
  local out_dir="$2"
  local cn="$3"
  local san="$4"
  local days="$5"
  local cfg
  cfg="$(mktemp)"
  cat >"$cfg" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = ${cn}
[v3_req]
subjectAltName = ${san}
EOF
  openssl req -new -nodes -text -subj "/CN=${cn}" -keyout "$out_dir/server.key" -out "$out_dir/server.csr" 2>/dev/null
  openssl x509 -req -in "$out_dir/server.csr" -CA "$ca_dir/ca.crt" -CAkey "$ca_dir/ca.key" -CAcreateserial \
    -out "$out_dir/server.crt" -days "$days" -extensions v3_req -extfile "$cfg" 2>/dev/null
  rm -f "$cfg" "$out_dir/server.csr"
  chmod 600 "$out_dir/server.key"
}

log "generating trusted CA + valid server cert (SAN=DNS:localhost,IP:127.0.0.1)"
gen_ca "$FIXTURE_DIR/trusted-ca" "PhaseA-TLS-Test-CA"
gen_server "$FIXTURE_DIR/trusted-ca" "$FIXTURE_DIR/server-valid" "localhost" "DNS:localhost,IP:127.0.0.1" 825

log "generating wrong CA (untrusted root for negative client tests)"
gen_ca "$FIXTURE_DIR/wrong-ca" "PhaseA-TLS-Wrong-CA"

log "generating bad-host server cert (no 127.0.0.1 SAN)"
gen_server "$FIXTURE_DIR/trusted-ca" "$FIXTURE_DIR/server-bad-host" "wronghost.example" "DNS:wronghost.example" 825

log "generating expired server cert"
exp_cfg="$(mktemp)"
cat >"$exp_cfg" <<'EOF'
[req]
distinguished_name = dn
req_extensions = v3_req
prompt = no
[dn]
CN = localhost
[v3_req]
subjectAltName = DNS:localhost,IP:127.0.0.1
EOF
if command -v faketime >/dev/null 2>&1; then
  faketime '2020-06-01 00:00:00' openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 30 \
    -keyout "$FIXTURE_DIR/server-expired/server.key" \
    -out "$FIXTURE_DIR/server-expired/server.crt" \
    -config "$exp_cfg" -extensions v3_req 2>/dev/null
else
  log "faketime unavailable — writing short-lived expired self-signed cert via dated CSR"
  openssl req -new -newkey rsa:2048 -nodes -sha256 \
    -keyout "$FIXTURE_DIR/server-expired/server.key" \
    -out "$FIXTURE_DIR/server-expired/server.csr" \
    -config "$exp_cfg" 2>/dev/null
  openssl x509 -req -in "$FIXTURE_DIR/server-expired/server.csr" \
    -CA "$FIXTURE_DIR/trusted-ca/ca.crt" -CAkey "$FIXTURE_DIR/trusted-ca/ca.key" -CAcreateserial \
    -out "$FIXTURE_DIR/server-expired/server.crt" -days 1 -extensions v3_req -extfile "$exp_cfg" 2>/dev/null || true
  rm -f "$FIXTURE_DIR/server-expired/server.csr"
fi
rm -f "$exp_cfg"
chmod 600 "$FIXTURE_DIR/server-expired/server.key"
if ! openssl x509 -checkend 0 -noout -in "$FIXTURE_DIR/server-expired/server.crt" 2>/dev/null; then
  log "expired server cert fixture is past notAfter (OK)"
else
  log "ERROR: expired server cert fixture is still valid — install faketime in CI" >&2
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

log "starting TLS PostgreSQL on port ${PG_PORT}"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DB" \
  -p "${PG_PORT}:5432" \
  -v "$FIXTURE_DIR:/tls-mount:ro" \
  postgres:16-alpine

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" >/dev/null

install_tls_material() {
  local cert_subdir="$1"
  docker exec -u root "$CONTAINER_NAME" sh -c "
    mkdir -p /var/lib/postgresql/ssl &&
    cp /tls-mount/${cert_subdir}/server.crt /var/lib/postgresql/ssl/server.crt &&
    cp /tls-mount/${cert_subdir}/server.key /var/lib/postgresql/ssl/server.key &&
    chown -R postgres:postgres /var/lib/postgresql/ssl &&
    chmod 600 /var/lib/postgresql/ssl/server.key
  "
}

install_tls_material server-valid
docker exec -u root "$CONTAINER_NAME" sh -c "grep -q '^ssl = on' /var/lib/postgresql/data/postgresql.conf || printf '%s\n' 'ssl = on' 'ssl_cert_file = '\''/var/lib/postgresql/ssl/server.crt'\''' 'ssl_key_file = '\''/var/lib/postgresql/ssl/server.key'\''' >> /var/lib/postgresql/data/postgresql.conf"
docker exec -u root "$CONTAINER_NAME" sh -c "printf '%s\n' 'hostnossl all all all reject' 'hostssl all all all scram-sha-256' >> /var/lib/postgresql/data/pg_hba.conf"
docker restart "$CONTAINER_NAME" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" >/dev/null

TRUSTED_CA="$FIXTURE_DIR/trusted-ca/ca.crt"
TLS_DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}?sslmode=verify-full&sslrootcert=${TRUSTED_CA}"

export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_ACTIVE=1
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DIR="$FIXTURE_DIR"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_TRUSTED_CA="$TRUSTED_CA"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_WRONG_CA="$FIXTURE_DIR/wrong-ca/ca.crt"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_BAD_HOST_CERT_DIR="$FIXTURE_DIR/server-bad-host"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_EXPIRED_CERT_DIR="$FIXTURE_DIR/server-expired"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DATABASE_URL="$TLS_DATABASE_URL"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PORT="$PG_PORT"

log "applying Prisma migrations to TLS fixture database"
cd "$ROOT"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 DATABASE_URL="$TLS_DATABASE_URL" bash scripts/test/prisma-migrate-deploy-resilient.sh

cat >"$FIXTURE_DIR/fixture.env" <<EOF
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_ACTIVE=1
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DIR="$FIXTURE_DIR"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_TRUSTED_CA="$TRUSTED_CA"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_WRONG_CA="$FIXTURE_DIR/wrong-ca/ca.crt"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DATABASE_URL="$TLS_DATABASE_URL"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PORT="$PG_PORT"
export M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_CONTAINER="$CONTAINER_NAME"
EOF

log "TLS fixture ready: ${TLS_DATABASE_URL%%@*}@127.0.0.1:${PG_PORT}/${PG_DB}?sslmode=verify-full&sslrootcert=..."
