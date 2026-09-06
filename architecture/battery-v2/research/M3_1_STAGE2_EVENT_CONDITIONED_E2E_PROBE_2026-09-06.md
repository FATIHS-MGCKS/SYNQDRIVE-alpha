# M3.1 Stage-2 — Event-Conditioned Natural E2E Evidence Probe

**Probe timestamp:** `2026-09-06T21:39:25Z`  
**Canonical T0:** `2026-09-05T23:36:12Z`  
**Prior lifecycle audit:** `2026-09-06T10:06:57Z` (`LIFECYCLE_AUDIT=PASS`)  
**Release / SHA:** `20260905231643_v4994` / `a4377f3a200ca45a97b7ce422caf8d92faddabbe`  
**Production changed:** NO

## Executive verdict

| Field | Value |
|-------|-------|
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** |
| `M3_1_STATUS` | **STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE** |
| `NATURAL_END_TO_END_CHAIN_PROVEN` | **NO** |
| `TODAY_DUE_TARGETS_PIPELINE_MISSING` | **0** |

Two real evening trip completions produced canonical REST session activity, including the **first post-T0 RESTING promotion on KS MX 2024**, but **no natural VALID REST measurement, assessment, or publication** has matured yet at probe time. WOB L 7503 evening REST_60M evaluated **CONTAMINATED_BY_ACTIVE_TRIP** (vehicle resumed driving). KS MX 2024 REST_60M was **past due and ENQUEUED within retry grace** — lifecycle correct, E2E chain pending evaluation outcome (see maturity follow-up below).

> **Terminology correction:** At `21:39:25Z`, KS MX REST_60M was **not** `NOT_YET_DUE` (due_at `21:00:44Z` had passed). Correct target-phase labels: **`TARGET_DUE` + `RETRY_PENDING` / `EXPECTED_WAIT_FOR_TELEMETRY`**. The prior label `REST_PENDING_NOT_YET_DUE` conflated E2E chain immaturity with target due state. Maturity probe: `M3_1_STAGE2_KS_MX_2024_REST60M_MATURITY_PROBE_2026-09-06.md`.

---

## Step 1 — Today's moved vehicles

**Telemetry (completed trips `2026-09-06` UTC):**

| Vehicle | Trips today | Last trip end | Post-audit trip? | Current state (probe) |
|---------|-------------|---------------|------------------|------------------------|
| HMÜ C 215 | 4 | `16:09:59Z` | yes | RESTING; LV 12.868V @ anchor |
| KS MS 661 | 5 | `15:51:42Z` | yes | RESTING |
| WOB L 7503 | 2 | `19:36:13Z` | yes | POSSIBLE_START (driving) |
| KS MX 2024 | 1 | `20:00:44Z` | yes | RESTING; promoted session ACTIVE |

**Operator event pair (evening completions):** **WOB L 7503** and **KS MX 2024** — the two vehicles whose post-audit trips ended `19:36Z` and `20:00Z` and triggered new LV_REST_WINDOW arming at `20:22:30Z`.

`TODAY_COMPLETED_TRIP_VEHICLES=4` (fleet DB); **event probe subjects = 2** (WOB L 7503, KS MX 2024).

---

## Step 2 — Post-trip REST lifecycle

### Vehicle 1 — WOB L 7503

| Field | Value |
|-------|-------|
| `TRIP_END_AT` | `2026-09-06T19:36:13.270Z` (trip `5d37b58f…`) |
| `REST_CANDIDATE_CREATED_AT` | `2026-09-06T20:22:30.001Z` |
| `REST_CANDIDATE_ID` | `ea8bc9e4-80ef-414f-a3f2-1a94a9bb65b8` |
| `PROMOTED_TO_RESTING` | **NO** |
| `RESTING_PROMOTED_AT` | — |
| `SESSION_ID` | `ea8bc9e4…` |
| `SESSION_STATUS` | `PLANNED` / FSM `CANDIDATE` |
| `INVALIDATED` | NO (still open CANDIDATE at probe) |
| `CURRENT_ACTIVITY_STATE` | `POSSIBLE_START`; speed 18 km/h; ignition on |

