# TDL-OQ-005 — `TripDetectionState.ENDED` lifecycle / removal audit (read-only)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ005-ENDED-001 |
| **Observed at (UTC)** | `2026-09-26` |
| **Repository baseline** | `origin/main` @ `97cfde3d6679e9230e10a0d39ee73403f32b9b35` (task-creation anchor; audit executed on descendant `f16ae03c0…` — no `TripDetectionState.ENDED` delta in between) |
| **Production baseline (task)** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `20260925182907_v4994` |
| **Production DB observation** | Read-only SQL @ live VPS DB `2026-09-26T~10:55Z` (current release on VPS `20260926094359_v4994` / `2b54a357…` — same PostgreSQL fleet data) |
| **Audit mode** | READ_ONLY |
| **Verdict** | **`ENDED_HISTORICAL_COMPAT_ONLY`** |

## Executive summary

`TripDetectionState.ENDED` is a **PostgreSQL / Prisma enum label** present since the trip FSM bootstrap migration. **Current TypeScript has zero reads or writes** of `TripDetectionState.ENDED`. The live FSM completes trips at **`VehicleTrip.tripStatus=COMPLETED`** and returns the per-vehicle detector to **`RESTING`** (not `ENDED`).

Production read-only counts: **`0`** live `vehicle_trip_detection_states` rows in `ENDED`; **`0`** historical `vehicle_trip_tracking_runs` with `state_at_run` or `result_state` = `ENDED` (all-time). Removal is **not** a runtime delete in this PR — it requires a **separate PostgreSQL enum migration + Prisma regen** slice (`SAFE_TO_REMOVE_AFTER_DATA_MIGRATION`). **Repurpose is unsafe** (`REPURPOSE_UNSAFE`).

---

## Phase 1 — Schema surface

Prisma enum (`backend/prisma/schema.prisma`):

```prisma
enum TripDetectionState {
  RESTING
  POSSIBLE_START
  ACTIVE_TRIP
  IDLE_WITHIN_TRIP
  POSSIBLE_END
  ENDED
}
```

| MODEL | FIELD | NULLABLE | DEFAULT | CURRENT_PURPOSE |
|-------|-------|----------|---------|-----------------|
| `VehicleTripDetectionState` | `state` | NO | `RESTING` | Live per-vehicle FSM state (unique `vehicleId`) |
| `VehicleTripTrackingRun` | `stateAtRun` | NO | — | FSM state at start of tracking run (append-only log) |
| `VehicleTripTrackingRun` | `resultState` | YES | — | FSM state after run completes (nullable) |

**`TRIP_DETECTION_STATE_FIELD_COUNT=3`**

No other Prisma fields use `TripDetectionState` (repository grep @ baseline).

---

## Phase 2 — Runtime reference inventory

Repository-wide search @ `origin/main` descendant:

| Pattern | Production TypeScript result |
|---------|------------------------------|
| `TripDetectionState.ENDED` | **0** matches under `backend/src` |
| `transitionState(..., TripDetectionState.ENDED)` | **0** |
| `stateAtRun` / `resultState` assigned `ENDED` | **0** |

| Metric | Count | Notes |
|--------|------:|-------|
| **`ENDED_RUNTIME_READ_CALLS`** | **0** | No runtime read of enum member |
| **`ENDED_RUNTIME_WRITE_CALLS`** | **0** | No runtime write |
| **`ENDED_TEST_REFERENCES`** | **0** | No trip FSM test uses `TripDetectionState.ENDED` |
| **`ENDED_DOC_REFERENCES`** | **~12** | Authority + P2 audit + ChangesView battery `TRIP_ENDED` (unrelated enum) — see classification below |

**Classification of non-runtime mentions:**

| Location | Class |
|----------|-------|
| `schema.prisma` enum | **COMPATIBILITY** (schema contract) |
| `docs/audits/trip-fsm/P2_…` | **HISTORICAL** (2026-09-05 dead-enum finding) |
| TDL authority / OQ-007 matrix | **DOC** |
| `ChangesView` battery rest `TRIP_ENDED` | **UNRELATED** (not `TripDetectionState`) |

---

## Phase 3 — Transition graph (current live FSM)

**Terminal path after successful finalize** (`TripDetectionOrchestrationService.processFinalize`):

```
POSSIBLE_END
  → END_VALIDATION / FINALIZE (trip-tracking queue)
  → TripDecisionEngine.finalizeTrip → VehicleTrip COMPLETED
  → transitionState(RESTING, activeTripId: null, …)
```

