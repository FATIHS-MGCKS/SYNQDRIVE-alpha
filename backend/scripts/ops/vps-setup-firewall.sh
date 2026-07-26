#!/usr/bin/env bash
# SynqDrive production VPS firewall (UFW) — Phase 2A.3
# - Public: HTTP/HTTPS only (+ SSH from allowlist)
# - Backend 3001, PG, Redis, ClickHouse, Prometheus, Grafana: localhost / deny inbound
#
# Run on VPS: sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-firewall.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="${SYNQDRIVE_FIREWALL_ALLOWLIST:-/opt/synqdrive/shared/firewall/ssh-allowlist.txt}"
LOG_DIR="/opt/synqdrive/shared/backups"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${LOG_DIR}/firewall-setup-${TS}.log"

mkdir -p "$(dirname "$ALLOWLIST")" "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== SynqDrive firewall setup ${TS} ==="

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

# Seed allowlist with current SSH client when present
CLIENT_IP="${SYNQDRIVE_FIREWALL_SSH_IP:-}"
if [[ -z "$CLIENT_IP" && -n "${SSH_CLIENT:-}" ]]; then
  CLIENT_IP="$(awk '{print $1}' <<<"$SSH_CLIENT")"
fi
if [[ -n "$CLIENT_IP" ]]; then
  bash "$SCRIPT_DIR/vps-firewall-allow-ssh.sh" "$CLIENT_IP"
fi

test_connectivity() {
  local phase="$1"
  echo ""
  echo "--- Tests after: ${phase} ---"
  local fail=0

  curl -sf --max-time 5 http://127.0.0.1:3001/api/v1/health >/dev/null && echo "OK  backend health (localhost)" || { echo "FAIL backend health"; fail=1; }
  curl -sf --max-time 10 https://app.synqdrive.eu/api/v1/health >/dev/null && echo "OK  public health HTTPS" || { echo "FAIL public health"; fail=1; }

  if command -v pm2 >/dev/null 2>&1; then
    pm2 list 2>/dev/null | grep -q online && echo "OK  PM2 online" || { echo "FAIL PM2"; fail=1; }
  fi

  if command -v docker >/dev/null 2>&1; then
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q clickhouse && echo "OK  Docker clickhouse" || { echo "FAIL Docker"; fail=1; }
  fi

  redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -q PONG && echo "OK  Redis localhost" || { echo "FAIL Redis"; fail=1; }
  sudo -u postgres psql -d synqdrive -tAc 'SELECT 1' 2>/dev/null | grep -q 1 && echo "OK  PostgreSQL localhost" || { echo "FAIL PostgreSQL"; fail=1; }
  curl -sf --max-time 3 http://127.0.0.1:9090/-/healthy >/dev/null && echo "OK  Prometheus localhost" || { echo "FAIL Prometheus"; fail=1; }
  curl -sf --max-time 3 http://127.0.0.1:3000/api/health >/dev/null && echo "OK  Grafana localhost" || echo "WARN Grafana health (optional)"
  clickhouse-client --host 127.0.0.1 --query 'SELECT 1' 2>/dev/null | grep -q 1 && echo "OK  ClickHouse localhost" || \
    docker exec synqdrive-clickhouse clickhouse-client --query 'SELECT 1' 2>/dev/null | grep -q 1 && echo "OK  ClickHouse (docker)" || { echo "FAIL ClickHouse"; fail=1; }

  return "$fail"
}

echo ""
echo "=== BEFORE: listening (public) ==="
ss -tlnp | awk 'NR==1 || ($0 !~ /127\.0\.0\.1|\[::1\]/)' || true
ufw status verbose 2>/dev/null || echo "UFW: inactive"

test_connectivity "baseline (pre-UFW)" || true

echo ""
echo "=== Phase 1: UFW defaults (not enabled yet) ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed
test_connectivity "phase 1 defaults" || true

echo ""
echo "=== Phase 2: loopback + HTTP/S ==="
ufw allow in on lo comment 'loopback'
ufw allow 80/tcp comment 'HTTP public'
ufw allow 443/tcp comment 'HTTPS public'
test_connectivity "phase 2 http" || true

echo ""
echo "=== Phase 3: SSH allowlist ==="
touch "$ALLOWLIST"
chmod 600 "$ALLOWLIST"
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" ]] && continue
  if [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    line="${line}/32"
  fi
  ufw allow from "$line" to any port 22 proto tcp comment "SSH ${line}"
  echo "SSH allow: $line"
done <"$ALLOWLIST"

if ! grep -qvE '^\s*($|#)' "$ALLOWLIST" 2>/dev/null; then
  echo "ERROR: No SSH IPs in $ALLOWLIST — add at least one before enabling UFW" >&2
  exit 1
fi
test_connectivity "phase 3 ssh rules" || true

echo ""
echo "=== Phase 4: explicit deny internal service ports (defense in depth) ==="
for port in 3001 5432 6379 8123 9000 9090 3000 631; do
  ufw deny "$port/tcp" comment "internal-only ${port}" 2>/dev/null || true
done
test_connectivity "phase 4 deny rules" || true

echo ""
echo "=== Phase 5: enable UFW ==="
ufw --force enable
ufw status verbose
test_connectivity "phase 5 UFW enabled" || exit 1

echo ""
echo "=== AFTER: public listeners (should be 22,80,443 only) ==="
ss -tlnp | awk 'NR==1 || ($0 !~ /127\.0\.0\.1|\[::1\]/)' || true

echo ""
echo "LOG: $LOG_FILE"
echo "ALLOWLIST: $ALLOWLIST"
echo "=== Firewall setup complete ==="