**Why not promoted:** Arming log `promoted=false`. At finalize (`20:22:30`), no post-anchor observation with plausible LV voltage for immediate `REST_SNAPSHOT` promotion (latest provider observation predates anchor `19:35:43` vs anchor `19:36:13`). Canonical predicate: **telemetry quality insufficient for CANDIDATE→RESTING fast-path** — not a bypass; reconciliation still arms CANDIDATE and schedules due targets per PLANNED liveness policy.

### Vehicle 2 — KS MX 2024

| Field | Value |
|-------|-------|
| `TRIP_END_AT` | `2026-09-06T20:00:44.000Z` (trip `c2d99942…`) |
| `REST_CANDIDATE_CREATED_AT` | `2026-09-06T20:22:30.004Z` |
| `REST_CANDIDATE_ID` | `82324f65-0b09-4312-a26f-6bc893d85fb5` |
| `PROMOTED_TO_RESTING` | **YES** |
| `RESTING_PROMOTED_AT` | `2026-09-06T20:00:44.000Z` (`confirmedRestingAt`) |
| `SESSION_ID` | `82324f65…` |
| `SESSION_STATUS` | `ACTIVE` / FSM `RESTING` |
| `INVALIDATED` | NO |
| `CURRENT_ACTIVITY_STATE` | RESTING; speed 0; LV 12.15V @ `20:00:44` |

**Arming log:** `promoted=true` — first post-T0 natural RESTING promotion on this vehicle.

---

## Step 3 — Target scheduling

### WOB L 7503 (`ea8bc9e4`, CANDIDATE)

| Target | Expected | due_at | Status @ probe | Classification |
|--------|----------|--------|----------------|----------------|
| REST_60M | YES (reconciliation PLANNED liveness) | `20:36:13Z` | COMPLETED (eval `21:22:29Z`) | **EVALUATED** |
| REST_6H | YES | `01:36:13Z` (+1d) | not scheduled in metadata | **NOT_YET_DUE** |

### KS MX 2024 (`82324f65`, RESTING)

| Target | Expected | due_at | Quality window | Status @ probe | Classification |
|--------|----------|--------|----------------|----------------|----------------|
| REST_60M | YES | `21:00:44Z` | `[20:45:44Z, 21:15:44Z]` | ENQUEUED; `lastAttemptAt=21:32:29Z` | **TARGET_DUE + RETRY_PENDING** |
| REST_6H | YES | `2026-09-07T02:00:44Z` | — | ENQUEUED | **NOT_YET_DUE** |

No `PIPELINE_MISSING` or `UNRESOLVED` targets on either probe vehicle.

---

## Step 4 — Target evaluation

| Vehicle | Target | Eval time | observed_at | created_at | Quality | Classification |
|---------|--------|-----------|-------------|------------|---------|----------------|
| WOB L 7503 | REST_60M | `21:22:29Z` | `19:35:43Z` (pre trip-end) | `21:22:29Z` | CONTAMINATED_BY_ACTIVE_TRIP | **NATURAL_CONTAMINATED** |
| WOB L 7503 | REST_6H (earlier session) | `17:35:43Z` | `10:14:57Z` | — | CONTAMINATED_BY_WAKE | backfill window |
| KS MS 661 | REST_60M (parallel) | `20:37:29Z` | `15:50:46Z` | — | CONTAMINATED_BY_ACTIVE_TRIP | NATURAL_CONTAMINATED |
| KS MX 2024 | REST_60M | — | — | — | — | **NO_MEASUREMENT_YET** (job ENQUEUED) |

Post-T0 VALID REST with `observed_at >= T0`: **0 rows**.

```
NATURAL_VALID_REST_60M_FOUND=NO
NATURAL_VALID_REST_6H_FOUND=NO
```

---

## Step 5 — Assessment chain

No `battery_assessments` rows created since lifecycle audit. Handoffs on contaminated measurements: `POLICY_SKIPPED` (expected).