| Question | Answer |
|----------|--------|
| **`CURRENT_RUNTIME_CAN_ENTER_ENDED`** | **NO** |
| **`CURRENT_RUNTIME_CAN_EXIT_ENDED`** | **NO** (no writer; recovery never selects `ENDED`) |
| **`CURRENT_TERMINAL_FSM_STATE_AFTER_COMPLETION`** | **`RESTING`** |

**Not observed in current code:**

- `POSSIBLE_END → ENDED`
- `ENDED → RESTING`
- `ACTIVE_TRIP → ENDED`

Inspect surfaces: `TripDecisionEngine`, `TripDetectionOrchestrationService`, `TripLifecycleRecoveryService`, `TripTrackingProcessor`, `TripTrackingRecoveryScheduler`, snapshot polling tier (`derive-snapshot-polling-tier.ts`), `DimoSnapshotProcessor` — all use the five live states only.

---

## Phase 4 — Production live state (read-only SQL)

**Query window:** `2026-09-26` UTC on live Production PostgreSQL.

| `state` | Count |
|---------|------:|
| RESTING | 6 |
| POSSIBLE_START | 0 |
| ACTIVE_TRIP | 0 |
| IDLE_WITHIN_TRIP | 0 |
| POSSIBLE_END | 0 |
| **ENDED** | **0** |

**`LIVE_ENDED_STATE_ROWS=0`**

No ENDED rows → no age / `activeTripId` / trip-status forensics required. Scheduler-eligible cohort matches OQ-003 (**6** rows, all **RESTING** at observation time).

---

## Phase 5 — Historical tracking rows

| Metric | Value |
|--------|------:|
| **`TRACKING_STATE_AT_RUN_ENDED_ALL_TIME`** | **0** |
| **`TRACKING_RESULT_STATE_ENDED_ALL_TIME`** | **0** |
| **`TRACKING_ENDED_LAST_30D`** | **0** (both columns) |
| **`TRACKING_ENDED_LAST_7D`** | **0** (both columns) |
| Earliest / latest ENDED tracking row | **NULL** (no rows) |

**Implication:** Production PostgreSQL has **never persisted** `ENDED` in tracking runs (at least on current fleet DB). Enum label removal still requires **Postgres enum migration mechanics**, not merely `DELETE` rows.

---

## Phase 6 — Migration history

| Question | Answer |
|----------|--------|
| **`WHEN_ENDED_INTRODUCED`** | **`20260325161141_ci_r3b_bootstrap_trip_schema_baseline`** — `TripDetectionState` created with **`ENDED`** as sixth value |
| **`WHY_ENDED_INTRODUCED`** | **UNKNOWN** — no migration comment or decision record in repo; P2 audit (`TDL-EV-P2-001`) hypothesized legacy “ended-but-not-resting” phase; **not proven from git history** |
| **`WHEN_RUNTIME_STOPPED_USING_ENDED`** | **UNKNOWN (likely never wired in TypeScript)** — `git log -S 'TripDetectionState.ENDED' -- backend/` returns **no** commits; Production release `8a1d9c658…` orchestration also has **zero** `TripDetectionState.ENDED` |

Historical design reference (supporting, not authority): P2 audit documents intended five-state live engine + dead sixth enum.

---

## Phase 7 — Recovery / wake / stranding

**`TripTrackingRecoveryScheduler`** cohort (`trip-tracking-recovery.scheduler.ts`):

- `POSSIBLE_START`, `ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END` only — **`ENDED` excluded**

**Fast reconciliation / active-trip polling** (`ACTIVE_TRIP_DETECTION_STATES`): same four non-RESTING states — **no `ENDED`**.

| Flag | Value |
|------|-------|
| **`ENDED_RECOVERY_SUPPORTED`** | **NO** |
| **`ENDED_WAKE_SUPPORTED`** | **NO** (R9 wake path targets RESTING vehicles; tier logic uses five live states) |
| **`ENDED_SCHEDULER_SUPPORTED`** | **NO** |
| **`ENDED_STRANDING_RISK`** | **LOW_IF_ROW_APPEARED** — a hypothetical `ENDED` row would **not** be enqueued by recovery or fast cohort; would require manual repair / reconciliation — **no such rows observed** |

---

## Phase 8 — API / serialization contract

| Surface | `ENDED` exposure |
|---------|------------------|
| Admin vehicle logbook | Returns raw `VehicleTripDetectionState.state` from Prisma — **could serialize `ENDED` if a row existed** |
| Public rental trip APIs | **No** dedicated FSM enum DTO found |
| Frontend product UI | **No** `TripDetectionState` union consumer located |
| Analytics exports | **NONE** identified |

| Field | Value |
|-------|-------|
| **`ENDED_EXTERNAL_API_CONTRACT`** | **IMPLICIT_PRISMA_SERIALIZATION_ONLY** |
| **`ENDED_FRONTEND_CONSUMER`** | **NONE** |
| **`ENDED_ANALYTICS_CONSUMER`** | **NONE** |

