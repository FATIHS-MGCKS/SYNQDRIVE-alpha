#!/usr/bin/env bash
# Ephemeral PostgreSQL for CI when workflow service-container ECR pulls hit registry limits.
# Pull order: Amazon ECR Public → mirror.gcr.io → Docker Hub (same as vo5b-ci-start-postgres.sh).
set -euo pipefail

CONTAINER_NAME="${CI_PG_CONTAINER:-ci-postgres}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_DB="${CI_PG_DB:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"

images=(
  "public.ecr.aws/docker/library/postgres:16-alpine"
  "mirror.gcr.io/library/postgres:16-alpine"
  "postgres:16-alpine"
)

docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

pulled=""
for img in "${images[@]}"; do
  echo "CI postgres: pulling ${img}..."
  if docker pull "${img}"; then
    pulled="${img}"
    break
  fi
  echo "CI postgres: pull failed for ${img}, trying next mirror..."
done

if [ -z "${pulled}" ]; then
  echo "CI postgres: all PostgreSQL image pulls failed"
  exit 1
fi

docker run -d --name "${CONTAINER_NAME}" \
  -e "POSTGRES_USER=${PG_USER}" \
  -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
  -e "POSTGRES_DB=${PG_DB}" \
  -p "${PG_PORT}:5432" \
  "${pulled}"

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
    echo "CI postgres: ready (${pulled}) user=${PG_USER} db=${PG_DB} port=${PG_PORT}"
    exit 0
  fi
  sleep 2
done

echo "CI postgres: failed to become ready"
docker logs "${CONTAINER_NAME}" || true
exit 1
