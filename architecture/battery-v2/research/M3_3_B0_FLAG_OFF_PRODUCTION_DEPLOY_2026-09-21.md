# M3.3 B0 — Production deploy (generalized evidence flag OFF)

**Date (UTC):** 2026-09-21  
**Mode:** Controlled production deploy — **B0 only** (no B1, no flag enable, no backfill)  
**Target SHA:** `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` (main; M3.3A + M3.3A.1 + M3.3B / M3.3B.1 / M3.3B.2)  
**Deployed release:** `20260921172342_v4994`  
**Deploy path:** `bash .cursor/scripts/cloud-agent-deploy.sh` with `CLOUD_AGENT_REQUESTED_DEPLOY_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d`

## Scope

| Allowed | Forbidden (this task) |
|---------|------------------------|
| Deploy target SHA, additive migrations (already applied), rolling restart | `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`, B1, manual evidence rows, backfill |
| Keep flag **false** / absent → default false | REST_60M/6H, assessment, publication, health scoring, Trip FSM, DIMO changes |
| Schema present for shadow layer | REST_WAKE auto-promotion enable |

## 0 — Preflight (before deploy)

| Field | Value |
|-------|-------|
| `PRE_DEPLOY_PRODUCTION_SHA` | `fe3dc6bf1fc183eb6dd014a2eb2453489331da64` |
| `PRE_DEPLOY_RELEASE` | `20260921150734_v4994` |
| `PM2_REPLICA_A_STATE` | `synqdrive` online |
| `PM2_REPLICA_B_STATE` | `synqdrive-b` online |
| `SCHEDULER_LEADER_COUNT` | `1` (3001 LEADER, 3002 FOLLOWER) |
| `GENERALIZED_EVIDENCE_FLAG_ENV_PRESENT` | **NO** |
| `FLAG_ABSENT_DEFAULT_FALSE` | **YES** |
| `GENERALIZED_EVIDENCE_FLAG_EFFECTIVE_BEFORE_RESTART` | **FALSE** |
| `GENERALIZED_EVIDENCE_ROWS_BEFORE` | **0** |
| `REST_SESSION_ROWS_BEFORE` | **0** |
| `MAIN_SHA_MATCHES_TARGET` | **YES** (`origin/main` = `105f2c5ff…`) |

Pre-deploy Prisma: **352 migrations**, database **up to date** (M3.3A tables already present with zero rows).

## 1 — Migration preflight

| Field | Value |
|-------|-------|
| `M3_3A_MIGRATION_PENDING` | **NO** (`20260921130000_battery_m3_3a_generalized_evidence` already applied) |
| `M3_3A_1_HARDENING_MIGRATION_PENDING` | **NO** (`20260921140000_battery_m3_3a_1_hardening` already applied) |
| `MIGRATIONS_ADDITIVE_ONLY` | **YES** |
| `DESTRUCTIVE_SCHEMA_CHANGE` | **NO** |
| `MIGRATIONS_APPLIED` (this deploy) | **0 new** — `prisma migrate deploy`: *No pending migrations to apply* |
| `MIGRATION_FAILURES` | **NONE** |

### DB backup (this deploy)

| Field | Value |
|-------|-------|
| `DB_BACKUP_CREATED` | **YES** |
| `DB_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-deploy-20260921172342.sql.gz` |
| `DB_BACKUP_SIZE` | **72M** |

## 2 — Flag OFF guarantee

- Shared `backend.env`: key **`BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` absent** → code default **false** (`parseBooleanEnv(..., false)`).
- No env mutation during deploy; **not** set to `true`.

## 3 — Controlled deploy

| Field | Value |
|-------|-------|
| `DEPLOYED_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `REPLICA_A_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `REPLICA_B_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `BOTH_REPLICAS_EXACT_TARGET_SHA` | **YES** |
| Rolling restart | Replica A then B; scheduler convergence **PASS** (`leaderCount=1`) |
| External health | **PASS** after deploy |

## 4 — Runtime health

| Field | Value |
|-------|-------|
| `EXTERNAL_HEALTH` | **OK** (`https://app.synqdrive.eu/api/v1/health`) |
| `PM2_HEALTH` | **OK** (both online, no boot-loop during gate) |
| `SCHEDULER_LEADER_COUNT` | **1** |
| `DI_ERRORS` | **NONE** observed in post-deploy error tail |
| `PRISMA_ERRORS` | **NONE** observed |
| `BOOT_ERRORS` | **NONE** observed |

## 5 — Flag OFF post-deploy (bootstrap semantics)

Verified via `isBatteryV2GeneralizedEvidenceEnabled()` from deployed `dist` after sourcing shared `backend.env` (same file both processes use):

| Field | Value |
|-------|-------|
| `REPLICA_A_GENERALIZED_EVIDENCE_FLAG_EFFECTIVE` | **FALSE** |
| `REPLICA_B_GENERALIZED_EVIDENCE_FLAG_EFFECTIVE` | **FALSE** |
| `MIXED_FLAG_STATE` | **NO** |

## 6 — Schema verification

