#!/usr/bin/env bash
# Canonical ephemeral CI PostgreSQL URL (non-production database name).
set -euo pipefail

CI_PG_USER="${CI_PG_USER:-synqdrive}"
CI_PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
CI_PG_DB="${CI_PG_DB:-synqdrive_ci_ephemeral}"
CI_PG_PORT="${CI_PG_PORT:-5432}"
CI_PG_HOST="${CI_PG_HOST:-127.0.0.1}"

export CI_PG_USER CI_PG_PASSWORD CI_PG_DB CI_PG_PORT CI_PG_HOST
export DATABASE_URL="postgresql://${CI_PG_USER}:${CI_PG_PASSWORD}@${CI_PG_HOST}:${CI_PG_PORT}/${CI_PG_DB}?schema=public"
