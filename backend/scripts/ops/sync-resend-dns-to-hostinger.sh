#!/usr/bin/env bash
# Merge Resend DNS records (DKIM/SPF/MX on send.*) into Hostinger DNS for synqdrive.eu.
#
# Requires:
#   RESEND_API_KEY — Resend API key (domain must exist in Resend)
#   HOSTINGER_API_TOKEN or API_TOKEN — Hostinger hPanel API token
#
# Usage:
#   bash backend/scripts/ops/sync-resend-dns-to-hostinger.sh
#   RESEND_DNS_DOMAIN=synqdrive.eu bash backend/scripts/ops/sync-resend-dns-to-hostinger.sh
#
# Optional:
#   RESEND_DNS_VERIFY=1  — trigger Resend domain verify after DNS merge (default: 1)
set -euo pipefail

DOMAIN="${RESEND_DNS_DOMAIN:-synqdrive.eu}"
HOSTINGER_TOKEN="${HOSTINGER_API_TOKEN:-${API_TOKEN:-}}"
RESEND_KEY="${RESEND_API_KEY:-}"
VERIFY="${RESEND_DNS_VERIFY:-1}"

if [[ -z "$HOSTINGER_TOKEN" ]]; then
  echo "ERROR: HOSTINGER_API_TOKEN (or API_TOKEN) not set" >&2
  exit 1
fi
if [[ -z "$RESEND_KEY" ]]; then
  echo "ERROR: RESEND_API_KEY not set" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "${ROOT}/scripts/ops/sync-resend-dns-to-hostinger.py" "$DOMAIN" "$VERIFY"
