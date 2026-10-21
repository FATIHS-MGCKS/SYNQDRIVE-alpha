# M3.2B Phase C — Controlled Production Shadow Activation

**Date:** `2026-09-07T22:44–22:48Z` (UTC)  
**Phase-C T0:** **`2026-09-07T22:47:14Z`** (immutable boundary for natural shadow evidence evaluation)  
**Deployed SHA (unchanged):** `0ba96e03fc2f1551db79d2dae151c928a9fd936a`  
**Release:** `/opt/synqdrive/releases/20260907204434_v4994`  
**Mutation:** `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true` + controlled rolling restart only (no redeploy)

---

## Epistemic semantics (read before interpreting post-activation checks)

Phase C distinguishes activation success from natural evidence availability:

| Axis | Meaning in Phase C |
|------|-------------------|
| **Shadow activation effective** | Flag true in shared `backend.env`; both replicas restarted after T0; bootstrap-equivalent config resolution returns true; control plane healthy. |
| **Natural shutdown evidence captured** | A qualifying production trip shutdown produced shadow rows after T0. **Not required** for Phase C PASS. |
| **Authoritative equivalence under natural event** | REST/assess/pub paths exercised and compared under load. **Not claimed** in Phase C. |

```
NO_OBSERVED_REGRESSION != NATURAL_PATH_EQUIVALENCE_PROVEN
```

Phase C **proves** (activation gate):

- Preflight invariants before mutation
- Rollback procedure ready and tested (first attempt exercised atomic rollback successfully)
- Flag enabled in canonical production env
- Both replicas healthy on same SHA after rolling restart
- Scheduler converged to exactly 1 leader
- Shadow flag runtime-effective on both replicas (bootstrap-equivalent proof)
- Shadow schema operational; zero rows immediately post-activation is **not** a failure
- No new M3.2B failure class in immediate smoke
- Authoritative Battery V2 isolation preserved (no new authoritative rows since T0)

Phase C **does not prove**:

- Natural shutdown shadow evidence quality (awaits `NEXT_VALIDATION_TRIGGER=NATURAL_POST_ACTIVATION_TRIP_SHUTDOWN`)
- M3.2C readiness (`M3_2C_ALLOWED=NO`)
- Event-conditioned authoritative equivalence

---

## Runtime flag verification methodology

NestJS `ConfigModule` loads `/opt/synqdrive/shared/backend.env` via the release `.env` symlink at process bootstrap. Battery V2 config functions read `process.env` **after** that load.

**Important:** `/proc/PID/environ` and PM2 `jlist` env blocks reflect the **exec-time** environment only — not post-bootstrap dotenv mutations. Phase B used PM2 env `ABSENT` + file absent + code default for flag-off proof. Phase C uses the symmetric bootstrap-equivalent proof:

1. Shared `backend.env` contains `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true`
2. Both replica processes started **after** `M3_2B_PHASE_C_T0` (PID birth time ≥ T0)
3. Node bootstrap simulation loads the same `.env` symlink and calls `isBatteryV2ShutdownEvidenceShadowEnabled()` from deployed compiled config → `true`

This is stronger than file-only inference and matches how each replica resolves the flag at startup.

---

## Step 1 — Canonical preflight