---

## Phase 9 — Repurpose test

No new lifecycle semantic requires recycling the **`ENDED`** label. Historical enum + Prisma client + potential admin logbook string would inherit old meaning.

**`REPURPOSE_DECISION=REPURPOSE_UNSAFE`**

---

## Phase 10 — Removal safety

| Classification | **`SAFE_TO_REMOVE_AFTER_DATA_MIGRATION`** |

Rationale:

- **Live + tracking Production counts = 0** → no row backfill required **today**
- **PostgreSQL `ALTER TYPE … DROP VALUE`** (or rebuild enum) still mandatory — not equivalent to deleting a TS enum member
- **Prisma client regen** + any raw SQL / dashboards referencing `'ENDED'`
- **Rollback:** retained releases through `8a1d9c658…` also **lack** TS writers — **`ROLLBACK_RELEASE_CAN_USE_ENDED=NO`** (read-only enum in schema only)
- **`ROLLBACK_COMPATIBILITY_BLOCKS_REMOVAL=NO`** for runtime behavior; **YES** for conservative enum migration discipline (verify older app versions tolerate client without `ENDED`)

**Not** `SAFE_TO_REMOVE_NOW` — schema/migration slice required.

---

## Phase 11 — Rollback compatibility

Verified `git show 8a1d9c658…` on `trip-detection-orchestration.service.ts`: **no** `TripDetectionState.ENDED`.

| Field | Value |
|-------|-------|
| **`ROLLBACK_RELEASE_CAN_USE_ENDED`** | **NO** (no TS read/write in retained release tree) |
| **`ROLLBACK_COMPATIBILITY_BLOCKS_REMOVAL`** | **NO** for execution semantics; enum migration still needs staged deploy |

---

## Phase 12 — Decision

**Architectural principle (confirmed):** Trip terminality lives on **`VehicleTrip`** (`COMPLETED` / `CANCELLED`); the detector returns to **`RESTING`**.

| Decision | **`ENDED_HISTORICAL_COMPAT_ONLY`** |

Map to user options:

| Option | Verdict |
|--------|---------|
| A) Active runtime state | **Rejected** |
| B) Historical compatibility only | **Selected** |
| C) Remove now | **Rejected** — use follow-up migration slice |
| D) Repurpose | **Rejected** |

**`OQ005_STATUS_AFTER=CLOSED`**

**`TDL_OQ_005_AUDIT_RESULT=ENDED_HISTORICAL_COMPAT_ONLY`**

**`NEW_RUNTIME_DEFECT_FOUND=NO`**

---

## Phase 13 — Follow-up plan (docs only — do not execute)

Future **runtime/schema PR** (separate workstream):

1. Re-run Production SQL gate: `LIVE_ENDED_STATE_ROWS=0` and tracking ENDED counts = 0.
2. Confirm no external dashboards reference `'ENDED'::"TripDetectionState"`.
3. Choose PostgreSQL strategy: new enum type + column cast, or `ALTER TYPE … DROP VALUE` on PG ≥ version supporting safe drop (with transaction lock window).
4. Remove `ENDED` from Prisma enum; `prisma migrate` + `generate`.
5. Update tests, admin logbook copy, authority docs.
6. Deploy migration **before** or **with** app that no longer references enum member.
7. Rollback plan: forward-only migration or retain compat view until dual-write window ends.

Until then: mark **`ENDED`** **deprecated** in authority (this document); **do not** remove from schema in OQ-005.

---

## Phase 14 — TDL open-question / promotion status

After OQ-005 closure: **TDL-OQ-001 … TDL-OQ-010** all **CLOSED**.

| Field | Value |
|-------|-------|
| **`OPEN_TDL_OQ_COUNT_AFTER`** | **0** |
| **`ALL_TDL_OPEN_QUESTIONS_CLOSED`** | **YES** |
| **`AUTHORITY_ACTIVE_PROMOTION_READY`** | **NO** |
| **`PROMOTION_BLOCKERS`** | Module remains **`AUDIT_IN_PROGRESS`** per [`MODULE_AUTHORITY_STANDARD.md`](../../MODULE_AUTHORITY_STANDARD.md) Phase 5 gate; full FSM graph incomplete; QS V1 **`PASS_WITH_EVIDENCE_GAPS`**; central registry not promoted; ENDED removal is optional future slice — **not** a blocker once documented |

**BLOCKERS=NONE** for OQ-005 closure.

**NEXT_ACTION=** Optional follow-up schema PR to drop `ENDED` after enum migration design; resolve TDL-CX-003 schema-debt contradiction in authority when migration lands.
