# CI service container images

GitHub-hosted runners pull workflow `services:` images without Docker Hub credentials. Unauthenticated Docker Hub pulls are subject to strict rate limits (`toomanyrequests`), which fails jobs during **Initialize containers** before application tests run.

## Canonical mirrors (no secrets)

Use the [Amazon ECR Public Gallery](https://gallery.ecr.aws/) mirrors of the official Docker Library images:

| Role | Image |
|------|--------|
| PostgreSQL 16 (Alpine) | `public.ecr.aws/docker/library/postgres:16-alpine` |
| PostgreSQL 16 (Alpine) fallback | `ghcr.io/docker-library/postgres:16-alpine` |
| Redis 7 (Alpine) | `public.ecr.aws/docker/library/redis:7-alpine` |

These are the same upstream tags as `postgres:16-alpine` and `redis:7-alpine` on Docker Hub. Keep existing `POSTGRES_*` env, ports, and `--health-cmd` options unchanged.

When ECR Public returns `toomanyrequests: Data limit exceeded` during **Initialize containers**, switch the affected workflow’s `services.postgres.image` to the GHCR fallback above (no application test changes). Prefer ECR when pulls succeed; use GHCR only for CI service containers that hit the ECR data cap.

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
