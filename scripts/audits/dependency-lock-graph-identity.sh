#!/usr/bin/env bash
# Shared dependency graph identity (lockfile authority).
# Sourced by audit-dependencies.sh and test harnesses.

compute_lockfile_sha256() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "FAIL_CLOSED: missing dependency graph lockfile: ${path}" >&2
    return 2
  fi
  sha256sum "$path" | awk '{print $1}'
}

# Args: base_backend_lock head_backend_lock base_frontend_lock head_frontend_lock
# Sets SHA256 / DEPENDENCY_GRAPH_CHANGED in caller scope; prints KEY=value for CI logs.
emit_dependency_graph_identity() {
  local base_backend="$1"
  local head_backend="$2"
  local base_frontend="$3"
  local head_frontend="$4"

  local base_be_sha head_be_sha base_fe_sha head_fe_sha
  base_be_sha="$(compute_lockfile_sha256 "$base_backend")" || return 2
  head_be_sha="$(compute_lockfile_sha256 "$head_backend")" || return 2
  base_fe_sha="$(compute_lockfile_sha256 "$base_frontend")" || return 2
  head_fe_sha="$(compute_lockfile_sha256 "$head_frontend")" || return 2

  if [[ "$base_be_sha" == "$head_be_sha" ]]; then
    BACKEND_DEPENDENCY_GRAPH_CHANGED=NO
  else
    BACKEND_DEPENDENCY_GRAPH_CHANGED=YES
  fi
  if [[ "$base_fe_sha" == "$head_fe_sha" ]]; then
    FRONTEND_DEPENDENCY_GRAPH_CHANGED=NO
  else
    FRONTEND_DEPENDENCY_GRAPH_CHANGED=YES
  fi
  if [[ "$BACKEND_DEPENDENCY_GRAPH_CHANGED" == NO && "$FRONTEND_DEPENDENCY_GRAPH_CHANGED" == NO ]]; then
    DEPENDENCY_GRAPH_CHANGED=NO
  else
    DEPENDENCY_GRAPH_CHANGED=YES
  fi

  BASE_BACKEND_LOCK_SHA256="$base_be_sha"
  HEAD_BACKEND_LOCK_SHA256="$head_be_sha"
  BASE_FRONTEND_LOCK_SHA256="$base_fe_sha"
  HEAD_FRONTEND_LOCK_SHA256="$head_fe_sha"

  echo "BASE_BACKEND_LOCK_SHA256=${BASE_BACKEND_LOCK_SHA256}"
  echo "HEAD_BACKEND_LOCK_SHA256=${HEAD_BACKEND_LOCK_SHA256}"
  echo "BASE_FRONTEND_LOCK_SHA256=${BASE_FRONTEND_LOCK_SHA256}"
  echo "HEAD_FRONTEND_LOCK_SHA256=${HEAD_FRONTEND_LOCK_SHA256}"
  echo "BACKEND_DEPENDENCY_GRAPH_CHANGED=${BACKEND_DEPENDENCY_GRAPH_CHANGED}"
  echo "FRONTEND_DEPENDENCY_GRAPH_CHANGED=${FRONTEND_DEPENDENCY_GRAPH_CHANGED}"
  echo "DEPENDENCY_GRAPH_CHANGED=${DEPENDENCY_GRAPH_CHANGED}"
}
