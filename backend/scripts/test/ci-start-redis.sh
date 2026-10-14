#!/usr/bin/env bash
# Ephemeral Redis for CI when workflow service-container ECR pulls hit registry limits.
# Pull order: Amazon ECR Public → mirror.gcr.io → Docker Hub (same as ci-start-postgres.sh).
set -euo pipefail

CONTAINER_NAME="${CI_REDIS_CONTAINER:-ci-redis}"
REDIS_PORT="${CI_REDIS_PORT:-6379}"

images=(
  "public.ecr.aws/docker/library/redis:7-alpine"
  "mirror.gcr.io/library/redis:7-alpine"
  "redis:7-alpine"
)

docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

pulled=""
for img in "${images[@]}"; do
  echo "CI redis: pulling ${img}..."
  if docker pull "${img}"; then
    pulled="${img}"
    break
  fi
  echo "CI redis: pull failed for ${img}, trying next mirror..."
done

if [ -z "${pulled}" ]; then
  echo "CI redis: all Redis image pulls failed"
  exit 1
fi

docker run -d --name "${CONTAINER_NAME}" \
  -p "${REDIS_PORT}:6379" \
  "${pulled}"

# Match workflow service health: redis-cli ping, 5s interval, 10 retries.
for _ in $(seq 1 10); do
  if docker exec "${CONTAINER_NAME}" redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "CI redis: ready (${pulled}) port=${REDIS_PORT}"
    exit 0
  fi
  sleep 5
done

echo "CI redis: failed to become ready"
docker logs "${CONTAINER_NAME}" || true
exit 1
