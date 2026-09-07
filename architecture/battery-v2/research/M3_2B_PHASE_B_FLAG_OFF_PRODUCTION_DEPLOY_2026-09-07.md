# M3.2B Phase B — Flag-Off Production Deploy & Runtime Equivalence Verification

**Date:** `2026-09-07T20:44–20:58Z` (UTC)  
**Merged PR:** #1560  
**Deploy SHA:** `0ba96e03fc2f1551db79d2dae151c928a9fd936a`  
**Release:** `/opt/synqdrive/releases/20260907204434_v4994`  
**Shadow flag:** `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` **not set** (effective **false**)

---

## Canonical status (unchanged)

```
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
SHADOW_FLAG_ENABLED=NO
```

---

## Step 1 — Pre-deploy baseline

| Field | Value |
|-------|-------|
| `CURRENT_PRODUCTION_SHA` | `ccc2324db1aead2ab84dc854883713ce2948bafe` |
| `CURRENT_RELEASE` | `/opt/synqdrive/releases/20260907190357_v4994` |
| `PM2_REPLICAS` | 2 (`synqdrive` :3001, `synqdrive-b` :3002) |
| `PM2_RESTART_COUNTS` (pre) | A=52, B=29 |
| `SCHEDULER_LEADERS` (pre) | stable single leader (converged post prior deploy) |
| `BATTERY_V2_REST_SHADOW_ENABLED` | `true` |
| `BATTERY_V2_PUBLICATION_ENABLED` | `true` |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` |
| `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` | **ABSENT** (env not set → code default `false`) |
| Shadow tables pre-migration | `battery_shutdown_evidence_observations=NULL`, `battery_trip_shutdown_contexts=NULL` |
| Shadow migration record pre-deploy | `NONE` |

---

## Step 2 — Database backup

| Field | Value |
|-------|-------|
| `DATABASE_BACKUP` | **SUCCESS** |
| `DATABASE_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-deploy-20260907204434.sql.gz` |
| `DATABASE_BACKUP_SIZE` | 63M |
| `DATABASE_BACKUP_TIMESTAMP` | `2026-09-07T20:44:44Z` |

---

## Step 3 — Deploy merge SHA

Canonical path: `bash .cursor/scripts/cloud-agent-deploy.sh` with `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1` and `CLOUD_AGENT_REQUESTED_DEPLOY_SHA=0ba96e03fc2f1551db79d2dae151c928a9fd936a`.

| Field | Value |
|-------|-------|
| `REQUESTED_SHA` | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| `DEPLOYED_SHA` | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| `DEPLOYED_RELEASE` | `/opt/synqdrive/releases/20260907204434_v4994` |
| `MIGRATION_APPLIED` | `20260907153000_battery_shutdown_evidence_shadow` @ `2026-09-07T20:49:49Z` |
| `MIGRATION_ALREADY_APPLIED` | NO (first apply) |
| `MIGRATION_FAILURES` | NONE |
| Deploy provenance | `REQUESTED_SHA == TARGET_SHA == REPLICA_A_SHA == REPLICA_B_SHA` |

---

## Step 4 — Schema validation (read-only)

| Check | Result |
|-------|--------|
| `battery_shutdown_evidence_observations` | EXISTS |
| `battery_trip_shutdown_contexts` | EXISTS |
| Enums | `BatteryShutdownEvidenceClass`, `BatteryShutdownEvidenceConfidenceClass`, `BatteryShutdownStateAlignmentClass`, `BatteryShutdownStateCompleteness` |
| FK column types | `organization_id`, `vehicle_id`, `trip_id` → **TEXT** |
| Timestamp columns | `effective_capture_reference_at` → **timestamp without time zone** (Prisma `TIMESTAMP(3)`) |
| Indexes | 9 indexes across both tables (idempotency, trip, vehicle, org, evidence_class) |
| FK targets | `organizations`, `vehicles`, `vehicle_trips` |
| `SHADOW_OBSERVATION_TABLE_READY` | **YES** |
| `SHUTDOWN_CONTEXT_TABLE_READY` | **YES** |
| `SCHEMA_VALIDATION` | **PASS** |

No test rows inserted.

---

## Step 5 — PM2 / release health

| Replica | Port | Status | PID | Restarts (post) | CWD release |
|---------|------|--------|-----|-----------------|-------------|
| `synqdrive` (A) | 3001 | online | 4094885 | 53 | `20260907204434_v4994` |
| `synqdrive-b` (B) | 3002 | online | 4095092 | 30 | `20260907204434_v4994` |

| Check | Result |
|-------|--------|
| Health `:3001` | HTTP 200 |
| Health `:3002` | HTTP 200 |
| External health | `https://app.synqdrive.eu/api/v1/health` → 200 |
| `PM2_HEALTH` | **PASS** |
| `NO_MIXED_SHA` | **PASS** (both replicas + `current` → `0ba96e03…`) |
| Crash loop / restart storm | NONE (single rolling restart per replica as expected) |

