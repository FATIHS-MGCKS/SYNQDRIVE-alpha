#!/usr/bin/env bash
# Ephemeral PostgreSQL for VO-5B CI when workflow service-container pulls hit registry limits.
set -euo pipefail

CONTAINER_NAME="${VO5B_CI_PG_CONTAINER:-vo5b-ci-postgres}"
PG_USER="${VO5B_PG_USER:-synqdrive}"
PG_PASSWORD="${VO5B_PG_PASSWORD:-synqdrive}"
PG_DB="${VO5B_PG_DB:-synqdrive}"
PG_PORT="${VO5B_PG_PORT:-5432}"

images=(
  "public.ecr.aws/docker/library/postgres:16-alpine"
  "mirror.gcr.io/library/postgres:16-alpine"
  "postgres:16-alpine"
)

docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

pulled=""
for img in "${images[@]}"; do
  echo "VO5B CI: pulling ${img}..."
  if docker pull "${img}"; then
    pulled="${img}"
    break
  fi
  echo "VO5B CI: pull failed for ${img}, trying next mirror..."
done

if [ -z "${pulled}" ]; then
  echo "VO5B CI: all PostgreSQL image pulls failed"
  exit 1
fi

docker run -d --name "${CONTAINER_NAME}" \
  -e "POSTGRES_USER=${PG_USER}" \
  -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
  -e "POSTGRES_DB=${PG_DB}" \
  -p "${PG_PORT}:5432" \
  "${pulled}"

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${PG_USER}" >/dev/null 2>&1; then
    echo "VO5B CI: PostgreSQL ready (${pulled})"
    exit 0
  fi
  sleep 2
done

echo "VO5B CI: PostgreSQL failed to become ready"
docker logs "${CONTAINER_NAME}" || true
exit 1
