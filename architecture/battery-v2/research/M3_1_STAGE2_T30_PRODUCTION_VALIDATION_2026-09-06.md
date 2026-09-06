# M3.1 Corrected Stage-2 — T+30m Production Validation Evidence

**Audit timestamp:** `2026-09-06T00:06:41Z`  
**Canonical T0:** `2026-09-05T23:36:12Z`  
**T+30m eligibility:** `2026-09-06T00:06:12Z` ✓  
**Release / SHA:** `20260905231643_v4994` / `a4377f3a200ca45a97b7ce422caf8d92faddabbe` (unchanged since activation)

## Step 1 — Activation docs (PR #1536)

| Field | Value |
|-------|-------|
| `PR_1536_MERGED` | YES |
| `PR_1536_MERGE_SHA` | `4a30d006e6af2b87ebf2d50040d0d4c15fd109d2` |
| Scope | Documentation-only (3 architecture files) |

## Step 2 — Production identity & Stage-2 contract

| Check | Result |
|-------|--------|
| Both PM2 replicas | online (synqdrive:3001 pid=3519043, synqdrive-b:3002 pid=3519236) |
| PM2 restarts since activation | +1 each only (controlled rolling restart); no unexpected restarts |
| Readiness | ok both replicas |
| Scheduler | 3001=LEADER, 3002=FOLLOWER, `SCHEDULER_LEADERS=1` |
| `MIXED_SHA` | NO |
| `MIXED_RUNTIME_CONFIG` | NO |
| `REPLICA_A_STAGE2_CONTRACT` | PASS |
| `REPLICA_B_STAGE2_CONTRACT` | PASS |
| Effective flags | `REST_SHADOW=true`, `PUBLICATION=true`, `RECONCILIATION=true` |

## Step 3 — T+30m expectation (code-derived)

At T+30m after activation, a **new** rest anchor started post-T0 cannot normally complete a 60-minute REST target. Therefore **absence of a VALID post-T0 REST_60M alone is not a failure gate**.

Distinguish:

| Category | Expected at T+30m |
|----------|-------------------|
| **Control plane** | Reconciliation ticks, observation classify, LV rest session arming, target evaluation for eligible vehicles |
| **Completed natural REST E2E** | May not yet exist; VALID REST→assess→publication chain requires qualifying vehicle state + time |

`T30_EXPECTATION_RECONSTRUCTED=YES`

## Step 4 — Full-fleet eligibility (6 connected DIMO vehicles)

| Vehicle (plate) | Fuel | Telemetry | Post-T0 meas | Post-T0 session | Classification |
|-----------------|------|-----------|--------------|-----------------|----------------|
| WOB L 7503 | GASOLINE | active (LV 14.2V) | 1 REST_60M | 1 LV_REST_WINDOW | REST target evaluated (contaminated backfill) |
| KS FH 660E | ELECTRIC | active (SOC 92%) | 0 | 0 | **EV_NO_LV_REST_PATH** |
| HMÜ C 215 | GASOLINE | active (LV 12.8V) | 0 | 0 | **REST_TARGET_NOT_YET_DUE** / idle (last meas prior day) |
| KS MX 2024 | GASOLINE | active (LV 12.2V) | 0 | 0 | **REST_TARGET_NOT_YET_DUE** / idle |
| KS MS 661 | GASOLINE | active (LV 13.6V) | REST_60M + REST_6H | 1 LV_REST_WINDOW | REST targets evaluated (contaminated backfill) |
| WOB L 9755 | GASOLINE | stale telemetry (Aug 26) | 0 | 0 | **OFFLINE / INELIGIBLE** |

No vehicle showed a due-but-missing REST target where code contract required evaluation and none occurred for eligible connected ICE/LV paths.

## Step 5 — Control-plane proof (post-T0)

**Not the old failure mode** (`restSessions=0`, `restTargets=0` every tick with pipeline config-blocked).

### Reconciliation ticks (retained PM2 log + activation evidence)

| Time (UTC) | obs | restSessions | restTargets | assess | pub |
|------------|-----|--------------|-------------|--------|-----|
| 23:40:43* | 3 | 6 | 3 | 2 | 0 |
| 23:45:42* | 2 | 4 | 0 | 2 | 0 |
| 00:00:45 | 3 | 4 | 0 | 2 | 0 |
| 00:05:43 | 3 | 4 | 0 | 2 | 0 |

\*From immediate activation evidence; rotated out of current log file but corroborated by DB timestamps.

| Metric | Value |
|--------|-------|
| `RECONCILIATION_TICKS` | ≥4 (2 in retained log; 2 from activation capture) |
| `OBSERVATION_CLASSIFY_JOBS` | >0 (6+ in retained ticks alone) |
| `REST_SESSIONS_CREATED` | 8+ (reconciliation counter); **2** `LV_REST_WINDOW` sessions in DB post-T0 |
| `REST_TARGETS_CREATED` | 3 evaluations at first tick (DB: 3 REST measurements post-T0) |
| `REST_TARGET_EVALUATIONS` | 3 |
| `REST_60M_TARGETS_PENDING` | 0 (evaluated → COMPLETED) |
| `REST_6H_TARGETS_PENDING` | 0 (evaluated → COMPLETED) |
| `CANONICAL_CONTROL_PLANE_PROVEN_ACTIVE` | **YES** |

## Step 6 — Post-T0 measurements / assessments / publications