| Field | Value |
|-------|-------|
| `GENERALIZED_EVIDENCE_TABLE_PRESENT` | **YES** (`battery_generalized_evidence_observations`) |
| `REST_SESSION_TABLE_PRESENT` | **YES** (`battery_rest_sessions`) |
| `ACTIVE_SESSION_UNIQUE_PROTECTION_PRESENT` | **YES** (partial unique index `battery_rest_session_one_active_per_vehicle`) |
| Evidence idempotency | Index `battery_gen_evidence_idempotency` |
| Rest session idempotency | Index `battery_rest_session_idempotency` |

## 7 — Zero-write flag-OFF proof

| Field | T0 (immediate) | T1 (+180s smoke) |
|-------|----------------|------------------|
| Generalized evidence rows | **0** | **0** |
| Rest session rows | **0** | **0** |
| `GENERALIZED_EVIDENCE_ROW_DELTA` | **0** |
| `REST_SESSION_ROW_DELTA` | **0** |

## 8 — Authoritative path regression check

Read-only proxies during smoke window (fleet quiet — **no** event-conditioned REST/assess/pub exercise claimed):

| Field | Observation |
|-------|-------------|
| `LIVE_VOLTAGE_PIPELINE_HEALTH` | **NO_ERRORS** — 0 new `battery.v2` failed jobs since deploy; no generalized-evidence boot errors |
| `REST_PIPELINE_ERROR_OBSERVED` | **NO** |
| `ASSESSMENT_ERROR_OBSERVED` | **NO** |
| `PUBLICATION_ERROR_OBSERVED` | **NO** |
| `TRIP_FSM_ERROR_OBSERVED` | **NO** (no new trip-fsm error tail) |
| `AUTHORITATIVE_REGRESSION_OBSERVED` | **NO** |

## 9 — M3.3B safety invariants (deployed code)

| Invariant | Effective |
|-----------|-----------|
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** (compiled constant) |
| `R1_CADENCE_EMPIRICALLY_VALIDATED` (auto REST_WAKE) | **NO** (governance; no runtime override) |
| `REST_STABLE_PROMOTION_ALLOWED` | **NO** |
| `AUTO_REST_WAKE_PROMOTION_EFFECTIVE` | **FALSE** |
| `REST_STABLE_PROMOTION_EFFECTIVE` | **FALSE** |

## 10 — Observability

Scrape: `GET http://127.0.0.1:3001/api/v1/metrics` with production bearer auth.

| Field | Value |
|-------|-------|
| `M3_3_METRICS_REGISTERED` | **YES** (HELP/TYPE for generalized evidence, rest sessions, valid rest observations, late trip association, ladder research unqualified, state ambiguous, stale replay) |
| `PROMETHEUS_DUPLICATE_METRIC_ERROR` | **NO** |
| Counter values | **0** (expected while flag OFF) |

## 11 — B0 verdict

**`B0_PASS`** — all pass gates satisfied.

**`B1_ALLOWED=NO`** — explicit B1 authorization required after B0 pass.

---

## Machine block (canonical)

```
M3_3_B0_RESULT=B0_PASS

TARGET_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d

PRE_DEPLOY_PRODUCTION_SHA=fe3dc6bf1fc183eb6dd014a2eb2453489331da64
DEPLOYED_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d
DEPLOYED_RELEASE=20260921172342_v4994

DB_BACKUP_CREATED=YES
MIGRATIONS_APPLIED=0_new_pending_none

BOTH_REPLICAS_EXACT_TARGET_SHA=YES

GENERALIZED_EVIDENCE_TABLE_PRESENT=YES
REST_SESSION_TABLE_PRESENT=YES
ACTIVE_SESSION_UNIQUE_PROTECTION_PRESENT=YES

REPLICA_A_GENERALIZED_EVIDENCE_FLAG_EFFECTIVE=FALSE
REPLICA_B_GENERALIZED_EVIDENCE_FLAG_EFFECTIVE=FALSE
MIXED_FLAG_STATE=NO

GENERALIZED_EVIDENCE_ROWS_BEFORE=0
GENERALIZED_EVIDENCE_ROWS_AFTER=0
GENERALIZED_EVIDENCE_ROW_DELTA=0

REST_SESSION_ROWS_BEFORE=0
REST_SESSION_ROWS_AFTER=0
REST_SESSION_ROW_DELTA=0

EXTERNAL_HEALTH=OK
PM2_HEALTH=OK
SCHEDULER_LEADER_COUNT=1

AUTO_REST_WAKE_PROMOTION_EFFECTIVE=FALSE
REST_STABLE_PROMOTION_EFFECTIVE=FALSE

AUTHORITATIVE_REGRESSION_OBSERVED=NO

M3_3_METRICS_REGISTERED=YES
PROMETHEUS_DUPLICATE_METRIC_ERROR=NO

PRODUCTION_CHANGED=YES
GENERALIZED_EVIDENCE_SHADOW_WRITES_ENABLED=NO

B1_ALLOWED=NO
NEXT_ACTION=EXPLICIT_B1_AUTHORIZATION_AFTER_B0_PASS
```
