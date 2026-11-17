# P3-PR3 — Core app M2M Redis rate limiting

**Date:** 2026-11-17  
**Endpoint:** `POST /api/v1/auth/core-app/token`

## Scope

- Distributed fixed-window limits via Redis `EVAL` (atomic `INCR` + `PEXPIRE`)
- Dimensions: trust-boundary IP (`req.ip` / socket — **no** `X-Forwarded-For`; `main.ts` does not set Express `trust proxy` today) and hashed client identity (SHA-256 prefix in Redis keys only)
- Missing client IP at trust boundary => fail-closed (generic auth failure)
- Enforced **before** bcrypt / Prisma in `CoreAppM2mTokenController`
- Fail-closed: Redis errors / bounded timeout (`CORE_APP_M2M_RATE_LIMIT_REDIS_TIMEOUT_MS`) => generic `Authentication failed` (no token issuance; global `RedisService` unchanged)
- Limit exceeded => HTTP **429** + `Retry-After` header
- `CORE_APP_M2M_RATE_LIMIT_ENABLED` defaults **true**; cannot be `false` while `CORE_APP_M2M_ENABLED=true` (module bootstrap)

## Independent review remediation (2026-11-17)

| Finding | Remediation |
|--------|-------------|
| F1 bounded Redis timeout | `runWithBoundedTimeout` + `CORE_APP_M2M_RATE_LIMIT_REDIS_TIMEOUT_MS` |
| F2 real Redis | `RUN_CORE_APP_M2M_REDIS_INTEGRATION=1` + `redis-memory-server` dual-connection tests |
| F3 proxy trust | Documented: no `trust proxy` / no XFF; missing IP fail-closed |

## Non-effects

- User JWT / Rental routes unchanged
- M2M defaults remain OFF; no production activation
- No Master Admin UI, no new consumer APIs

## Evidence

- `backend/src/modules/core-app-m2m/core-app-m2m-token-rate-limit.service.ts`
- `core-app-m2m-token-rate-limit.*.spec.ts`
- Memory Redis unit tests (`testing/core-app-m2m-rate-limit.memory-redis.ts`)
- Opt-in disposable Redis: `RUN_CORE_APP_M2M_REDIS_INTEGRATION=1` + `redis-memory-server` (`core-app-m2m-token-rate-limit.redis.integration.spec.ts`); **never** production Redis