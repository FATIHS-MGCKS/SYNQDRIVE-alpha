# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

# R4 — Start Detection Consistency

| Field | Value |
|-------|-------|
| Baseline main SHA | `12a5fdac9` (R3 #1540 merged) |
| R3 prerequisite | `trip-tracking-handoff-settlement.ts`, R3/R3A/R3B/R3C queue liveness on main |
| Branch | `trip-fsm/r4-start-detection-consistency` |
| Scope | P4-F01 dual scoring clarity + P4-F03 LIVE_START freshness consumption |
| Deploy | **NOT PERFORMED** |
| Production mutations | **NONE** |

## Findings addressed

| ID | Title | R4 resolution |
|----|-------|---------------|
| P4-F01 | Dual start scoring models (candidate hard-coded vs confirmation weighted) | Explicit two-phase contract + split policy modules |
| P4-F03 | LIVE_START ignores snapshot freshness | Policy blocks non-FRESH provider observations |
| P4-F08 | ClickHouse must not start from RESTING | **PRESERVED_BY_DESIGN** — regression tests added |

Unchanged (later packages): P4-F04, P4-F05, P4-F09, P4-F10.

---

## R4.1 — Pre-change two-stage matrix (audit baseline)

### STAGE A — RESTING → POSSIBLE_START (candidate)

| Aspect | ICE | EV | HYBRID | UNKNOWN |
|--------|-----|----|--------|---------|
| Detector | SnapshotEvidenceEvaluator | same | same | same |
| Decision | TripDecisionEngine.evaluateStartCandidate | same | same | same |
| speedActiveKmh | 5 | 3 | 4 | 5 |
| speedMotionKmh (config) | 0.5 | 0.5 | 0.5 | 0.5 |
| speedMotionKmh (candidate use) | **unused** — weak band was `0 < speed ≤ speedActive` | same | same | same |
| Ignition strong increment | +2 | +1 | +2 | +1 |
| Trigger | strong≥2 OR (strong≥1 ∧ movement) OR weak≥3 | same | same | same |
| Confirmation weights in PROFILE_THRESHOLDS | present but **not consumed** at candidate | same | same | same |
| Freshness | computed via assessDataQuality | same | same | same |
| Freshness authority | sourceTimestamp preferred; **updatedAt fallback** | same | same | same |
| Policy consumption of freshness | **none** — always SnapshotEvidenceEvaluator | same | same | same |

### STAGE B — POSSIBLE_START → ACTIVE_TRIP (confirmation)

| Aspect | ICE | EV | HYBRID | UNKNOWN |
|--------|-----|----|--------|---------|
| Detectors | StartConfirmationDetector (+ optional CH) | + MotionSegment for EV/HYB/UNK | same | same |
| Decision | resolveAnalyticsAssistedStartDecision | same | same | same |
| Weighted score | ign 3, spd 2, odo 2, nrg 1, freq 1 | 1/3/2/2/2 | 2/3/2/2/1 | 2/3/2/1/2 |
| isPointActive | speed > speedActive OR (ign ∧ speed > speedMotion) | same | same | same |
| Gates | consecutive / duration / composite / combinedCurrent | same | same | same |

---

## R4.2 — Explicit two-phase contract

| Phase | Code constant | Authority | Creates trip? |
|-------|---------------|-----------|---------------|
| START_CANDIDATE_WAKE | `START_DETECTION_PHASES.START_CANDIDATE_WAKE` | RESTING → POSSIBLE_START only | **No** |
| START_CONFIRMATION | `START_DETECTION_PHASES.START_CONFIRMATION` | POSSIBLE_START → ACTIVE lifecycle flow | Yes (via TripDecisionEngine after confirm) |

`evaluateStartCandidate()` is candidate-only (SnapshotEvidenceEvaluator). Confirmation uses `validateTripStart` + `resolveAnalyticsAssistedStartDecision`.

---

## R4.3 — Split configuration

New module: `trip-start-detection-policy.ts`

| Structure | Contents |
|-----------|----------|
| `sharedSignalThresholds` | speedActiveKmh, speedMotionKmh, odometerMinDeltaKm, frequency thresholds |
| `StartCandidatePolicy` | signal increments, trigger contract, confidence contract |
| `StartConfirmationPolicy` | evidence weights only |

`getProfileThresholds()` retained as legacy merged view (shared + confirmation weights) — **not** candidate scoring authority.

---

## R4.4 — Motion semantic bands (numeric values unchanged)

Using existing `speedMotionKmh = 0.5` and profile `speedActiveKmh`:

| Band | Rule | Candidate effect |
|------|------|------------------|
| Non-motion | speed ≤ speedMotionKmh | speed alone does not set hasMovement |
| Weak motion | speedMotionKmh < speed ≤ speedActiveKmh | weak increment + hasMovement |
| Strong motion | speed > speedActiveKmh | strong increment + hasMovement |

**Behavior delta:** sub-0.5 km/h speed alone no longer sets hasMovement (was `0 < speed ≤ speedActive`).

---

## R4.5 — Profile candidate policy (explicit, preserved semantics)

| Profile | Ignition-only triggers? | Notes |
|---------|-------------------------|-------|
| ICE | Yes (strong=2) | combustion ignition remains high-value wake evidence |
| HYBRID | Yes (strong=2) | same |
| EV | No (strong=1, no movement) | requires movement or other signals |
| UNKNOWN | No (strong=1) | same |

All increments live in `CANDIDATE_SIGNAL_POLICY` table — no scattered profile `if` blocks in scoring loop.

---

## R4.6 — Freshness authority (EVENT_TIME)

`assessLiveStartSnapshotFreshness()`:

- Input: `provider sourceTimestamp` only
- Validates via R1 `isValidProviderEventTimestamp` (60s future skew cap)
- **No** silent DB `updatedAt` substitution for provider freshness
- States: FRESH (<90s), STALE (≥90s), MISSING (no timestamp), INVALID_TIMESTAMP (future/invalid)

---

## R4.7 — LIVE_START policy consumes freshness

`TripDetectionPolicyResolver` LIVE_START:

| Freshness | Detectors | skipReason |
|-----------|-----------|------------|
| FRESH | SnapshotEvidenceEvaluator | — |
| STALE | none (SKIP) | live_start_stale_snapshot |
| MISSING | none (SKIP) | live_start_missing_provider_timestamp |
| INVALID (mapped STALE at orchestration gate) | none | live_start_not_fresh |

90s threshold unchanged (R10 owns calibration).

---

## R4.8 — Stale snapshot cannot enter POSSIBLE_START

Orchestration `evaluateSnapshotForTripStart`:

1. Assesses provider freshness (no DB-time fallback)
2. Resolves policy — empty detectors → early return `{ shouldStartTracking: false }`
3. Evidence summary records `candidateFreshnessState` + `candidateTimestampSource`

---

## R4.9 — Snapshot monotonicity

No DIMO ingestion redesign. Only LIVE_START ingress/policy uses explicit provider timestamp contract. VLS monotonicity paths untouched.

---

## R4.10 — Decision engine phase clarity

`evaluateStartCandidate()` no longer inspects StartConfirmationDetector. Confirmation path unchanged in orchestration.

---

## R4.11 — ClickHouse boundary (P4-F08)

Required flow preserved:

```
RESTING → fresh snapshot candidate → POSSIBLE_START → confirmation (+ optional CH corroboration) → ACTIVE
```

Negative regression: LIVE_START policy never selects CH detectors.

---

## R4.12 — Forensic explainability

Persisted/local evidence summary fields added at candidate transition:

- `candidatePhase`, `candidatePolicyProfile`
- `candidateFreshnessState`, `candidateTimestampSource`, `candidateProviderObservedAt`
- Detector evidence includes `candidatePhase`, `candidateTrigger`
- Confirmation summary includes `confirmationPhase`, `confirmationPolicyProfile`, `evidenceWeights`

No new Prometheus high-cardinality labels.

---

## Behavior deltas summary

| Change | Rationale |
|--------|-----------|
| Sub-motion-floor speed no longer sets hasMovement | Align candidate with shared speedMotionKmh semantics (R4.4) |
| MISSING provider timestamp blocks LIVE_START | Remove silent updatedAt-as-freshness fallback (R4.6/R4.8) |
| STALE/INVALID provider timestamp blocks LIVE_START | P4-F03 material freshness gate |
| Config split + phase metadata | P4-F01 / INV-11 explicit explainability |

Numeric thresholds (speedActiveKmh, 90s freshness, confirmation weights) **unchanged**.

---

## Test matrix (R4.13)

| # | Scenario | Suite |
|---|----------|-------|
| 1–2 | Distinct candidate vs confirmation config | trip-start-detection-r4.spec.ts |
| 3–6 | Profile ignition-only matrix | same |
| 7–9 | Motion bands | same |
| 10–12 | Odometer/GPS/EV traction candidate | same |
| 13 | Confirmation weighted contract | same |
| 14–17 | Freshness authority + policy | same |
| 18 | R1 clock preserved | trip-fsm-clock-contract.spec.ts |
| 19–20 | CH boundary | trip-start-detection-r4.spec.ts |
| 21–24 | R2/R3 regressions | lifecycle + queue handoff suites |
| 25 | Snapshot isolation | dimo-snapshot.trip-start-isolation.spec.ts |

**250 targeted tests passed** (19 suites).

---

## Finding status (post-R4)

| ID | Status |
|----|--------|
| P4-F01 | RESOLVED_BY_R4 |
| P4-F03 | RESOLVED_BY_R4 |
| P4-F08 | PRESERVED_BY_DESIGN |

---

## Remaining dependencies (R9 / R10)

- Idle polling cadence / tiers → R9
- Threshold calibration (numeric tuning) → R10
- Broad observability dashboards → R8

---

## Validation

- Targeted suites: **250 passed**
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**

---

## R4A — Closure Corrections

| Field | Value |
|-------|-------|
| R4 base commit | `2f5a03e1169401e27b192f4f93eb9c4506b03d70` |
| Scope | R1 skew compatibility, explicit INVALID skip reason, full candidate profile authority, orchestration LIVE_START tests |

### R4A.1 — R1 future-skew compatibility

**Bug:** tolerated future provider timestamps (`workerNow + 30s`) were marked `INVALID_TIMESTAMP` because negative raw age was rejected.

**Fix:** After `isValidProviderEventTimestamp()` passes, normalize freshness age:

```
rawAgeMs = workerNow - providerTimestamp
freshnessAgeMs = rawAgeMs < 0 ? 0 : rawAgeMs
```

Provider `sourceTimestamp` / `possibleStartAt` remain unchanged.

### R4A.2 — Explicit INVALID skip reason

`PolicyInput.liveStartFreshnessState` passed from orchestration — no INVALID→STALE coercion.

| Freshness state | skipReason |
|-----------------|------------|
| FRESH | (detectors eligible) |
| STALE | `live_start_stale_snapshot` |
| MISSING | `live_start_missing_provider_timestamp` |
| INVALID_TIMESTAMP | `live_start_invalid_provider_timestamp` |

### R4A.3 — Complete candidate profile authority

Policy structure (corrected wording):

| Layer | Role |
|-------|------|
| `sharedSignalThresholds` | speedActiveKmh, speedMotionKmh, odometerMinDeltaKm, frequency |
| `StartCandidateCommonScoring` | universal increment amounts (GPS, traction tiers, odometer, fuel) |
| `StartCandidateProfilePolicy` | profile enablement/strength: ignition increment, traction enabled, low engine-load weak, SOC strength, mode eligibility |
| `StartCandidateSignalPolicy` | universal signal thresholds (kW, GPS meters, engine-load %) |
| `StartConfirmationPolicy` | confirmation evidence weights only |

`evaluateSnapshotEvidence()` consumes resolved `candidatePolicy` only — no raw profile string scoring branches.

### R4A.4 — Policy/literal drift removed

Mode/trigger logic uses `trigger.minStrong`, `trigger.minStrongWithMovement`, `trigger.minWeak`, and `confidence.highMinStrong` / `mediumMinStrong` from policy contract.

### R4A.5 — Orchestration LIVE_START tests

`trip-detection-orchestration.live-start.r4a.spec.ts` covers FRESH/STALE/MISSING/INVALID/within-skew scenarios at `evaluateSnapshotForTripStart()` side-effect boundary.

### Finding status (post-R4A)

| ID | Status |
|----|--------|
| P4-F01 | RESOLVED_BY_R4 |
| P4-F03 | RESOLVED_BY_R4 |
| P4-F08 | PRESERVED_BY_DESIGN |

## Validation (post-R4A)

- Targeted suites: **264 passed** (20 suites)
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**
