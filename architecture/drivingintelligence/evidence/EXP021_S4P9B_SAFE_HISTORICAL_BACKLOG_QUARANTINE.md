# EXP021-S4P9B — Safe historical backlog quarantine & Gate-6 reopen contract

**Status:** Engineering (no production execution in S4P9B PR)  
**Production SHA pin:** `ff9cb8a71bd84585388b014ecc5029fb05fadce2`  
**GLOBAL prestate (forensics):** `KILLED` — 18× `PENDING`, 1× `COMPLETED`, preserved evidence/shadow rows

## Backlog quarantine design

1. **Manifest pinning (env)** — exact work item identities, no aggregate-only checks:
   - `DI_S4_HISTORICAL_BACKLOG_QUARANTINE_IDS` — 18 UUIDs (comma-separated)
   - `DI_S4_HISTORICAL_BACKLOG_PRESERVE_COMPLETED_IDS` — completed tiny row (1 UUID)
   - `DI_S4_HISTORICAL_BACKLOG_ORGANIZATION_ID` — rollout org
   - `DI_S4_HISTORICAL_BACKLOG_ALLOWED_VEHICLE_IDS` — wave-3 vehicle allowlist
   - `DI_S4_HISTORICAL_BACKLOG_EXPECTED_TOTAL_WORK_ITEMS=19`
2. **Acknowledgement:** `DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK=YES`
3. **Preconditions:** `GLOBAL.kill_state=KILLED`; each manifest id `PENDING` without active lease; completed row unchanged; no other runnable work.
4. **Transition:** `PENDING` → `SUPERSEDED` / `superseded_reason=OPERATOR`; audit marker in `failure_reason` (`HISTORICAL_BACKLOG_QUARANTINE_S4P9B`); **no deletes**; pipeline registry unchanged; no provider calls.
5. **Concurrency:** per-id `FOR UPDATE`, total row-count drift guard inside transaction; idempotent on already-quarantined rows.
6. **CLI:** `backend/scripts/ops/di-v0-s4-historical-backlog-quarantine-production/di-v0-s4-historical-backlog-quarantine-production-cli.ts` — `preflight` | `safety-proof` | `apply`

## Gate-6 `REOPEN_WITH_HISTORY` intent

Explicit only (never inferred from persistence):

- `DI_S4_GATE6_REOPEN_WITH_HISTORY_ACK=YES` or `DI_S4_GATE6_OPEN_INTENT=REOPEN_WITH_HISTORY`
- Requires `GLOBAL=KILLED` at entry (not `WAVE_PROMOTION`)
- Skips pristine `S4_PERSISTENCE_NONZERO` only when `DI_S4_GATE6_BACKLOG_SAFETY_OK=YES` and `DI_S4_GATE6_BACKLOG_RUNNABLE_COUNT=0`
- **Does not** weaken `INITIAL_OPEN` (still requires zero persistence)

## Master Admin S4 monitoring smoke (authenticated)

Read-only route: `GET /api/v1/admin/ops/driving-intelligence-s4`

1. Sign in via Master Admin (Clerk session with `MASTER_ADMIN` platform role).
2. `curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $MASTER_ADMIN_JWT" https://app.synqdrive.eu/api/v1/admin/ops/driving-intelligence-s4` → expect **200** (not 403 MFA enrollment / step-up for GET).
3. Unauthenticated call → **401** (expected).
4. Non–master-admin JWT → **403** (RolesGuard).

`MasterAdminMfaGuard` does not step up GET for `MASTER_PLATFORM_SETTINGS` when MFA flags are enabled.