---

## Step 6 — Scheduler / R9 health

Post-deploy scheduler convergence gate (deploy script):

```
roles=LEADER/FOLLOWER leaders=1
reason=CONVERGED (stableObservations=2)
```

Re-check ~3 min post-deploy:

```
roles=LEADER/FOLLOWER leaders=1 attempts=1 PASS
```

| Check | Result |
|-------|--------|
| Zero-leader period | Transient only during rolling restart (~20s); converged |
| Multi-leader period | NONE |
| R9 log patterns post-deploy | 0 × `PERSIST_FAILED`, `QUEUE_FAILED`, `READ_ERROR`, `SnapshotWake`, shutdown-evidence |
| `SCHEDULER_HEALTH` | **PASS** |
| `R9_RUNTIME_HEALTH` | **PASS** |

---

## Step 7 — Shadow flag off proof

| Source | Replica A (`synqdrive`) | Replica B (`synqdrive-b`) |
|--------|-------------------------|---------------------------|
| `/opt/synqdrive/shared/backend.env` | ABSENT | ABSENT (shared) |
| PM2 process env | ABSENT | ABSENT |
| `isBatteryV2ShutdownEvidenceShadowEnabled()` default | `false` when env absent (`parseBooleanEnv(..., false)`) |

```
REPLICA_A_SHADOW_FLAG=ABSENT_DEFAULT_FALSE
REPLICA_B_SHADOW_FLAG=ABSENT_DEFAULT_FALSE
SHADOW_FLAG_EFFECTIVE=false
```

Flag **not enabled** in this run.

---

## Step 8 — Zero shadow write proof

Counts captured immediately post-deploy and after ~2 min natural production activity (no manufactured trips/telemetry):

| Table | Before | After |
|-------|--------|-------|
| `battery_shutdown_evidence_observations` | 0 | 0 |
| `battery_trip_shutdown_contexts` | 0 | 0 |

```
SHADOW_WRITES_WITH_FLAG_OFF=0
FLAG_OFF_RUNTIME_EQUIVALENCE=PASS
```

---

## Step 9 — Authoritative Battery V2 delta (since deploy `2026-09-07T20:54:00Z`)

| Path | New rows since deploy |
|------|----------------------|
| `battery_measurement_sessions` | 0 |
| `battery_measurements` REST_60M | 0 |
| `battery_measurements` REST_6H | 0 |
| `battery_assessments` | 0 |
| `battery_publications` | 0 |

```
REST_60M_BEHAVIOR_CHANGED=NO
REST_6H_BEHAVIOR_CHANGED=NO
ASSESSMENT_BEHAVIOR_CHANGED=NO
PUBLICATION_BEHAVIOR_CHANGED=NO
HEALTH_SCORE_BEHAVIOR_CHANGED=NO
SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO
```

Stage-2 authoritative flags unchanged: `REST_SHADOW=true`, `PUBLICATION=true`, `RECONCILIATION=true`.

---

## Step 10 — Failure delta

Post-deploy log scan (since `20:54Z`) for M3.2B / R9 / trip-FSM patterns:

