#!/usr/bin/env bash
# R2.7 — Strict nginx golden restore (no || true success masking).
set -euo pipefail

# Returns 0 only when backup restored, nginx -t and reload succeed.
vo5c_nginx_restore_from_backup() {
  local backup="$1"
  local site="$2"
  [[ -f "$backup" ]] || return 1
  cp -a "$backup" "$site"
  if ! /usr/sbin/nginx -t; then
    return 2
  fi
  if ! systemctl reload nginx; then
    return 3
  fi
  return 0
}
