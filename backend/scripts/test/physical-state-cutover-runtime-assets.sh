#!/usr/bin/env bash
# VDC RB-019 P2.5 — compiled runtime asset packaging gate.
# Ensures the shared CJS trust-root ops-lib is byte-copied into dist and loadable
# from compiled schema-validation (production boot-check contract).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

REL_DIR="src/modules/dimo/device-connection-physical-state"
DIST_DIR="dist/src/modules/dimo/device-connection-physical-state"
OPS_LIB="physical-state-cutover-evidence.ops-lib.cjs"
SCHEMA_JS="physical-state-cutover-evidence.schema-validation.js"
VERIFIER_JS="physical-state-cutover-evidence.verifier.js"

log() { printf '[physical-state-cutover-runtime-assets] %s\n' "$*"; }

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

require_dist_exists() {
  if [[ ! -f "${DIST_DIR}/${OPS_LIB}" ]]; then
    log "FAIL: missing dist runtime asset ${DIST_DIR}/${OPS_LIB}"
    exit 1
  fi
  log "dist ops-lib present"
}

require_byte_identity() {
  local src_sha dist_sha
  src_sha="$(sha256_file "${REL_DIR}/${OPS_LIB}")"
  dist_sha="$(sha256_file "${DIST_DIR}/${OPS_LIB}")"
  if [[ "$src_sha" != "$dist_sha" ]]; then
    log "FAIL: source/dist SHA-256 mismatch"
    log "  source=${src_sha}"
    log "  dist=${dist_sha}"
    exit 1
  fi
  log "source/dist SHA-256 identical (${src_sha})"
}

require_compiled_import() {
  local mod="$1"
  local label="$2"
  if [[ ! -f "${DIST_DIR}/${mod}" ]]; then
    log "FAIL: missing compiled module ${DIST_DIR}/${mod}"
    exit 1
  fi
  node -e "
    const path = require('path');
    const modPath = path.join(process.cwd(), '${DIST_DIR}/${mod}');
    require(modPath);
    console.log('import ok: ${label}');
  "
  log "compiled import PASS: ${label}"
}

log "Step 1/4: verify dist ops-lib exists"
require_dist_exists

log "Step 2/4: verify source/dist byte identity"
require_byte_identity

log "Step 3/4: compiled schema-validation runtime import"
require_compiled_import "$SCHEMA_JS" "schema-validation"

log "Step 4/4: compiled verifier runtime import"
require_compiled_import "$VERIFIER_JS" "verifier"

log "physical-state-cutover-runtime-assets gate passed"
