# DI-DEF-019 GATE 1 — Real PostgreSQL Integration Evidence

**Date:** 2026-09-06  
**PR:** #1550 (`cursor/di-hf-live-cal-blocked-sql-lock-7d78`)  
**Status:** GATE_1_PASS  
**This is NOT production runtime validation** — isolated disposable PostgreSQL only.

## Root cause confirmed

`ReferenceCaptureSessionRepository.lockSessionRow()` used Prisma model table name `"ReferenceCaptureSession"` in raw SQL. PostgreSQL actual table: `reference_capture_sessions` with snake_case columns `organization_id` (Prisma `String` → PostgreSQL `text`).

## Fix applied

```sql
SELECT id FROM reference_capture_sessions
WHERE id = ${sessionId} AND organization_id = ${organizationId}
FOR UPDATE
```

Note: `::uuid` casts are **incorrect** for this schema (columns are `text`, not `uuid`).

## Test infrastructure

| Artifact | Path |
|----------|------|
| Harness | `backend/src/modules/vehicle-intelligence/reference-capture/testing/reference-capture-postgres.integration.harness.ts` |
| Integration spec | `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-lock-session.postgres.integration.spec.ts` |
| Gate script | `backend/scripts/ops/reference-capture-di-def-019-integration-gate.sh` |
| npm script | `npm run test:reference-capture:postgres` |

Env gate: `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1`

## GATE 1 results (2026-09-06)

| Check | Result |
|-------|--------|
| REAL_PG_SCHEMA_PROOF | PASS |
| REAL_PG_LOCK_SESSION_ROW | PASS |
| REAL_PG_FOR_UPDATE_BLOCKING | PASS |
| REAL_PG_10S_PHASE | PASS |
| REAL_PG_10_20_30_60 | PASS |
| REAL_PG_STOP_FINALIZATION | PASS |
| REAL_PG_ABORT_FINALIZATION | PASS |
| REAL_PG_ROLLBACK | PASS |
| REAL_PG_TWO_REPLICA_CONCURRENCY | PASS |
| REFERENCE_CAPTURE_REGRESSION (33 HF cal tests) | PASS |
| BACKEND_BUILD | PASS |
| GIT_DIFF_CHECK | PASS |

**Suite:** 10 integration tests + 33 regression tests, all PASS on isolated PostgreSQL 16 with full Prisma migration chain.

## DI-DEF-019 status after GATE 1

`FIXED_CODE_TESTED` — **not** `PRODUCTION_RUNTIME_VALIDATED`.

## Next gate

Human merge PR #1550 → deploy → GATE 2 stationary production dress rehearsal (KS MX 2024).
