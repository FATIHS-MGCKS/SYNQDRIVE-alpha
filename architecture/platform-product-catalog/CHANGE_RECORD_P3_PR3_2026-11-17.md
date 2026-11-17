# P3-PR3 — Core app M2M Redis rate limiting

**Date:** 2026-11-17  
**Endpoint:** `POST /api/v1/auth/core-app/token`

## Scope

- Distributed fixed-window limits via Redis `EVAL` (atomic `INCR` + `PEXPIRE`)
- Dimensions: trust-boundary IP (`req.ip` / socket — **no** `X-Forwarded-For parsing) and hashed client identity (SHA-256 prefix in Redis keys only)
- Enforced **before** bcrypt / Prisma in `CoreAppM2mTokenController`
- Fail-closed: Redis errors => generic `Authentication failed` (no token issuance)
- Limit exceeded => HTTP **429** + `Retry-After` header
- `CORE_APP_M2M_RATE_LIMIT_ENABLED` defaults **true**; cannot be `false` while `CORE_APP_M2M_ENABLED=true` (module bootstrap)

## Non-effects

- User JWT / Rental routes unchanged
- M2M defaults remain OFF; no production activation
- No Master Admin UI, no new consumer APIs

## Evidence

- `backend/src/modules/core-app-m2m/core-app-m2m-token-rate-limit.service.ts`
- `core-app-m2m-token-rate-limit.*.spec.ts`
- Memory Redis cross-replica tests (`testing/core-app-m2m-rate-limit.memory-redis.ts`)