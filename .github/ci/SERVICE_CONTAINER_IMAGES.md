# CI service container images

GitHub-hosted runners pull workflow `services:` images without Docker Hub credentials. Unauthenticated Docker Hub pulls are subject to strict rate limits (`toomanyrequests`), which fails jobs during **Initialize containers** before application tests run.

## Canonical mirrors (no secrets)

Use official Docker Library images via a **rate-limit-resistant** public mirror (not bare Docker Hub on GitHub-hosted runners).

| Role | Primary image (workflows) | Alternate |
|------|-------------------------|-----------|
| PostgreSQL 16 (Alpine) | `mirror.gcr.io/library/postgres:16-alpine` | `public.ecr.aws/docker/library/postgres:16-alpine` |
| Redis 7 (Alpine) | `public.ecr.aws/docker/library/redis:7-alpine` | — |

`mirror.gcr.io` serves the same `library/postgres` tags as Docker Hub and avoids both Docker Hub anonymous limits and intermittent ECR Public `toomanyrequests: Data limit exceeded` during **Initialize containers**.

Keep existing `POSTGRES_*` env, ports, and `--health-cmd` options unchanged.

## When adding workflows

Do not reference bare `postgres:16-alpine` or `redis:7-alpine` in GitHub Actions service containers. Use the primary paths above (or extend this document if a new major version is required).

## Nested `docker run` in CI fixture scripts

Some integration tests start a **second** database container from shell (for example TLS on a non-default port) in addition to the workflow `services:` Postgres on 5432. Those `docker run` invocations hit the same Docker Hub rate limits.

Use the same ECR Public image variables in scripts, for example:

```bash
PG_IMAGE="${M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_PG_IMAGE:-public.ecr.aws/docker/library/postgres:16-alpine}"
docker run -d ... "$PG_IMAGE"
```

Canonical script: `backend/scripts/test/m3-3-hv-h4-a3-phase-a-tls-postgres-fixture.sh` (port 5433, SSL fixtures unchanged).
