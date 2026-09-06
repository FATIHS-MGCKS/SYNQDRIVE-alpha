# M3.1 Corrected Stage-2 — ≥6h Production Validation Evidence

**Audit timestamp:** `2026-09-06T10:06:57Z`  
**Canonical T0:** `2026-09-05T23:36:12Z`  
**Elapsed:** 10.51h (≥6h gate eligible after `2026-09-06T05:36:12Z`)  
**Release / SHA:** `20260905231643_v4994` / `a4377f3a200ca45a97b7ce422caf8d92faddabbe` (unchanged since activation)

## Executive verdict

| Field | Value |
|-------|-------|
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** |
| `M3_1_STATUS` | **STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE** |
| `T30_VALIDATION` | PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE (unchanged basis) |

**Reason:** Stage-2 contract, control plane, PM2/scheduler, PKG-01 safety, failure/duplicate/reservation audits all **PASS** over the full ≥6h window. However, **zero** natural post-T0 VALID REST measurements exist; therefore no canonical assessment or customer publication chain could occur. This is **not** a pipeline defect — eligible ICE vehicles had no qualifying completed rest window producing VALID evidence in the observation period (active/driving telemetry dominated; backfill targets evaluated as expected contamination).

---

## Step 1 — Production identity / continuity

| Check | Result |
|-------|--------|
| Release | `20260905231643_v4994` |
| SHA | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` |
| PM2 | synqdrive:3001 online pid=3519043 restarts=42; synqdrive-b:3002 online pid=3519236 restarts=19 |
| Restarts post-T0 | **0 unexpected** (same restart counts as T+30m; only controlled activation restart) |
| Scheduler | 3001=LEADER, 3002=FOLLOWER, `SCHEDULER_LEADERS=1` |
| Stage-2 flags | `REST_SHADOW=true`, `PUBLICATION=true`, `RECONCILIATION=true` |
| `REPLICA_A/B_STAGE2_CONTRACT` | PASS |
| `MIXED_RUNTIME_CONFIG` | NO |
| `MIXED_SHA` | NO |

Post-activation scheduler: 0 zero-leader mentions, 0 multi-leader mentions in PM2 logs after controlled restart.

---

## Step 2 — Full-fleet eligibility matrix (6 connected DIMO vehicles)

| Plate | Fuel | Telemetry | Post-T0 meas | Natural VALID REST | Assess | Pub | Sessions | Verdict |
|-------|------|-----------|--------------|-------------------|--------|-----|----------|---------|
| WOB L 7503 | GASOLINE | active LV 14.2V | 2 REST backfill | 0 | 0 | 0 | 1 | **ELIGIBLE_NO_QUALIFYING_REST_OPPORTUNITY** (backfill contaminated only) |
| KS FH 660E | ELECTRIC | active SOC 92% | 0 | 0 | 0 | 0 | 0 | **EV_NO_LV_REST_PATH** |
| HMÜ C 215 | GASOLINE | active LV 12.7V | 1 LIVE_VOLTAGE | 0 | 0 | 0 | 0 | **ELIGIBLE_REST_PENDING** (telemetry active; no rest session armed post-T0) |
| KS MX 2024 | GASOLINE | active LV 12.2V | 0 | 0 | 0 | 0 | 0 | **ELIGIBLE_NO_QUALIFYING_REST_OPPORTUNITY** |
| KS MS 661 | GASOLINE | active LV 13.6V | 59 LIVE_VOLTAGE + 2 REST backfill | 0 | 0 | 0 | 3 | **ELIGIBLE_REST_PENDING** (active/driving; new anchors at 08:49/10:05 without targets yet) |
| WOB L 9755 | GASOLINE | stale Aug 26 | 0 | 0 | 0 | 0 | 0 | **OFFLINE_OR_INELIGIBLE** |

`FULL_FLEET_ELIGIBILITY_EXPLAINED=YES`  
`UNEXPLAINED_STUCK_ELIGIBLE_VEHICLES=0`

No vehicle with a due VALID REST target silently failed to progress.

---

## Step 3 — Control-plane continuity

| Metric | Value |
|--------|-------|
| `RECONCILIATION_TICKS_POST_T0` | 122 |
| `OBSERVATION_CLASSIFY_JOBS_POST_T0` | 282 |
| `REST_SESSION_ARM_EVENTS_POST_T0` | 486 (reconciliation counter sum) |
| `REST_SESSION_ROWS_CREATED_POST_T0` | 4 |
| `DISTINCT_CANONICAL_REST_SESSIONS_POST_T0` | 4 (2 vehicles) |
| `REST_TARGETS_CREATED_POST_T0` | 13 (reconciliation counter) |
| `REST_TARGET_EVALUATIONS_POST_T0` | 4 REST measurement rows persisted |
| Reconcile cadence | min=5.0 max=5.0 avg=5.0 minutes |
| First tick (retained log) | `2026-09-06T00:00:45` |
| Last tick | `2026-09-06T10:05:43` |

**Not** the config-blocked failure mode (restSessions=0/restTargets=0 every tick). Observation classify and rest session arming ran continuously.

`CANONICAL_CONTROL_PLANE_CONTINUOUS=YES`

---

## Step 4 — Natural REST evidence

| Metric | Value |
|--------|-------|
| `MEASUREMENTS_PERSISTED_POST_T0` | 62 |
| `BACKFILL_REST_MEASUREMENTS_POST_T0` | 4 (REST with `observed_at < T0`) |
| `LIVE_VOLTAGE_PERSISTED_POST_T0` | 58 |
| `NATURAL_VALID_REST_60M_MEASUREMENTS_POST_T0` | **0** |
| `NATURAL_VALID_REST_6H_MEASUREMENTS_POST_T0` | **0** |
| `NATURAL_VALID_REST_MEASUREMENTS_TOTAL` | **0** |

### Backfill REST (excluded from natural evidence)

| created_at | type | quality | observed_at | vehicle |
|------------|------|---------|-------------|---------|
| 23:40:43 | REST_60M | CONTAMINATED_BY_ACTIVE_TRIP | 18:49:57 (pre-T0) | WOB L 7503 |
| 23:40:43 | REST_6H | CONTAMINATED_BY_WAKE | 15:17:03 (pre-T0) | KS MS 661 |
| 23:40:48 | REST_60M | CONTAMINATED_BY_ACTIVE_TRIP | 15:43:51 (pre-T0) | KS MS 661 |
| 01:55:43 | REST_6H | CONTAMINATED_BY_WAKE | 18:23:49 (pre-T0) | WOB L 7503 |

All handoffs: `EXECUTED/POLICY_SKIPPED`. Expected contamination on historical windows.

`NATURAL_VALID_REST_EVIDENCE_PROVEN=NO`

---

## Step 5 — Assessment provenance

| Metric | Value |
|--------|-------|
| `NATURAL_ASSESSMENTS_POST_T0` | 0 |
| `VEHICLES_WITH_NATURAL_ASSESSMENTS` | 0 |

No VALID REST measurement → no canonical assessment handoff possible.

`NATURAL_ASSESSMENT_EVIDENCE_PROVEN=NO`

---

## Step 6 — Publication provenance

| Metric | Value |
|--------|-------|
| `PUBLICATION_HANDOFFS_POST_T0` | 0 |
| `BATTERY_PUBLICATIONS_POST_T0` | 0 |
| `VEHICLES_WITH_PUBLICATIONS` | 0 |

`NATURAL_PUBLICATION_EVIDENCE_PROVEN=NO`  
`NATURAL_END_TO_END_CHAIN_PROVEN=NO`

---

## Step 7 — Publication integrity

| Check | Count |
|-------|-------|
| `PUBLICATION_IDENTITY_COLLISIONS` | 0 |
| `DUPLICATE_PUBLICATIONS` | 0 |
| `PUBLICATION_PROVENANCE_VIOLATIONS` | 0 |
| `EWMA_HYSTERESIS_REAPPLICATIONS` | 0 |

---

## Step 8 — Due-but-missing analysis

| Classification | Count |
|----------------|-------|
| `DUE_REST_TARGETS_TOTAL` | 4 (backfill evaluations at first ticks) |
| `DUE_REST_TARGETS_SUCCESSFUL` | 0 (none VALID) |
| `DUE_REST_TARGETS_EXPECTED_REJECTION` | 4 (all contaminated/missed quality) |
| `DUE_REST_TARGETS_PIPELINE_MISSING` | **0** |
| `DUE_REST_TARGETS_UNRESOLVED` | 0 |

No eligible vehicle had a due VALID REST opportunity that silently disappeared.

---

## Step 9 — PKG-01 legacy backlog safety

| Metric | Value |
|--------|-------|
| `PKG01_ORIGINAL_PRE_T0_TOTAL` | 24 |
| `PKG01_ORIGINAL_PRE_T0_POLICY_SKIPPED` | 19 |
| `PKG01_ORIGINAL_PRE_T0_STILL_ENQUEUED` | 5 |
| `PKG01_ORIGINAL_PRE_T0_VALID_REMAINING` | 0 |
| `PKG01_ORIGINAL_PRE_T0_UNRESOLVED` | 0 |
| `PKG01_STALE_SAFE_INERT` | YES (unchanged; all non-VALID) |
| `PRE_T0_ASSESSMENTS_CREATED_SINCE_STAGE2_T0` | 0 |
| `PRE_T0_PUBLICATION_HANDOFFS_CREATED_SINCE_STAGE2_T0` | 0 |
| `PRE_T0_CUSTOMER_PUBLICATIONS_CREATED_SINCE_STAGE2_T0` | 0 |

Cohort arithmetic: 19 + 5 = 24 ✓

---

## Step 10 — Failure delta

| Check | Post-T0 |
|-------|---------|
| `54000` | 0 |
| `LOCK_CONTENTION` (log mentions) | 8 (retry_scheduled warnings; non-terminal) |
| `AUTHORITY_UNAVAILABLE` | 0 |
| `HANDLER_FAILED` | 0 |
| `FAILED_JOBS_POST_T0` (BullMQ battery.v2) | **0** |

`NEW_FAILURE_CLASSES=none`  
`RECURRENT_KNOWN_FAILURE_CLASSES=LOCK_CONTENTION` (observation-classify retries; no terminal job failures)  
`UNRESOLVED_FAILURES=0`

---

## Step 11 — Duplicates / idempotency

| Check | Value |
|-------|-------|
| `NEW_LOGICAL_DUPLICATES` | 0 |
| `IDEMPOTENCY_VIOLATIONS` | 0 |
| `dup_assess` | 0 |
| `dup_pub` | 0 |

---

## Step 12 — Reservations / reconciliation

| Check | Value |
|-------|-------|
| `ACTIVE_RESERVATIONS` | 0 |
| `STALE_RESERVATIONS` | 0 |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| `REPEATED_REPAIR_IDENTITIES` | NO material loop |

122 ticks at steady 5-minute cadence; primary path not masked by reconciliation rescue.

---

## Step 13 — PM2 / scheduler ≥6h window

| Check | Result |
|-------|--------|
| `PM2_6H_HEALTH` | PASS |
| `UNEXPECTED_RESTARTS_POST_T0` | 0 |
| `CRASH_LOOPS` | 0 |
| `SCHEDULER_6H_HEALTH` | PASS |
| `LEADER_CHANGES_POST_ACTIVATION` | 0 unexpected |
| `MULTI_LEADER_PERIODS` | 0 |
| `ZERO_LEADER_PERIODS` | 0 (post-convergence) |
| `READINESS_FAILURES` | 0 |

---

## Step 14 — Representative E2E chains

**None.** No natural VALID REST→assess→publication chain exists in the ≥6h window. Cannot fabricate representative chains.

Partial activity documented:
- **KS MS 661:** 58 LIVE_VOLTAGE observations (observation classify path active); 3 LV_REST_WINDOW sessions; driving/active pattern prevents completed VALID REST.
- **WOB L 7503 / KS MS 661:** backfill REST evaluations only (contaminated).

---

## Step 15 — Adversarial falsification

| # | Challenge | Resolution |
|---|-----------|------------|
| 1 | Publications from pre-T0/backfill? | **Disproved** — 0 publications post-T0 |
| 2 | Vehicle stuck while aggregate healthy? | **No defect** — KS MS 661 active/driving; REST anchors pending/not yet due |
| 3 | Reconciliation rescuing all broken handoffs? | **No** — 0 assessments; reconciliation not masking primary-path success |
| 4 | Duplicate work via different PKs? | **Disproved** — dup counts 0 |
| 5 | Scheduler instability hidden? | **Disproved** — stable 1 leader entire window |
| 6 | Failed queue cleanup hiding failures? | **Disproved** — FAILED_JOBS_POST_T0=0 |
| 7 | Wrong REST window in assess selection? | **N/A** — no assessments created |
| 8 | Repeated EWMA/hysteresis? | **Disproved** — 0 publications |
| 9 | Due REST silently missed? | **Disproved** — backfill targets evaluated; 0 pipeline-missing |
| 10 | One lucky vehicle masks another failure? | **N/A** — no E2E success on any vehicle |

---

## Step 16 — Final gate decision

**Minimum for `PRODUCTION_VALIDATED=YES` not met:**

- ❌ No natural post-T0 VALID REST measurement
- ❌ No canonical assessment
- ❌ No customer publication

**Infrastructure and safety gates met:**

- ✅ Stage-2 contract stable ≥6h
- ✅ Control plane continuous
- ✅ No unsafe pre-T0 leakage
- ✅ No pipeline defect for due VALID opportunities
- ✅ No new failure class / duplicates / reservation leak / reconciliation storm
- ✅ PM2/scheduler healthy
- ✅ Full fleet explained

→ **`PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`**

---

## Machine-readable block

```
BATTERY_V2_M3_1_STAGE2_6H_AUDIT=COMPLETE
NEW_STAGE2_T0=2026-09-05T23:36:12Z
CURRENT_UTC=2026-09-06T10:06:57Z
ELAPSED_SINCE_STAGE2_T0=10.51h

