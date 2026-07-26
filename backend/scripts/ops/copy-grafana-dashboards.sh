#!/usr/bin/env bash
# Copy all SynqDrive Grafana dashboard JSON files to the VPS dashboard directory.
# Usage: copy_grafana_dashboards "$SRC_GRAFANA/dashboards" "$GRAFANA_DIR/dashboards"
set -euo pipefail

SRC_DIR="${1:?source dashboards dir}"
DEST_DIR="${2:?destination dashboards dir}"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: dashboard source not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
shopt -s nullglob
count=0
for file in "$SRC_DIR"/*.json; do
  cp "$file" "$DEST_DIR/"
  count=$((count + 1))
done
shopt -u nullglob

if [[ "$count" -eq 0 ]]; then
  echo "ERROR: no dashboard JSON files in $SRC_DIR" >&2
  exit 1
fi

echo "Copied $count Grafana dashboard(s) to $DEST_DIR"
