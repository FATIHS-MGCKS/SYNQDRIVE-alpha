#!/usr/bin/env bash
set -euo pipefail
echo "=== preflight ==="
df -h / | tail -1
free -h | head -2
curl -sf https://app.synqdrive.eu/api/v1/health
echo
chmod +x /tmp/osm-fuel-stations/osm-fuel-stations-refresh.sh
DISK_BEFORE="$(df -h / | tail -1)"
START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"
/usr/bin/time -f "ELAPSED_SEC=%e MAX_RSS_KB=%M" sudo bash /tmp/osm-fuel-stations/osm-fuel-stations-refresh.sh 2>&1 | tee "/tmp/osm-fuel-refresh-$(date -u +%Y%m%d).log"
END_EPOCH="$(date +%s)"
DISK_AFTER="$(df -h / | tail -1)"
echo "START_TS=$START_TS"
echo "DURATION_SEC=$((END_EPOCH-START_EPOCH))"
echo "DISK_BEFORE=$DISK_BEFORE"
echo "DISK_AFTER=$DISK_AFTER"
curl -sf https://app.synqdrive.eu/api/v1/health
echo
