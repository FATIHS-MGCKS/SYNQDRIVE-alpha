# CI service container images

GitHub-hosted runners pull workflow `services:` images without Docker Hub credentials. Unauthenticated Docker Hub pulls are subject to strict rate limits (`toomanyrequests`), which fails jobs during **Initialize containers** before application tests run.

## Canonical mirrors (no secrets)

Use the [Amazon ECR Public Gallery](https://gallery.ecr.aws/) mirrors of the official Docker Library images:

| Role | Image |
|------|--------|
| PostgreSQL 16 (Alpine) | `public.ecr.aws/docker/library/postgres:16-alpine` |
| Redis 7 (Alpine) | `public.ecr.aws/docker/library/redis:7-alpine` |

These are the same upstream tags as `postgres:16-alpine` and `redis:7-alpine` on Docker Hub. Keep existing `POSTGRES_*` env, ports, and `--health-cmd` options unchanged.

## When adding workflows

Do not reference bare `postgres:16-alpine` or `redis:7-alpine` in GitHub Actions service containers. Use the ECR Public paths above (or extend this document if a new major version is required).
