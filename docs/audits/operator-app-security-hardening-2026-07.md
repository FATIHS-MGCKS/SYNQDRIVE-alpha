# Operator App — Security Hardening Audit (2026-07)

Production-readiness Prompt 36: targeted hardening of Operator WebApp backend surfaces.

## Scope

Operator uses existing tenant-scoped routes (`/organizations/:orgId/*`, vehicle routes, `customer-verification/*`) — no parallel operator backend.

## Closed risks

| Risk | Mitigation |
|------|------------|
| IDOR / tenant bypass | Existing `OrgScopingGuard`, `PermissionsGuard`, `VehicleOwnershipGuard`; services scope by `organizationId` from route |
| Mass assignment | Global `ValidationPipe` whitelist; new `CreateHandoverProtocolDto`, `MarkBookingNoShowDto`; `assertNoForbiddenOperatorBodyFields` rejects server-owned fields |
| Client-set actor identity | `performedByUserId` / `performedByName` rejected; handover actor from JWT via `resolveHandoverActor` |
| Duplicate completion (replay) | Redis `OperatorIdempotencyService` + `Idempotency-Key` header; DB idempotent replay for pickup (ACTIVE) and return (COMPLETED) |
| Scan/search abuse | `OperatorRateLimitService` on booking `GET :id` and search `GET` list |
| Completion abuse | Rate limits on handover, task complete, no-show |
| Verification abuse | Rate limit on `POST customer-verification/manual-pickup-check` |
| Upload abuse | Existing `DocumentUploadRateLimitService` + `@Throttle` on upload endpoints (unchanged) |
| Optimistic locking | `expectedUpdatedAt` on task complete → `TASK_OPTIMISTIC_LOCK` |
| Sensitive response caching | `Cache-Control: no-store` on booking detail, handover, customer, task detail, document bundle |
| Stack trace / path leakage (500) | `GlobalExceptionFilter` sanitizes production 500 payloads |
| Browser bfcache | `useOperatorSensitiveView` + `markOperatorSensitiveViewActive` on handover flow |

## New components

- `backend/src/modules/operator-security/` — rate limit + idempotency services
- `backend/src/config/operator-security.config.ts`
- `backend/src/modules/bookings/dto/create-handover-protocol.dto.ts`
- `frontend/src/operator/lib/operatorIdempotency.ts`
- `frontend/src/operator/hooks/useOperatorSensitiveView.ts`

## Env configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPERATOR_RATE_LIMIT_ENABLED` | `true` | Master switch |
| `OPERATOR_SCAN_RATE_LIMIT_PER_USER` | `90` | Scan window cap |
| `OPERATOR_COMPLETION_RATE_LIMIT_PER_USER` | `45` | Completion window cap |
| `OPERATOR_VERIFICATION_RATE_LIMIT_PER_USER` | `30` | Pickup check window cap |
| `OPERATOR_RATE_LIMIT_WINDOW_MS` | `60000` | Fixed window |
| `OPERATOR_IDEMPOTENCY_ENABLED` | `true` | Idempotency cache |
| `OPERATOR_IDEMPOTENCY_TTL_SECONDS` | `86400` | Cached response TTL |

Redis outage: rate limit and idempotency **fail open** (logged) — same pattern as document upload limits.

## Remaining infrastructure dependencies

- **WAF / edge rate limiting** — app-level limits are per-user/org; DDoS still needs reverse proxy
- **Redis** — required for distributed idempotency/rate limits across PM2 instances
- **CSRF** — Bearer JWT SPA architecture; no cookie session CSRF surface on API
- **CORS / Helmet** — already global in `main.ts`; origin allowlist via `app.corsOrigins`
- **Signed URLs** — documents served authenticated via controller streams, not public signed URLs
- **Malware scan on upload** — existing document extraction pipeline (out of scope for this prompt)

## Tests

- `backend/src/modules/operator-security/operator-security.security.spec.ts`
- `frontend/src/operator/lib/operatorIdempotency.test.ts`
- Existing `bookings-security-negative.spec.ts` remains valid
