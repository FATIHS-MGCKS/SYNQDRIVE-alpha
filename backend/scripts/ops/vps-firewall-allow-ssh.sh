#!/usr/bin/env bash
# Add an IPv4 address to the VPS SSH allowlist and UFW (idempotent).
# Usage: sudo bash vps-firewall-allow-ssh.sh <ip-or-cidr>
#        SSH_CLIENT is auto-detected when run from an SSH session without args.
set -euo pipefail

ALLOWLIST="${SYNQDRIVE_FIREWALL_ALLOWLIST:-/opt/synqdrive/shared/firewall/ssh-allowlist.txt}"
IP="${1:-${SYNQDRIVE_FIREWALL_SSH_IP:-}}"

if [[ -z "$IP" && -n "${SSH_CLIENT:-}" ]]; then
  IP="$(awk '{print $1}' <<<"$SSH_CLIENT")"
fi

if [[ -z "$IP" ]]; then
  echo "Usage: $0 <ipv4-or-cidr>  (or run from SSH with SSH_CLIENT set)" >&2
  exit 1
fi

# Normalize to /32 if plain IPv4
if [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  CIDR="${IP}/32"
else
  CIDR="$IP"
fi

mkdir -p "$(dirname "$ALLOWLIST")"
touch "$ALLOWLIST"
chmod 600 "$ALLOWLIST"
chown root:root "$ALLOWLIST"

if ! grep -qE "^${CIDR}$|^${IP}$" "$ALLOWLIST" 2>/dev/null; then
  echo "$CIDR" >>"$ALLOWLIST"
  echo "Added $CIDR to $ALLOWLIST"
else
  echo "Already in allowlist: $CIDR"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow from "$CIDR" to any port 22 proto tcp comment "SSH allowlist ${CIDR}" >/dev/null || true
  echo "UFW rule ensured for $CIDR"
fi
