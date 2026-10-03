# P2.5 APD-PS3 — Production shadow policy gate (design)

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APD-PS3-001 |
| **Captured at (UTC)** | `2026-10-03T02:15:00Z` |
| **Authoritative input** | PS2B split certification (B2/B4 M3.3 certified) |
| **Production change** | **NONE** |
| **Runtime integration** | **NONE** (APDS-1 contracts only in repo) |

---

## A. Frozen policy definitions (canonical)

Source of truth: `backend/scripts/ops/p25-apd-replay-policy-core.mjs` (PS1/PS2) and TypeScript mirror `backend/src/workers/schedulers/snapshot-polling/adaptive-polling-policy/`.

### `P25_APD_B2_V1` (B2_HB10_IN1)

| Dimension | Definition |
|-----------|------------|
| **Eligibility** | Off-trip **reconciliation** SNAPSHOT opportunities only; active trip / non-reconciliation → **adaptive gating not applied** (`FORCED_TRIP_SAFETY`, production poll unchanged) |
| **Phase window** | `expectedMs = lastTrustworthyLvSourceMs + medianIntervalMs`; inside iff `\|nowMs - expectedMs\| ≤ 30m` |
| **Inside window** | Allow iff `nowMs - lastAllowedReconciliationPollMs ≥ 1m` |
| **Outside window** | Standby heartbeat: allow iff `nowMs - lastAllowed ≥ 10m` |
| **Profile** | Phase logic uses **median interval**; classifier does not change B2 branch logic (same as replay) |
| **State** | `lastAllowedReconciliationPollMs`, `lastTrustworthyLvSourceMs` updated only on **allowed** simulated polls |
| **Fallback** | None beyond heartbeat (no 5m non-stable branch in B2) |

### `P25_APD_B4_V1` (B4_PHASE_30M)

| Dimension | Definition |
|-----------|------------|
| **Eligibility** | Same trip bypass as B2 |
| **Non-STABLE_PERIODIC** | `MULTIMODAL`, `INSUFFICIENT_EVIDENCE`, `PROVIDER_OBSERVABILITY_GAP`, `SPARSE_IRREGULAR` → **5m** min interval between allowed reconciliation polls |
| **STABLE_PERIODIC inside ±30m** | **Allow** (no extra min-interval gate inside window) |
| **STABLE_PERIODIC outside window** | **5m** min interval |
| **Phase window** | Same ±30m around `lastLvSource + median` as B2 |
| **State / transitions** | Same as B2 |

### Profile classifier `P25_APD_PROFILE_CLASSIFIER_V1`

Unchanged from PS1: `classifyProfile(gapsSec, medianSec)` → `STABLE_PERIODIC` \| `MULTIMODAL` \| `INSUFFICIENT_EVIDENCE` \| `SPARSE_IRREGULAR`; production cohort may also label `PROVIDER_OBSERVABILITY_GAP` when strict-rest LV absent (PS1 table).

---

## B. Shadow decision input contract (pre-poll only)

At decision time `T`, shadow may use:

| Field | Source (production) |
|-------|---------------------|
| `organizationId`, `vehicleId` | Vehicle row |
| Capability / connectivity | `dimoVehicle.connectionStatus`, registry lifecycle |
| Trip FSM | `tripDetectionState.state`, active `vehicle_trips` |
| `lastTrustworthyLvSourceMs` | Latest **provider-qualified** strict-rest LV `provider_timestamp` (not fetch time) |
| `lastProviderFetchedAtMs` | `vehicle_latest_state.providerFetchedAt` (observability only) |
| `medianIntervalMs`, `profileClass` | Rolling classifier `P25_APD_PROFILE_CLASSIFIER_V1` on bounded LV gaps |
| Provider gap | `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP` outcome / gap flags |
| Reconnect | Connection episode timestamps (invalidates profile) |
| `lastAllowedReconciliationPollMs` | Shadow state machine per vehicle (initialized from last successful off-trip poll) |

**Forbidden:** post-poll payload, signals discovered by the poll under evaluation, future timestamps.

`SHADOW_DECISION_LOOKAHEAD_SAFE=YES` (same construction as PS1 `LOOKAHEAD_BIAS_CHECK`).

---

## C. Shadow decision model

Typed decisions (`p25-apd-shadow-decision.types.ts`):

`WOULD_POLL` \| `WOULD_SKIP` \| `FORCED_FALLBACK` \| `FORCED_TRIP_SAFETY` \| `FORCED_PROFILE_INVALID` \| `FORCED_SOURCE_TIMESTAMP_MISSING` \| `FORCED_PROVIDER_GAP` \| `FORCED_RECONNECT` \| `FORCED_INSUFFICIENT_PROFILE` \| `NOT_ELIGIBLE_ACTIVE_TRIP` \| `IMMEDIATE_SNAPSHOT_REQUIRED` (R9).

Reason stored separately (`P25ApdShadowDecisionReason`).

---

## D–E. Profile handling & invalidation

