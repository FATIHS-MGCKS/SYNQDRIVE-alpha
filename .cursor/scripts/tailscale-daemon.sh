#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${HOME}/.cursor-tailscale"
mkdir -p "$STATE_DIR"
cd "$STATE_DIR"

exec tailscaled \
  --state="${STATE_DIR}/tailscaled.state" \
  --socket="${STATE_DIR}/tailscaled.sock" \
  --tun=userspace-networking \
  --outbound-http-proxy-listen=localhost:1054 \
  --socks5-server=localhost:1055