Counts from **`2026-09-05T23:36:12Z`**:

| Metric | Count |
|--------|-------|
| `TOTAL_MEASUREMENTS_POST_T0` | 3 |
| `LIVE_VOLTAGE_MEASUREMENTS_POST_T0` | 0 |
| `REST_60M_MEASUREMENTS_POST_T0` | 2 |
| `REST_6H_MEASUREMENTS_POST_T0` | 1 |
| `ASSESSMENTS_POST_T0` | 0 |
| `PUBLICATION_HANDOFFS_POST_T0` | 0 |
| `BATTERY_PUBLICATIONS_POST_T0` | 0 |

**Trace:** All 3 post-T0 REST measurements have `observed_at` **before** T0 (historical rest-window backfill at first reconciliation tick). All are **non-VALID** (CONTAMINATED/MISSED) with handoff `EXECUTED/POLICY_SKIPPED`. This is control-plane + backfill evidence, **not** a matured VALID natural REST→assess chain.

| Field | Value |
|-------|-------|
| `NATURAL_CANONICAL_REST_EVIDENCE` | NO (no VALID post-T0 REST) |
| `NATURAL_ASSESSMENT_EVIDENCE` | NO |
| `NATURAL_PUBLICATION_EVIDENCE` | NO |
| `NO_REST_YET_EXPECTED` | Partial — backfill REST exists; VALID natural REST not yet expected at T+30m |

## Step 7 — PKG-01 old-backlog safety

| Metric | Value |
|--------|-------|
| `PKG01_ORIGINAL_TOTAL` | 24 |
| `PKG01_POLICY_SKIPPED` | 22 |
| `PKG01_STILL_ENQUEUED` | 5 |
| `PKG01_STALE_OUTSIDE_LOOKBACK` | 5 (8–9 days old) |
| `PKG01_VALID_REMAINING` | 0 |
| `PKG01_UNRESOLVED_REMAINING` | 0 |
| `PKG01_STALE_SAFE_INERT` | **YES** (all non-VALID; no assess/publication since T0) |
| `PKG01_PRE_T0_ASSESS_ENQUEUED` | 0 |
| `PKG01_PRE_T0_PUBLICATION_HANDOFFS` | 0 |
| `PKG01_PRE_T0_CUSTOMER_PUBLICATIONS` | 0 |

## Step 8 — Failure delta

| Check | Result |
|-------|--------|
| `54000` post-T0 | 0 |
| `LOCK_CONTENTION` post-T0 | 0 |
| `AUTHORITY_UNAVAILABLE` post-T0 | 0 |
| Scheduler error lines post-activation | 0 |
| `NEW_FAILURE_CLASSES` | none |
| `FAILED_DELTA_POST_STAGE2_T0` | clean |

Historical `battery.v2` failed queue depth (77) predates T0; no new failures since T0.

## Step 9 — Duplicates / idempotency

| Check | Result |
|-------|--------|
| `NEW_LOGICAL_DUPLICATES` | 0 |
| `IDEMPOTENCY_VIOLATIONS` | 0 (`dup_assess=0` post-T0) |

## Step 10 — Reservation / reconciliation health

| Check | Result |
|-------|-------|
| `ACTIVE_RESERVATIONS` | 0 |
| `STALE_RESERVATIONS` | 0 |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| `REPEATED_REPAIR_IDENTITIES` | NO material burst (assess repair counter in logs; 0 DB assessments) |

## Step 11 — PM2 / scheduler window (T0 → T+30m)

| Check | Result |
|-------|--------|
| `PM2_30M_HEALTH` | PASS |
| `UNEXPECTED_RESTARTS` | 0 (beyond controlled activation restart) |
| `SCHEDULER_30M_HEALTH` | PASS |
| `MULTI_LEADER_POST_ACTIVATION` | NO |
| `ZERO_LEADER_POST_ACTIVATION` | NO (transient zero-leader during activation rolling restart only) |

## Step 12 — Adversarial resolution

1. **REST dead despite flags?** Disproved — reconciliation active, sessions armed, targets evaluated.
2. **Missing sessions where eligible?** No defect found; offline/stale vehicle excluded; others not yet due or already processed.
3. **Pre-T0 contaminated → assess?** Disproved — 0 assessments post-T0.
4. **Pre-T0 → customer publication?** Disproved — 0 publications post-T0.
5. **Repeated reconciliation storm?** Disproved — steady 5-min cadence, bounded counters.
6. **Hidden duplicate PKs?** Disproved — 0 duplicate assess keys post-T0.
7. **Scheduler instability post-restart?** Disproved — stable LEADER/FOLLOWER.
8. **Failures hidden by queue cardinality?** Disproved — 0 new failure patterns in logs.
9. **Post-T0 REST is replay?** **Yes** — `observed_at` predates T0; backfill evaluation, not new anchor maturity.

## Step 13 — Verdict

| Field | Value |
|-------|-------|
| `T30_VALIDATION` | **PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE** |
| `M3_1_STATUS` | **STAGE2_ACTIVE_30M_VALIDATED_PENDING_6H** |
| `PRODUCTION_VALIDATED` | **PENDING_CORRECTED_ACTIVATION_EVIDENCE** |

## Next gate

Preserve `NEW_STAGE2_T0=2026-09-05T23:36:12Z`. Do **not** run ≥6h validation before **`2026-09-06T05:36:12Z`**.
