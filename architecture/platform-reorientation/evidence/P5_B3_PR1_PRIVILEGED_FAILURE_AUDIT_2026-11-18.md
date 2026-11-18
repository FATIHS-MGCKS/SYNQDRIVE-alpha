# P5-B3-PR1 — Privileged Master Admin mutation failure audit

**Date:** 2026-11-18 (Europe/Berlin)  
**Base:** `e1d332a2f634d5dcb66011b6a33eb4ff8375602a`

## Change summary

- New audit action: `PRIVILEGED_MUTATION_DENIED` (`ActivityLog` / `MASTER_ADMIN` envelope).
- Shared recorder: `master-admin-privileged-audit.recorder.ts` (success + failure, dedup flag, MFA skip list).
- `MasterAdminPrivilegedAuditInterceptor` records handler/pipe failures (4xx/5xx) without persisting request bodies on failure.
- `GlobalExceptionFilter` (DI via `APP_FILTER`) records guard-thrown and early `HttpException` failures on `/api/v1/admin/*` mutating routes.

## Failures covered

| Category | Integration | Notes |
|----------|-------------|-------|
| Validation (400) | Interceptor (+ filter dedup) | Safe `responseCode` when present |
| Authorization (401/403) | Exception filter | `permissionGranted=false` when not `MASTER_ADMIN` |
| Business/client 4xx | Interceptor | Generic description only |
| Server 5xx | Interceptor + filter for non-HttpException | No exception message in audit description |
| MFA step-up denial | **Skipped** | Existing `MasterAdminMfaGuard.recordMfaStepUp` only |

## Explicit limitations (documented blockers)

- **Throttle / guard types without `HttpException`:** Not covered unless they surface as HTTP exceptions.
- **Unauthenticated requests without `user.id` on `/admin/*`:** Still scoped by path; actor may be null.
- **Duplicate success audits** (interceptor + domain services): Unchanged — out of PR1 scope (P5-B3-PR6).
- **Fire-and-forget persistence loss:** Mitigated via `.catch` on async `record`; `AuditService` still swallows DB errors by design.

## Tests

- `master-admin-privileged-audit.recorder.spec.ts`
- `master-admin-privileged-audit.interceptor.spec.ts` (failure path)
- `master-admin-privileged-failure-audit.http-security.spec.ts`

**REGISTRY_REVIEWED:** UNCHANGED