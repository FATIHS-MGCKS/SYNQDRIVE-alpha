# CI service container images

GitHub-hosted runners pull workflow `services:` images without Docker Hub credentials. Unauthenticated Docker Hub pulls are subject to strict rate limits (`toomanyrequests`), which fails jobs during **Initialize containers** before application tests run.

## Canonical mirrors (no secrets)

Use the [Amazon ECR Public Gallery](https://gallery.ecr.aws/) mirrors of the official Docker Library images:

| Role | Image |
|------|--------|
| PostgreSQL 16 (Alpine) | `public.ecr.aws/docker/library/postgres:16-alpine` |
| PostgreSQL 16 (Alpine) fallback | `mirror.gcr.io/library/postgres:16-alpine` |
| PostgreSQL 16 (Alpine) last resort | `postgres:16-alpine` (Docker Hub; rate limits may apply) |
| Redis 7 (Alpine) | `public.ecr.aws/docker/library/redis:7-alpine` |
| Redis 7 (Alpine) fallback | `mirror.gcr.io/library/redis:7-alpine` |
| Redis 7 (Alpine) last resort | `redis:7-alpine` (Docker Hub; rate limits may apply) |

These are the same upstream tags as `postgres:16-alpine` and `redis:7-alpine` on Docker Hub. Keep existing `POSTGRES_*` env, ports, and `--health-cmd` options unchanged.

When ECR Public returns `toomanyrequests: Data limit exceeded` during **Initialize containers**, prefer a step-driven start with ordered pull retries (see `backend/scripts/test/ci-start-postgres.sh`, `backend/scripts/test/ci-start-redis.sh`, and `vehicle-onboarding-vo5b-postgres-ci.yml`) instead of skipping tests.

## When adding workflows

Do not reference bare `postgres:16-alpine` or `redis:7-alpine` in GitHub Actions service containers. Use the ECR Public paths above (or extend this document if a new major version is required).

## Nested `docker run` in CI fixture scripts

Some integration tests start a **second** database container from shell (for example TLS on a non-default port) in addition to the workflow `services:` Postgres on 5432. Those `docker run` invocations hit the same Docker Hub rate limits.

Use the same ECR Public image variables in scripts, for example:

```bash
PG_IMAGE="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PG_IMAGE:-public.ecr.aws/docker/library/postgres:16-alpine}"
docker run -d ... "$PG_IMAGE"
```

Canonical script: `backend/scripts/test/m3-3-hv-h4-a3-phase-a-tls-postgres-fixture.sh` (port 5433, SSL fixtures unchanged).
