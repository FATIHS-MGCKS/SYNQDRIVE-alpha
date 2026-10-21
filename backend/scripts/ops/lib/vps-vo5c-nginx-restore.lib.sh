#!/usr/bin/env bash
# R2.7b — Strict nginx golden restore + post-restore verification.
set -euo pipefail

# Returns 0 only when backup restored, nginx -t and reload succeed.
vo5c_nginx_restore_from_backup() {
  local backup="$1"
  local site="$2"
  [[ -f "$backup" ]] || return 1
  cp -a "$backup" "$site"
  local nginx_bin="${VO5C_NGINX_CMD:-/usr/sbin/nginx}"
  local systemctl_bin="${VO5C_SYSTEMCTL_CMD:-systemctl}"
  if ! "$nginx_bin" -t; then
    return 2
  fi
  if ! "$systemctl_bin" reload nginx; then
    return 3
  fi
  return 0
}

# Confirms live site matches golden backup fingerprint (no maintenance-only config left).
vo5c_nginx_verify_restored_site() {
  local backup="$1"
  local site="$2"
  [[ -f "$backup" && -f "$site" ]] || return 1
  local b_sum s_sum
  b_sum="$(cksum "$backup" | awk '{print $1}')"
  s_sum="$(cksum "$site" | awk '{print $1}')"
  [[ "$b_sum" == "$s_sum" ]] || return 2
  return 0
}