| Field | Value |
|-------|-------|
| Preflight UTC | `2026-09-07T22:44:32Z` |
| Production release | `/opt/synqdrive/releases/20260907204434_v4994` |
| Replica A SHA | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| Replica B SHA | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| Symlink/current SHA | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| PM2 restarts pre (A/B) | 53 / 30 |
| Scheduler leaders pre | 1 (LEADER/FOLLOWER) |
| `BATTERY_V2_REST_SHADOW_ENABLED` | `true` |
| `BATTERY_V2_PUBLICATION_ENABLED` | `true` |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` |
| `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` | **ABSENT** (effective false) |
| M3.2B implementation | **YES** (`shutdown-evidence/` module present in release) |
| Migration | `20260907153000_battery_shutdown_evidence_shadow` @ `2026-09-07T20:49:49Z` |
| Shadow tables | both exist |
| Shadow observations pre | **0** |
| Shadow contexts pre | **0** |
| Authoritative baseline | sessions=70, REST measurements=163, assessments=17, publications=0 |

| Gate | Result |
|------|--------|
| `PM2_HEALTH` | **PASS** |
| `NO_MIXED_SHA` | **PASS** |
| `SCHEDULER_LEADERS` | **1** |
| `R9_RUNTIME_HEALTH` | **PASS** (no new PERSIST/QUEUE/READ patterns) |
| `M3_2B_IMPLEMENTATION_PRESENT` | **YES** |
| `PHASE_C_ALLOWED` | **YES** |
| `SHADOW_SCHEMA_READY` | **YES** |

---

## Step 2 — Rollback readiness

| Field | Value |
|-------|-------|
| Backup file | `/opt/synqdrive/shared/backend.env.bak-m3-2b-phase-c-20260907224714` |
| Rollback procedure | Restore backup → `chmod 600` → `battery_v2_stage2_rolling_deploy` both replicas on unchanged SHA |
| Atomic rollback lib | `battery_v2_stage2_execute_atomic_env_rollback` (validated during first-attempt false-negative rollback @ `22:45–22:46Z`) |
| `ROLLBACK_READY` | **YES** |
| `ROLLBACK_EXECUTED` (final run) | **NO** |

**Operational note:** An initial activation attempt @ `22:45:32Z` used an invalid `/proc/environ` verification method, triggered fail-closed atomic rollback, and restored flag-off state. The corrected bootstrap-equivalent verification was used for the successful activation @ `22:47:14Z`. Production converged to flag-on with no mixed-SHA and scheduler leader=1.

---

## Step 3 — Enable Phase C

| Field | Value |
|-------|-------|
| Env mutation | `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true` in `/opt/synqdrive/shared/backend.env` |
| Other Battery V2 flags | **unchanged** (REST_SHADOW, PUBLICATION, RECONCILIATION remain true) |
| `M3_2B_PHASE_C_T0` | **`2026-09-07T22:47:14Z`** |
| M3.1 Stage-2 T0 | **unchanged** (`2026-09-05T23:36:12Z`) |
| Code redeploy | **NO** (same SHA `0ba96e03…`) |

---

## Step 4 — Controlled rolling restart

| Replica | Pre restarts | Post restarts | Delta | Post status |
|---------|--------------|---------------|-------|-------------|
| `synqdrive` (A) :3001 | 55 | 56 | +1 | online, health 200 |
| `synqdrive-b` (B) :3002 | 32 | 33 | +1 | online, health 200 |

| Check | Result |
|-------|--------|
| Rolling order | A healthy → then B (never both down intentionally) |
| External health | `https://app.synqdrive.eu/api/v1/health` → 200 |
| SHA invariant post | both replicas + current → `0ba96e03…` |
| Scheduler convergence | `leaders=1` (stableObservations=2, attempts=11) |
| Post roles | A=FOLLOWER, B=LEADER |

---

## Step 5 — Flag effective on both replicas

| Source | Replica A | Replica B |
|--------|-------------|-----------|
| `backend.env` (shared) | `true` | `true` |
| Process boot after T0 | **yes** | **yes** |
| Bootstrap config resolution | `true` | `true` (same shared `.env` symlink) |
| PM2 env block | ABSENT (expected — dotenv at Nest bootstrap) | ABSENT |

```
REPLICA_A_SHADOW_FLAG_EFFECTIVE=true
REPLICA_B_SHADOW_FLAG_EFFECTIVE=true
SHADOW_FLAG_EFFECTIVE=true
```

---

## Step 6 — Immediate safety smoke

| Check | Result |
|-------|--------|
| Both replicas online | **YES** |
| Same production release/SHA | **YES** (`0ba96e03…`) |
| Scheduler leader after convergence | **1** |
| Crash/restart storm | **NO** (single +1 restart per replica) |
| New Prisma/DB errors (shadow) | **0** |
| New BullMQ failures (M3.2B) | **0** |
| New shutdown-evidence persistence errors | **0** |
| New R9 failure class | **0** |
| New trip-FSM failure class | **0** |
| Stage-2 authoritative flags unchanged | REST_SHADOW/PUBLICATION/RECONCILIATION still `true` |

Pre-existing unrelated production noise (unchanged):

- `DimoAuthService` 403 for some tokenIds (ongoing)
- `ClickHouseSchemaService` checksum drift on startup (known; non-blocking)

---

## Step 7 — Shadow write interpretation

| Table | Pre T0 | Post activation |
|-------|--------|-----------------|
| `battery_shutdown_evidence_observations` | 0 | 0 |
| `battery_trip_shutdown_contexts` | 0 | 0 |

```
NATURAL_SHUTDOWN_EVENT_OBSERVED=NO
NATURAL_SHADOW_EVIDENCE_AVAILABLE=NO
```

