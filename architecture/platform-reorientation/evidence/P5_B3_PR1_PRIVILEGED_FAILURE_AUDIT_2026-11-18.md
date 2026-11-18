# P5-B3-PR1 — Privileged Master Admin mutation failure audit

**Date:** 2026-11-18 (Europe/Berlin)  
**Base:** `e1d332a2f634d5dcb66011b6a33eb4ff8375602a`

## Change summary

- New audit action: `PRIVILEGED_MUTATION_DENIED` (`ActivityLog` / `MASTER_ADMIN` envelope).
- Shared recorder: `master-admin-privileged-audit.recorder.ts` (success + failure, dedup flag; skip list for step-up denials only).
- `MasterAdminPrivilegedAuditInterceptor` records handler/pipe failures (4xx/5xx) without persisting request bodies on failure.
- `GlobalExceptionFilter` (DI via `APP_FILTER`) records guard-thrown and early `HttpException` failures on `/api/v1/admin/*` mutating routes.

## Failures covered

| Category | Integration | Notes |
|----------|-------------|-------|
| Validation (400) | Interceptor (+ filter dedup) | Safe `responseCode` when present |
| Authorization (401/403) | Exception filter | `permissionGranted=false` when not `MASTER_ADMIN` |
| Business/client 4xx | Interceptor | Generic description only |
| Server 5xx | Interceptor + filter for non-HttpException | No exception message in audit description |
| MFA step-up denial (`STEP_UP_REQUIRED` / `STEP_UP_EXPIRED`) | **Skipped** | `MasterAdminMfaGuard.recordMfaStepUp` |
| MFA enrollment denial (`MFA_ENROLLMENT_REQUIRED`) | Exception filter | `PRIVILEGED_MUTATION_DENIED` (guard does not call `recordMfaStepUp`) |

## Explicit limitations (documented blockers)

- **Throttle / guard types without `HttpException`:** Not covered unless they surface as HTTP exceptions.
- **Anonymous / unauthenticated `401` on `/api/v1/admin/*`:** `isMasterPrivilegedRequest` requires `user.id` — **no failure audit record** (mutations not classified as privileged-audit scope).
- **Duplicate success audits** (interceptor + domain services): Unchanged — out of PR1 scope (P5-B3-PR6).
- **Durable delivery:** `AuditService` logs persistence errors and does not throw, but **does not guarantee** durable delivery if `activityLog.create` fails.

## Tests

- `master-admin-privileged-audit.recorder.spec.ts`
- `master-admin-privileged-audit.interceptor.spec.ts` (failure path)
- `master-admin-privileged-failure-audit.http-security.spec.ts`

**REGISTRY_REVIEWED:** UNCHANGED