```
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
```

---

## Step 6 — Publication chain

No `battery_publications` since lifecycle audit.

```
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO
```

---

## Step 7 — Both probe vehicles (mandatory)

| Vehicle | Result | Rationale |
|---------|--------|-----------|
| **WOB L 7503** | **QUALITY_REJECTED_EXPECTED** | CANDIDATE never RESTING; REST_60M evaluated contaminated; vehicle driving again |
| **KS MX 2024** | **TARGET_DUE + RETRY_PENDING** (E2E pending) | RESTING + targets scheduled; REST_60M past due (`21:00:44Z`), quality window closed (`21:15:44Z`), retry grace active until `21:45:44Z`; ENQUEUED — chain not yet mature |

No due target silently lost on either vehicle.

**HMÜ C 215 (context):** 4 trips today; trip `926488b2` retro-finalized `19:35:45Z` via gap-split repair; **zero** LV_REST_WINDOW sessions — **NO_REST_OPPORTUNITY** on battery arming path for retro-repaired finalize (no `LV rest window armed` log for `8c850ff1`). Not a probe-subject defect; separate bridge reachability note.

---

## Step 8 — Global safety delta (since lifecycle audit)

| Check | Result |
|-------|--------|
| BullMQ terminal failures (battery.v2) | 0 new |
| `54000` | 0 |
| `LOCK_CONTENTION` | Recurrent non-terminal retries (session-open KS MS 661; one REST_TARGET_EVALUATE WOB); no lost post-T0 evening work |
| `AUTHORITY_UNAVAILABLE` | 0 |
| Logical duplicates (sessions/meas/assess/pub) | 0 (`count = distinct idempotency_key`) |
| Reservations | No leak observed |

```
NEW_FAILURE_CLASSES=none
NEW_LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
RESERVATION_LEAK=NO
RECONCILIATION_STORM=NO
```

---

## Step 9 — PM2 / scheduler

| Check | Result |
|-------|--------|
| PM2 | Both replicas online; synqdrive pid=3756465, synqdrive-b pid=3756672 |
| Restarts since lifecycle audit | +2 (controlled restart `2026-09-06T19:42:24Z`; uptime ~117m at probe) |
| SHA | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` (both) |
| Stage-2 flags | REST_SHADOW=true, PUBLICATION=true, RECONCILIATION=true |
| API health | ok @ probe |

```
PM2_HEALTH=PASS
SCHEDULER_HEALTH=PASS
SCHEDULER_LEADERS=1
MIXED_RUNTIME_CONFIG=NO
```

---

## Step 10 — Production validation decision

Criteria for `PRODUCTION_VALIDATED=YES` **not met**:

- No natural VALID REST measurement (`observed_at >= T0`)
- No assessment or publication chain
- KS MX E2E chain correctly **in progress**, not complete

Retain **PENDING_NATURAL_E2E_EVIDENCE**. No pipeline defect on either probe vehicle.

---

## Step 11 — Next natural evidence readiness

| Field | KS MX 2024 |
|-------|------------|
| `CURRENT_SESSION_ID` | `82324f65-0b09-4312-a26f-6bc893d85fb5` |
| `CURRENT_SESSION_STATE` | RESTING / ACTIVE |
| `REST_60M_DUE_AT` | `2026-09-06T21:00:44Z` |
| `REST_6H_DUE_AT` | `2026-09-07T02:00:44Z` |
| `CURRENT_TARGET_STATUS` | REST_60M ENQUEUED (evaluation pending) |
| `EARLIEST_MEANINGFUL_RECHECK_AT` | After REST_60M evaluation completes + assessment handoff tick (~5 min reconciliation cadence) |

WOB L 7503: no live VALID candidate (driving; contaminated evaluation).

```
NEXT_NATURAL_EVIDENCE_CANDIDATE=KS MX 2024
NEXT_MEANINGFUL_VALIDATION_AT=2026-09-06T21:45:00Z (REST_60M evaluation outcome + handoff)
```

Event-conditioned: re-probe when KS MX REST_60M metadata → COMPLETED and measurement quality known.

---

## Maturity follow-up — KS MX REST_60M (`21:53:34Z`)

Read-only maturity probe completed after retry grace. Full report: `M3_1_STAGE2_KS_MX_2024_REST60M_MATURITY_PROBE_2026-09-06.md`.

| Field | Value |
|-------|-------|
| `PREVIOUS_NOT_YET_DUE_CLASSIFICATION_CORRECT` | **NO** |
| `TARGET_STATE` | **COMPLETED** @ `21:53:29Z` |
| `MEASUREMENT_RESULT` | **NATURAL_CONTAMINATED** (`CONTAMINATED_BY_WAKE`; no in-window telemetry) |
| `NATURAL_VALID_REST_60M_FOUND` | **NO** |
| `NATURAL_END_TO_END_CHAIN_PROVEN` | **NO** |
| KS MX classification | **QUALITY_REJECTED_EXPECTED** (policy-correct; not pipeline defect) |
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** (unchanged) |
| Next candidate | REST_6H due `2026-09-07T02:00:44Z` on same session |

> **REST_6H follow-up (`22:14Z`):** Pre-due probe — ENQUEUED; DIMO wake-only LV proven; `M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY`. Full report: `M3_1_STAGE2_KS_MX_2024_REST6H_MATURITY_PROBE_2026-09-06.md`. Re-probe after `2026-09-07T03:30:44Z`.

---

## Final machine-readable block

```
BATTERY_V2_M3_1_EVENT_CONDITIONED_E2E_PROBE=COMPLETE

