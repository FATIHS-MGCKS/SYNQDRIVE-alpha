# CI PostgreSQL registry fallback (2026-10-13)

## Problem

GitHub Actions `services.postgres` with `public.ecr.aws/docker/library/postgres:16-alpine` failed before tests with:

`toomanyrequests: Data limit exceeded`

Affected PR #2008 jobs (infra only): EXP-021 short A/B PostgreSQL, Battery D3/F4.1 longitudinal PostgreSQL, Legal backend integration + migration PostgreSQL, VO-2 persistence PostgreSQL, S4 PostgreSQL suites (registry lifecycle + race tests), Trip FSM shadow postgres+redis (same ECR `toomanyrequests` failure).

## Mitigation

`backend/scripts/test/ci-start-postgres.sh` pulls in order:

1. `public.ecr.aws/docker/library/postgres:16-alpine`
2. `mirror.gcr.io/library/postgres:16-alpine`
3. `postgres:16-alpine`

Workflow jobs start Postgres via `docker run` on the runner (same credentials / `DATABASE_URL` as before). `vo5b-ci-start-postgres.sh` delegates to this script.

## Non-effects

- No production, allowlist, kill, or EXP021 runtime changes.
- Test commands and DB security fail-closed checks unchanged.