STAGE2_RUNTIME_CONTRACT=PASS
CANONICAL_CONTROL_PLANE_CONTINUOUS=YES

CONNECTED_FLEET_SIZE=6
LV_REST_ELIGIBLE_FLEET_SIZE=5
VEHICLES_WITH_QUALIFYING_REST_OPPORTUNITY=2
VEHICLES_WITH_NATURAL_VALID_REST=0
VEHICLES_WITH_NATURAL_ASSESSMENT=0
VEHICLES_WITH_NATURAL_PUBLICATION=0

NATURAL_VALID_REST_60M_MEASUREMENTS_POST_T0=0
NATURAL_VALID_REST_6H_MEASUREMENTS_POST_T0=0
NATURAL_VALID_REST_MEASUREMENTS_TOTAL=0

NATURAL_ASSESSMENTS_POST_T0=0
PUBLICATION_HANDOFFS_POST_T0=0
BATTERY_PUBLICATIONS_POST_T0=0

NATURAL_VALID_REST_EVIDENCE_PROVEN=NO
NATURAL_ASSESSMENT_EVIDENCE_PROVEN=NO
NATURAL_PUBLICATION_EVIDENCE_PROVEN=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO

DUE_REST_TARGETS_TOTAL=4
DUE_REST_TARGETS_SUCCESSFUL=0
DUE_REST_TARGETS_EXPECTED_REJECTION=4
DUE_REST_TARGETS_PIPELINE_MISSING=0
DUE_REST_TARGETS_UNRESOLVED=0

PRE_T0_ASSESSMENTS_CREATED_SINCE_STAGE2_T0=0
PRE_T0_PUBLICATION_HANDOFFS_CREATED_SINCE_STAGE2_T0=0
PRE_T0_CUSTOMER_PUBLICATIONS_CREATED_SINCE_STAGE2_T0=0

NEW_FAILURE_CLASSES=none
NEW_LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
RESERVATION_LEAK=NO
RECONCILIATION_STORM=NO

PM2_6H_HEALTH=PASS
SCHEDULER_6H_HEALTH=PASS
MULTI_LEADER_PERIODS=0
ZERO_LEADER_PERIODS=0

FULL_FLEET_ELIGIBILITY_EXPLAINED=YES
UNEXPLAINED_STUCK_ELIGIBLE_VEHICLES=0

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
```
