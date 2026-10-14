#!/usr/bin/env bash
# VO-5B CI wrapper — delegates to ci-start-postgres.sh with VO-5B defaults.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CI_PG_CONTAINER="${VO5B_CI_PG_CONTAINER:-vo5b-ci-postgres}"
export CI_PG_USER="${VO5B_PG_USER:-synqdrive}"
export CI_PG_PASSWORD="${VO5B_PG_PASSWORD:-synqdrive}"
export CI_PG_DB="${VO5B_PG_DB:-synqdrive}"
export CI_PG_PORT="${VO5B_PG_PORT:-5432}"
exec bash "${ROOT}/ci-start-postgres.sh"