Zero rows immediately after Phase C activation is **expected** and **not** a failure. No synthetic events, backfill, or manual inserts were performed.

---

## Step 8 — Authoritative non-effect check

Authoritative counts unchanged since preflight baseline; no new rows since T0:

| Path | New rows since T0 | Path exercised? |
|------|-------------------|-------------------|
| `battery_measurement_sessions` | 0 | NO |
| `battery_assessments` | 0 | NO |
| `battery_publications` | 0 | NO |

```
AUTHORITATIVE_REGRESSION_OBSERVED=NO
AUTHORITATIVE_PATH_NATURALLY_EXERCISED=NO
AUTHORITATIVE_EQUIVALENCE_UNDER_NATURAL_EVENT=NOT_PROVEN
SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO
```

Absence of new authoritative rows means paths were **not naturally exercised** during the immediate smoke window — not proof of unchanged behavior under event load.

---

## Step 9 — Phase C decision

All required activation gates satisfied:

- Preflight PASS ✓
- Rollback ready (and rollback lib validated) ✓
- Flag effective true on both replicas ✓
- Both replicas healthy, same SHA ✓
- Single scheduler leader ✓
- Shadow schema operational ✓
- No new M3.2B failure class ✓
- Authoritative isolation preserved ✓

```
BATTERY_V2_M3_2B_PHASE_C_ACTIVATION=PASS
M3_2C_ALLOWED=NO
NEXT_VALIDATION_TRIGGER=NATURAL_POST_ACTIVATION_TRIP_SHUTDOWN
```

Natural shadow evidence evaluation must use forensic criteria from M3.2B implementation spec (trip identity, timestamps, provenance, idempotency, etc.) with rows captured **after** `M3_2B_PHASE_C_T0` only.

---

## Machine-readable block

```
BATTERY_V2_M3_2B_PHASE_C_ACTIVATION=PASS

PHASE_C_T0=2026-09-07T22:47:14Z

PRE_ACTIVATION_SHA_A=0ba96e03fc2f1551db79d2dae151c928a9fd936a
PRE_ACTIVATION_SHA_B=0ba96e03fc2f1551db79d2dae151c928a9fd936a
POST_ACTIVATION_SHA_A=0ba96e03fc2f1551db79d2dae151c928a9fd936a
POST_ACTIVATION_SHA_B=0ba96e03fc2f1551db79d2dae151c928a9fd936a

PM2_HEALTH=PASS
NO_MIXED_SHA=PASS
SCHEDULER_HEALTH=PASS
SCHEDULER_LEADERS=1
R9_RUNTIME_HEALTH=PASS

M3_2B_IMPLEMENTATION_PRESENT=YES
SHADOW_SCHEMA_READY=YES

REPLICA_A_SHADOW_FLAG_EFFECTIVE=true
REPLICA_B_SHADOW_FLAG_EFFECTIVE=true
SHADOW_FLAG_EFFECTIVE=true

SHADOW_OBSERVATIONS_PRE=0
SHADOW_OBSERVATIONS_POST=0
SHADOW_CONTEXTS_PRE=0
SHADOW_CONTEXTS_POST=0

NATURAL_SHUTDOWN_EVENT_OBSERVED=NO
NATURAL_SHADOW_EVIDENCE_AVAILABLE=NO

AUTHORITATIVE_REGRESSION_OBSERVED=NO
AUTHORITATIVE_PATH_NATURALLY_EXERCISED=NO
AUTHORITATIVE_EQUIVALENCE_UNDER_NATURAL_EVENT=NOT_PROVEN
SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO

NEW_M3_2B_FAILURE_CLASSES=NONE
NEW_SHUTDOWN_EVIDENCE_ERRORS=0
NEW_TRIP_FSM_ERRORS=0
NEW_R9_ERRORS=0

ROLLBACK_READY=YES
ROLLBACK_EXECUTED=NO

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

M3_2C_ALLOWED=NO
NEXT_VALIDATION_TRIGGER=NATURAL_POST_ACTIVATION_TRIP_SHUTDOWN

PRODUCTION_CHANGED=YES
DOCUMENTATION_UPDATED=YES
```

---

## Canonical status (unchanged except shadow flag)

```
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
M3_2B_PHASE_B=PASS
PHASE_C_ALLOWED=YES (executed)
SHADOW_FLAG_EFFECTIVE=true
M3_2C_ALLOWED=NO
M3_2C_ALLOWED_BEFORE_NATURAL_SHADOW_EVIDENCE=NO
```