CANONICAL_STAGE2_T0=2026-09-05T23:36:12Z

TODAY_COMPLETED_TRIP_VEHICLES=4

VEHICLE_1=WOB L 7503
VEHICLE_1_RESULT=QUALITY_REJECTED_EXPECTED
VEHICLE_1_TRIP_END_AT=2026-09-06T19:36:13.270Z
VEHICLE_1_RESTING_PROMOTED=NO
VEHICLE_1_REST_60M_DUE_AT=2026-09-06T20:36:13.270Z
VEHICLE_1_VALID_REST=NO
VEHICLE_1_ASSESSMENT=NO
VEHICLE_1_PUBLICATION=NO

VEHICLE_2=KS MX 2024
VEHICLE_2_RESULT_AT_EVENT_PROBE=TARGET_DUE_RETRY_PENDING
VEHICLE_2_RESULT_AT_MATURITY_PROBE=QUALITY_REJECTED_EXPECTED
VEHICLE_2_TRIP_END_AT=2026-09-06T20:00:44.000Z
VEHICLE_2_RESTING_PROMOTED=YES
VEHICLE_2_REST_60M_DUE_AT=2026-09-06T21:00:44.000Z
VEHICLE_2_VALID_REST=NO
VEHICLE_2_ASSESSMENT=NO
VEHICLE_2_PUBLICATION=NO
PREVIOUS_NOT_YET_DUE_CLASSIFICATION_CORRECT=NO
MATURITY_PROBE=2026-09-06T21:53:34Z
MATURITY_TARGET_STATE=COMPLETED
MATURITY_MEASUREMENT_RESULT=NATURAL_CONTAMINATED

NATURAL_VALID_REST_60M_FOUND=NO
NATURAL_VALID_REST_6H_FOUND=NO
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO

TODAY_DUE_TARGETS_PIPELINE_MISSING=0
TODAY_UNRESOLVED_REST_LIFECYCLES=0

NEW_FAILURE_CLASSES=none
NEW_LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
RESERVATION_LEAK=NO
RECONCILIATION_STORM=NO

PM2_HEALTH=PASS
SCHEDULER_HEALTH=PASS
SCHEDULER_LEADERS=1
MIXED_RUNTIME_CONFIG=NO

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE

NEXT_NATURAL_EVIDENCE_CANDIDATE=KS MX 2024
NEXT_MEANINGFUL_VALIDATION_AT=2026-09-06T21:45:00Z

PRODUCTION_CHANGED=NO
```