| Class | New post-deploy |
|-------|-----------------|
| `NEW_SHUTDOWN_EVIDENCE_ERRORS` | 0 |
| `NEW_TRIP_FSM_ERRORS` (PERSIST/QUEUE/READ/handoff) | 0 |
| `NEW_PRISMA_ERRORS` (shadow tables) | 0 |
| `NEW_BULLMQ_FAILURES` (M3.2B) | 0 |
| `RESERVATION_LEAK` | none observed |
| `RECONCILIATION_STORM` | none observed |

Pre-existing unrelated noise (not M3.2B regressions):

- `DimoAuthService` 403 for tokenId=190497 (ongoing)
- `ClickHouseSchemaService` checksum mismatch on startup (known drift; no re-run)

```
NEW_FAILURE_CLASSES=NONE_M3_2B_RELATED
```

---

## Step 11 — Rollback readiness

| Field | Value |
|-------|-------|
| `PREVIOUS_SHA` | `ccc2324db1aead2ab84dc854883713ce2948bafe` |
| `PREVIOUS_RELEASE` | `/opt/synqdrive/releases/20260907190357_v4994` |
| Rollback script | `/opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh` (available) |
| Deploy state | `/opt/synqdrive/shared/deploy-state/last-deploy-state.env` |
| `ROLLBACK_READY` | **YES** |

Rollback **not executed** — all gates passed.

---

## Step 12 — Phase B decision

All required gates satisfied:

- Requested SHA deployed ✓
- Migration PASS (exactly once) ✓
- Both replicas healthy, same SHA ✓
- Single scheduler leader ✓
- R9 healthy ✓
- Shadow flag effective false on both ✓
- Zero shadow writes ✓
- No authoritative Battery V2 behavior change ✓
- No new M3.2B failure class ✓
- Rollback ready ✓

```
M3_2B_PHASE_B=PASS
PHASE_C_ALLOWED=YES
```

**Phase C** (enable shadow flag + collect natural evidence) is allowed but **not executed** in this run.

---

## Machine-readable block

```
BATTERY_V2_M3_2B_PHASE_B_FLAG_OFF_DEPLOY=COMPLETE

REQUESTED_SHA=0ba96e03fc2f1551db79d2dae151c928a9fd936a
DEPLOYED_SHA=0ba96e03fc2f1551db79d2dae151c928a9fd936a
DEPLOYED_RELEASE=20260907204434_v4994

DATABASE_BACKUP=SUCCESS
DATABASE_BACKUP_PATH=/opt/synqdrive/shared/backups/db-pre-deploy-20260907204434.sql.gz
MIGRATION_APPLIED=20260907153000_battery_shutdown_evidence_shadow
SCHEMA_VALIDATION=PASS

PM2_HEALTH=PASS
NO_MIXED_SHA=PASS
SCHEDULER_HEALTH=PASS
R9_RUNTIME_HEALTH=PASS

REPLICA_A_SHADOW_FLAG=ABSENT_DEFAULT_FALSE
REPLICA_B_SHADOW_FLAG=ABSENT_DEFAULT_FALSE
SHADOW_FLAG_EFFECTIVE=false

SHADOW_OBSERVATIONS_BEFORE=0
SHADOW_OBSERVATIONS_AFTER=0
SHADOW_CONTEXTS_BEFORE=0
SHADOW_CONTEXTS_AFTER=0
SHADOW_WRITES_WITH_FLAG_OFF=0

REST_60M_BEHAVIOR_CHANGED=NO
REST_6H_BEHAVIOR_CHANGED=NO
ASSESSMENT_BEHAVIOR_CHANGED=NO
PUBLICATION_BEHAVIOR_CHANGED=NO
HEALTH_SCORE_BEHAVIOR_CHANGED=NO

NEW_FAILURE_CLASSES=NONE_M3_2B_RELATED
NEW_BULLMQ_FAILURES=0
NEW_DB_ERRORS=0
NEW_PRISMA_ERRORS=0
NEW_SHUTDOWN_EVIDENCE_ERRORS=0
NEW_TRIP_FSM_ERRORS=0

ROLLBACK_READY=YES

M3_2B_PHASE_B=PASS
PHASE_C_ALLOWED=YES

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

PRODUCTION_CHANGED=YES
SHADOW_FLAG_ENABLED=NO
```