| Class | Shadow behavior |
|-------|-----------------|
| `STABLE_PERIODIC` | B4 phase tightening; B2 heartbeat only |
| `MULTIMODAL` | B4 → 5m fallback |
| `INSUFFICIENT_EVIDENCE` | `FORCED_INSUFFICIENT_PROFILE` (HMÜ conservative) |
| `PROVIDER_OBSERVABILITY_GAP` | `FORCED_PROVIDER_GAP` |
| `SPARSE_IRREGULAR` | B4 5m fallback |

Invalidation triggers (force conservative / invalidate `STABLE_PERIODIC` advisory):

- Trip start/end, R9 wake, vehicle/provider reconnect
- Missing LV source timestamp, provider gap open
- Unexpected early/late source advance vs confidence band
- Phase drift, capability change, insufficient recent evidence

Metrics (low cardinality): `profile_invalidated_total{reason}`, `profile_recovered_total`.

No hard-coded vehicle IDs; cohort gates are **org/feature-flag** scoped at activation time (APDS-9), not in policy math.

---

## F. Trip / R9 priority

Shadow records `FORCED_TRIP_SAFETY` / `IMMEDIATE_SNAPSHOT_REQUIRED` but **never** enqueues, suppresses, or reschedules.

Canonical R9 path unchanged:

`DIMO trigger → SnapshotWakeIntake → SnapshotWakeCoordinator → snapshot → Trip FSM`

Optional correlation fields: `wakeCorrelationId` (R9O-1/2 forensic row), `policyBackoffState` (future R9O-3/4).

---

## G. Battery V2 source-time invariants

Shadow decisions use **LV provider source time** for phase expectation, never `providerFetchedAt` as source time.

`actualRestAgeMs` / 8h ladder remain M3.3 metadata only — **no** exact 8h poll target introduced.

---

## H. Legacy REST surface (separate gate)

On each shadow `WOULD_SKIP` intersecting `LvRestWindow` REST_60M/6H target evaluation window, compute:

- `LEGACY_TARGET_IMPACT`
- `LEGACY_ASSESSMENT_IMPACT` (PS2: 3 WOB cases — non-blocking)
- `LEGACY_PUBLICATION_IMPACT` (blocker if > 0)
- `LEGACY_CUSTOMER_IMPACT` (blocker if > 0)

M3.3 primary semantic failure **excludes** assessment-only legacy diffs (PS2B frozen).

---

## I. R9O integration boundary

- **No** tight coupling to R9O-3/4 code paths.
- Forensic table `r9_provider_wake_forensic` link optional on shadow rows.
- R9O-3/4 may later join: backoff state, wake arrival, scheduled-poll latency avoided, coalescing, `ACTIVE_TRIP` timing.

---

## J. Durable shadow forensic record (design)

Proposed table `apd_shadow_reconciliation_decision` (APDS-4, not migrated in PS3):

| Column | Notes |
|--------|-------|
| `id`, `organizationId`, `vehicleId` | Tenant scoped |
| `decisionAt` | Pre-poll evaluation time |
| `realPollId`, `realPollStartedAt` | From `dimo_poll_logs` |
| `policyVersion` | `P25_APD_B2_V1` / `P25_APD_B4_V1` |
| `profileClass`, `profileVersion` | Classifier version persisted |
| `decision`, `reason` | Typed |
| `lastLvSourceAt`, `lastProviderFetchedAt` | Nullable |
| `expectedWindowStart`, `expectedWindowEnd` | Nullable |
| `realPollOccurred` | always `true` at insert |
| Post-fact (outcome job) | `newLvSourceObserved`, `newTopLevelSourceObserved`, … — **never** fed back into pre-poll |

Retention: bounded (e.g. 14d) + aggregate rollups for T+7 checkpoint.

---

## K. Dual shadow

Each real off-trip reconciliation opportunity:

1. Build **one** shared `P25ApdShadowPrePollInput`
2. `evaluateP25ApdB2V1(input)` and `evaluateP25ApdB4V1(input)` independently
3. Separate counters: `B2_WOULD_POLL`, `B2_WOULD_SKIP`, `B2_FORCED_FALLBACK`, etc.

---

## L. Outcome evaluation (post-poll)

If shadow `WOULD_SKIP` but real poll discovered new LV source:

- Record `SKIPPED_INFORMATIVE_POLL`
- Compute `SIMULATED_DISCOVERY_DELAY` vs next simulated policy poll
- **Not** auto-counted as LV miss (PS2B rule)

Histogram: `additional_discovery_delay_seconds{policy}`.

---

## M. Online safety metrics (Prometheus)

`shadow_decisions_total{policy,decision,reason}`  
`would_poll_total`, `would_skip_total`, `forced_fallback_total`  
`informative_real_poll_total`, `skipped_informative_poll_total`  
`simulated_lv_advance_total`, `simulated_lv_miss_total`  
`additional_discovery_delay_seconds` (histogram)  
`profile_invalidated_total{reason}`  
`legacy_assessment_difference_total`, `legacy_publication_difference_total`, `legacy_customer_difference_total`

No vehicle/org/VIN labels.

---

## N. Shadow validation checkpoints

`SHADOW_CHECKPOINTS=T+24h,T+72h,T+7d` after shadow flag ON (future APDS-9).

