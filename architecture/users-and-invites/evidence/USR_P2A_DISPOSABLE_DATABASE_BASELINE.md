# USR-P2A — Disposable IAM database baseline

**Operation:** `SYNQDRIVE_MASTER_USERS_P2A_DATABASE_BASELINE`  
**PR:** #2534  
**Scope:** Ephemeral PostgreSQL 16 only (loopback, `usr_p2_*` naming guard)

## Drift reproduced

Fresh DB after `prisma migrate deploy` + approved ephemeral recovery (`PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1`):

| Prisma expectation | Migration chain | Pre-P2? |
|--------------------|-----------------|---------|
| `users.password_hash` | **Absent** (init `users` has `name` only) | **Yes** — schema drift |
| `users.first_name` / `last_name` | **Absent** on `users` | **Yes** |
| `users.must_change_password` | **Absent** | **Yes** |
| `organization_memberships.role_label` | **Absent** | **Yes** |
| `organization_memberships.field_agent_access` | **Absent** | **Yes** |
| IAM tables (`iam_session_revocation_intents`, MFA, password reset) | Present via IAM migrations | No |

**Predecessor-base vs current-head:** Same gap on empty disposable DB — missing columns were never added by migration SQL.

## Root cause

`prisma-migrate-deploy-resilient.sh` correctly finishes deploy by resolving known special failures (batch C `CONCURRENTLY`, M252 identifier collision, tail M252 duplicate). That yields **apply success** for the migration chain, but does **not** add Prisma-only columns that were never migration-authored. This is **schema.prisma ahead of migration history**, not a P2 regression and **not asserted for production**.

## Disposable repair (distinct evidence types)

| Layer | Method | Claim |
|-------|--------|-------|
| Migration-derived | `prisma migrate deploy` + resilient recovery | Historical migrations applied |
| Schema parity (disposable only) | `backend/scripts/test/sql/ensure-ephemeral-iam-schema-parity.sql` | **TARGETED_SQL** — IAM columns for tests |
| Preflight | `backend/scripts/test/usr-p2-iam-schema-preflight.mjs` | Fail-closed before USR-P2 PG suites |

Gate wiring: `backend/scripts/test/usr-p2-postgres-gate.sh` applies parity SQL → preflight → `usr-p2a-iam-schema-smoke.postgres.integration.spec.ts` → existing USR-P2 suites.

**False PASS removed:** `usr-p2-gate1-security-mutation` no longer early-returns when `password_hash` is missing.

## P2-B blockers (record only — out of P2A scope)

**P2-R20:** Password/MFA mutation paths may acquire user/membership row locks before canonical advisory fences — verify lock order in dedicated acceptance.

**P2-R21:** `enqueueInTransactionWithAuthoritativeInvalidation` may re-apply invalidation when an existing revocation intent is replayed — verify idempotency vs duplicate bump semantics.

## Smoke tests (real Prisma)

`usr-p2a-iam-schema-smoke.postgres.integration.spec.ts` — user password hash, membership `roleLabel`, refresh issuance, MFA factor/recovery, password reset token, session revocation intent, master admin audit outbox enqueue.