Per checkpoint: real vs simulated poll counts, reduction %, LV advances, simulated misses, discovery delay, profile invalidations, legacy triple gate, trip/R9 overlap counts.

---

## O. Shadow pass conditions

**B2_SHADOW_PASS** (independent of B4):

- `SIMULATED_LV_MISSES=0`
- `SOURCE_TIME_FABRICATION=0`, `PROVIDER_GAP_MASKING=0`
- `M3_3_PRIMARY_SEMANTIC_DIFF=0`
- `LEGACY_PUBLICATION_DIFF=0`, `LEGACY_CUSTOMER_DIFF=0`
- Trip/R9 invariants unchanged
- Latency within PS2B certified envelope (B2 additional delay P95 ≤ **10.11m** certified band)

**B4_SHADOW_PASS**: same with B4 envelope (P95 ≤ **5.48m**).

---

## P. PR #1893 scope hygiene

| Bucket | Paths |
|--------|-------|
| **R9O-1/2 code** | `backend/src/workers/snapshot-wake/r9-*`, migration `r9_provider_wake_forensic`, module wiring |
| **R9O evidence** | `architecture/trip-detection-lifecycle/evidence/R9O_*` |
| **DSC/APD evidence + ops** | `architecture/vehicle-device-connectivity/evidence/P25_*`, `backend/scripts/ops/p25-*` |
| **APD policy contracts (PS3)** | `backend/src/workers/schedulers/snapshot-polling/adaptive-polling-policy/*` |

`PR1893_SCOPE_SPLIT_RECOMMENDED=YES`  
`PROPOSED_PR_SPLIT=` **PR-A** R9O-1/2 code + TDL evidence \| **PR-B** P2.5 DSC/APD read-only tooling + evidence \| **PR-C** APD shadow runtime (APDS-3…9) — **do not execute split without explicit authorization**.

---

## Q. Engineering slices (flag OFF until APDS-9)

| Slice | Scope |
|-------|--------|
| **APDS-1** | Policy contracts + versions (**done**, tests only) |
| **APDS-2** | Online profile evaluator + invalidation state machine |
| **APDS-3** | Pre-poll shadow engine hook at `DimoSnapshotScheduler` / coordinator observe-only |
| **APDS-4** | Prisma durable forensic table + retention |
| **APDS-5** | Post-poll outcome correlator (informative skip, discovery delay) |
| **APDS-6** | Prometheus metrics |
| **APDS-7** | Integration tests (lookahead safety, trip bypass, dual shadow) |
| **APDS-8** | Deploy artifacts, `WORKER_APD_SHADOW_ENABLED=false` default |
| **APDS-9** | Cohort-scoped shadow activation + T+24/72/7 gates |

---

## Result block

```
P25_APD_PS3_SHADOW_GATE_RESULT=

B2_POLICY_VERSION=P25_APD_B2_V1
B4_POLICY_VERSION=P25_APD_B4_V1

B2_DEFINITION_FROZEN=YES
B4_DEFINITION_FROZEN=YES

SHADOW_DECISION_LOOKAHEAD_SAFE=YES

DUAL_SHADOW_DESIGNABLE=YES
DURABLE_SHADOW_FORENSICS_DESIGNABLE=YES
OUTCOME_CORRELATION_DESIGNABLE=YES

PROFILE_MODEL_VERSION=P25_APD_PROFILE_CLASSIFIER_V1
PROFILE_INVALIDATION_DESIGNABLE=YES

M3_3_SPLIT_CERTIFICATION_FROZEN=YES
LEGACY_COMPATIBILITY_GATE_SEPARATE=YES

R9_WAKE_PATH_CHANGED=NO
R9_TRIGGERED_SNAPSHOT_CHANGED=NO
TRIP_WATCHDOG_CHANGED=NO
TRIP_FSM_CHANGED=NO
ACTIVE_TRIP_POLLING_CHANGED=NO

SOURCE_TIME_AUTHORITY_CHANGED=NO
ACTUAL_REST_AGE_AUTHORITY_CHANGED=NO
EXACT_8H_POLL_TARGET_INTRODUCED=NO

PR1893_SCOPE_SPLIT_RECOMMENDED=YES
PROPOSED_PR_SPLIT=PR-A:R9O-1/2_code+TDL_evidence;PR-B:P25_DSC/APD_readonly_ops+evidence;PR-C:APD_shadow_runtime_APDS-3..9

SHADOW_CHECKPOINTS=T+24,T+72,T+7

PRODUCTION_CHANGE_PERFORMED=NO
POLLING_CHANGED=NO
BATTERY_V2_CHANGED=NO

BLOCKERS=APDS-3_runtime_hook_and_APDS-4_storage_not_yet_implemented
ENGINEERING_SLICES=APDS-1_done;APDS-2..APDS-9_pending_flag_OFF
NEXT_ACTION=Implement APDS-2..APDS-7 behind WORKER_APD_SHADOW_ENABLED=false; run T+24 shadow checkpoint on LTE_R1 cohort only after explicit activation auth
```
