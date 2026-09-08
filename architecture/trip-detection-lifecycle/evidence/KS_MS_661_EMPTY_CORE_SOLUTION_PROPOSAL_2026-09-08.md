# KS MS 661 — Empty-core evidence contract (TDL-DEC-R11-001)

| Field | Value |
|-------|-------|
| **Document type** | PROPOSED decision contract + implementation order (no runtime changes in this PR) |
| **Decision ID** | **TDL-DEC-R11-001** |
| **Status** | **PROPOSED** — registry **AUDIT_IN_PROGRESS**; not PRODUCTION_VALIDATED |
| **Evidence basis** | TDL-EVID-KS-MS-661-001, TDL-EVID-KS-MS-661-REPRO-001, TDL-EVID-KS-MS-661-TEMPORAL-001, TDL-EVID-KS-MS-661-SCENARIOS-001 |
| **Historical SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **Depends on** | TDL-DEC-R10-001/002 (finalize guards apply **after** `POSSIBLE_END` only) |

## R11 numbering — no collision with R10 canary

| Name | Scope | Status |
|------|-------|--------|
| **TDL-DEC-R11-001** | Empty-core positive vs corroboration evidence contract | **PROPOSED** (this document) |
| **TDL-DEC-R10-*** | End-cycle admission, finalize guards, motor-off pause | **PROPOSED** on main; Production deploy evidence TDL-EV-R10-PROD-DEPLOY-001 |
| **R9 five-vehicle canary** | Provider trigger wiring | **VALIDATED** (separate release track) |
| Unrelated CI labels (e.g. R3B1R11) | Communication-center audit phases | **No semantic overlap** |

**Rule:** Do not rename TDL-DEC-R11-001 to avoid R10 canary numbering. R11 here is the **next Trip Detection decision register slot**, not a deployment wave name.

---

## Problem statement

When DIMO stops streaming **core** data during ignition-off / LTE sleep, the empty-core branch must decide whether to open `POSSIBLE_END`. Today the gate conflates:

1. **Positive activity evidence** (VLS ACTIVE, core motion) — should extend trips.
2. **End corroboration** (fresh INACTIVE or bounded unknown) — should allow `POSSIBLE_END`.
3. **Operational silence timer** (`operationalInactiveMs` vs 120 s) — separate clock.

On KS MS 661, **no `POSSIBLE_END` was ever reached** because:

- Operational timer reset / not yet elapsed (worker-time `lastActivityAt` on `motion_detected`).
- **Fresh** VLS ACTIVE (speed, later **engine load > 15**) blocks even when core is empty.
- After VLS ages out, **UNKNOWN** correctly prevents unsafe auto-end — without corroboration recovery the trip stays **ONGOING**.

Full timeline: [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md).

---

## A. Signal age and signal meaning policy

### Per-signal contract

| Signal | Original measurement time | Reception time | Freshness rule (PROPOSED) | Meaning | Missing timestamp |
|--------|--------------------------|----------------|---------------------------|---------|-----------------|
| **Core speed / odometer** | `TripCoreDataPoint.timestamp` (provider) | Worker fetch time (not used for age) | Positive activity: provider age ≤ **45 s** (candidate) | **Vehicle movement** above `speedMotionKmh` | Point excluded from movement evidence |
| **VLS speed** | `vehicle_latest_states.sourceTimestamp` | Worker read time | Positive: ≤45 s; Corroboration INACTIVE: ≤**120 s** | Movement at standstill threshold | → **UNKNOWN** |
| **VLS engineLoad** | Same single VLS `sourceTimestamp` | Worker read | Same TTL buckets as speed | **Motor activity at standstill** — not movement | null → ignore load branch; speed still required |
| **VLS ignition** | Same | Same | Same | Auxiliary; speed+ignition branch only when speed >0 | null → branch skipped |
| **Perf readings** | Provider timestamps in window | Worker fetch | Existing perf window **90 s** | ICE motor activity | Empty → no perf block |
| **Route enrichment** | Route point timestamps | Worker fetch | Existing continuity window | Route motion contradiction | Empty → no route block |

### Semantic distinctions (mandatory)

| State | Evidence required | Must not infer from |
|-------|-------------------|---------------------|
| **Vehicle moving** | Core or VLS speed > motion threshold with fresh provider time | Engine load alone; ignition alone |
| **Motor running at standstill** | engineLoad >15 with fresh provider time | Speed >0 |
| **Motor off (corroborated)** | Fresh INACTIVE VLS and/or core ignition-off with provider time | Speed 0 alone |
| **Unknown** | Missing, stale, or contradictory | **UNKNOWN ≠ INACTIVE** |

### Shared VLS timestamp rejuvenation risk (TDL-GAP-015)

**OBSERVED / RECONSTRUCTED:** One `sourceTimestamp` on `vehicle_latest_states` ages **all** fields together. A stale `engineLoad` can remain **ACTIVE** while speed is 0 until the whole row exceeds 120 s.

**PROPOSED mitigation (phase 1):** Shorter **positive** TTL (45 s) decays stale load for **end candidacy** — load no longer blocks after 45 s without row refresh.

**PROPOSED mitigation (phase 2 — PD-4):** Per-field provider times when DIMO/schema exposes them; until then document as **product limit**.

Worker re-reads **must not** reset provider age: `age = workerNow - sourceTimestamp` always.

---

## B. The 45-second rule — justification and validation status

### Candidate value: `positiveActivityMaxAgeMs = 45000`

| Factor | Value | Source |
|--------|-------|--------|
| ACTIVE_TICK interval | **30 s** | `WORKER_TRIP_TRACKING_INTERVAL_MS` |
| CH end-assist stationary minimum | **45 s** | `TRIP_END_CH_ASSIST_MIN_STATIONARY_MS` |
| Continuity core window | **120 s** | `TRIP_CONTINUITY_CORE_WINDOW_MS` |
| End corroboration minimum | **120 s** | `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` |

**Rationale (PROPOSED, partially validated):**

1. **1.5× tick interval** — tolerates one missed/delayed ACTIVE_TICK without treating vehicle as stopped.
2. **Alignment with existing CH assist 45 s** — same order of magnitude for “stationary stream gap” already accepted in codebase.
3. **Strictly shorter than 120 s corroboration** — enables decay of stale-positive before end candidacy evaluation.
4. **Sensitivity (SYNTHETIC):** At 45 s, KS MS 661 reference VLS @ 67 s → STALE_POSITIVE; at 60 s would still be STALE_POSITIVE; at 90 s would still decay before 120 s corroboration window.

**Not yet validated:**

| Gap | Risk | Mitigation |
|-----|------|------------|
| Sparse senders (>45 s between VLS updates while moving) | False STALE_POSITIVE → unnecessary corroboration wake | Profile-specific override; R9 wake on motion webhook |
| Delayed delivery (30–60 s lag) | Brief false UNKNOWN-for-end | 45 s = one tick slip; monitor `positiveActivityAgeMs` |
| Per-vehicle LTE_R1 long gaps | Same | Document **DOCUMENTED_LIMITATION**; do not shorten corroboration TTL |

**Status label:** **UNVALIDATED_CANDIDATE** for fleet-wide default — **recommended default 45 s** with flag `TRIP_EMPTY_CORE_POSITIVE_TTL_MS` and canary observation before PRODUCTION_VALIDATED.

**Rejected without analysis:** Blind adoption of 45 s from draft; **rejected:** 120 s for positive (perpetual KS MS 661 block); **rejected:** 15 s (below tick interval).

---

## C. UNKNOWN is not INACTIVE

### State machine (empty-core end candidacy)

```
POSITIVE_ACTIVE ──(age > positive TTL)──► STALE_POSITIVE ──► UNKNOWN-for-end
FRESH_INACTIVE ──(corroboration valid)──► may contribute to POSSIBLE_END
UNKNOWN ──► KEEP_OPEN (default)
```

### After positive evidence ages out

| Question | Answer |
|----------|--------|
| What state? | **UNKNOWN-for-end** — not INACTIVE, not “probably stopped” |
| What allows POSSIBLE_END? | **Independent fresh INACTIVE** corroboration (VLS or core stop boundary) **after** operational silence ≥120 s, **or** optional flagged LOW-confidence path (below) |
| If corroboration never arrives? | Trip stays **OPEN** with bounded scheduler backoff + **≤1** coalesced R9 corroboration wake per episode; metrics `empty_core_unknown_duration_seconds` |
| Visibility | Forensics: `innerGateReason`, `vlsEvidenceState`, `nextCorroborationAt`; UI: “awaiting end confirmation” — not “trip ended” |

### LOW-confidence UNKNOWN-timeout candidacy (optional, **off by default**)

**Not a substitute for UNKNOWN semantics.** Only a **bounded recovery** when:

- `operationalInactiveMs ≥ 120 s`
- No POSITIVE_ACTIVE within 45 s
- UNKNOWN persists ≥ `unknownGraceMs` (default **180 s**)
- Trip duration ≥ `TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS` (60 s)
- Feature flag **`TRIP_EMPTY_CORE_UNKNOWN_LOW_CANDIDACY_ENABLED=false`**

**Enters `POSSIBLE_END` with:**

- `endConfidence: LOW`
- `endMode: EMPTY_CORE_UNKNOWN_TIMEOUT`
- `emptyCoreReason` preserved in evidence summary

**R10 interaction (mandatory — no bypass):**

| R10 stage | Behaviour for LOW candidacy |
|-----------|----------------------------|
| `POSSIBLE_END_CHECK` | Same dwell (`tripEndStabilityWindowMs` 90 s); `hasActivityResumed` with `resumeAfterAt` |
| `END_VALIDATION` / CUSUM | Runs; may fail → retry |
| Max attempts / timeout | May finalize with **LOW** confidence (existing R5 path) — **not** treated as HIGH/CUSUM_VALIDATED |
| Finalize guards | Token/admission unchanged — **no emergency COMPLETED** |

**Risk:** False end if vehicle actually moving with prolonged gap — mitigated by resume check + LOW confidence labelling + operator review hooks.

**Product decision PD-2:** Accept LOW finalize after prolonged UNKNOWN? Default **no** until natural validation.

---

## D. One-minute pause contract

Three **separate** concepts:

| Concept | FSM / data | Detection | Latency bound |
|---------|------------|-----------|---------------|
| **Pause within same trip** | `ACTIVE_TRIP` or `IDLE_WITHIN_TRIP`; optional `pauseDetectedAt` in evidence | Motor-off corroboration + silence <120 s + resume motion | **≥30 s** (tick) to **≤90 s** typical with 30 s ticks and fresh signals; **≤60 s not guaranteed** if no samples in window |
| **End candidacy** | `POSSIBLE_END` | Empty-core gate + 120 s silence + fresh INACTIVE | Not before **120 s** after provider stop anchor |
| **Trip finalize** | `COMPLETED` | R10 chain after `POSSIBLE_END` | Additional **≥90 s** stability + validation |

**User goal “~1 min pause visible”:**

- **Achievable for detection tagging** when motor-off VLS/core arrives and resume motion arrives within ticks — **not** via `POSSIBLE_END`.
- **Not achievable for end candidacy** in 60 s — **120 s operational silence** is intentional (R5/R10 contract).
- **Physical information limit:** If provider sends nothing for 60 s, system cannot distinguish pause vs gap vs end — document honestly; do not extend test pauses artificially.

**No second Trip FSM.** Use existing states + evidence fields:

- `IDLE_WITHIN_TRIP` already observed on KS MS 661 post-stop.
- Add **`pauseDetectedAt`** (provider-time) + **`pauseBoundaryAt`** when stop evidence first seen — analytics/UI only until product requests split.

---

## E. Anchors and resume — `resumeAfterStop` circularity

### Problem (SUSPECTED → PROVEN mechanism)

`assessActiveContinuity` may treat stale core points as `motion_detected` → `lastActivityAt = workerNow` → shrinks empty-core timer. **`resumeAfterAt` on ACTIVE path** requires a stop boundary, but stop boundary detection can be blocked by stale motion — **circularity**.

### PROPOSED stop boundary sources (independent of `POSSIBLE_END`)

| Source | Provider time | Persists as |
|--------|---------------|-------------|
| Core ignition-off transition | Point timestamp | `stopBoundaryAt` |
| Entry to `IDLE_WITHIN_TRIP` | Transition event time | `stopBoundaryAt` |
| First **FRESH_INACTIVE** VLS after movement | `sourceTimestamp` | `stopBoundaryAt` |
| CH assist boundary | Assist candidate time | `stopBoundaryAt` |

**NOT required:** prior `POSSIBLE_END` recognition.

### Active continuity filter (PROPOSED)

Mirror R10 `hasActivityResumed(resumeAfterAt)` on **ACTIVE** path:

- Only core points with `timestamp > stopBoundaryAt` count for `motion_detected`.
- Dedupe: same provider timestamp + signal identity → one anchor advance.
- Out-of-order: accept if `timestamp > stopBoundaryAt`; ignore ≤ boundary.
- Worker/cache re-read: **never** advances `stopBoundaryAt` or provider anchor without **new** provider timestamp.

### Activity anchor advancement (PROPOSED)

| Event | Advances |
|-------|----------|
| Fresh core motion (post-filter) | `lastProviderActivityAt`, `lastMeaningfulMovementAt` |
| Fresh POSITIVE VLS | `lastProviderActivityAt` only if speed > motion |
| Worker tick without new provider data | **Nothing** on provider anchor |
| `motion_detected` on worker clock | **`lastActivityAt`** may still update for non-empty-core paths; **excluded** from empty-core silence via `lastProviderActivityAt` |

---

## F. Handoff to R10 (no second finalization)

### Entry to R10 (unchanged admission)

Only via orchestration `transitionState(..., POSSIBLE_END)` with:

- `possibleEndAt` = `resolvePossibleEndBoundaryCandidate` (provider movement preferred)
- `possibleEndEnteredAt` = workerNow
- `endCycleToken` minted per R10
- Evidence summary includes `noCoreEmptyCoreForensics`, `emptyCoreReason`, **`innerGateReason`**

### Subsequent R10 chain

```
POSSIBLE_END
  → schedulePossibleEndCheck
  → POSSIBLE_END_CHECK (resumeAfterAt = endBoundaryAt)
  → END_VALIDATION (after dwell ≥ max(90s, 120s physical))
  → CUSUM / composite
  → FINALIZE (guards: token, cycle, stale finalize, legacy admission)
  → COMPLETED
```

### New movement during delayed processing

- `POSSIBLE_END_CHECK` / `hasActivityResumed` → reset to `ACTIVE_TRIP` via `buildPossibleEndToActiveReset`
- Clears end-cycle token per R10 — **no partial finalize**

### New trip after true COMPLETED

- Terminal → RESTING (R7); new start via existing start detection — **no** empty-core carryover

### Explicit non-effects

- No bypass of token/legacy admission
- No standalone `COMPLETED` mutation from empty-core branch
- No second finalize worker

---

## Guard order summary (PROPOSED EmptyCoreEvidenceV2)

1. Operational silence (provider anchor) ≥ **120 s**
2. Not **POSITIVE_ACTIVE** (<45 s positive evidence)
3. Not **UNKNOWN-for-end** (includes stale-positive decay, missing VLS, stale corroboration)
4. No perf/route contradiction
5. Else → **`POSSIBLE_END` eligible** → existing R10

---

## Scenario matrix

See [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md).

---

## Scalability model (normal + outage)

### Baseline formula

```
ACTIVE_TICK jobs/min     ≈ activeTrips × (60 / tripTrackingIntervalSec)
Empty-core evaluations/min ≈ ACTIVE_TICK × emptyCoreRate
Provider core fetches/min  ≈ ACTIVE_TICK (already today)
Extra R9 wakes/min         ≈ uncertainEmptyCoreEpisodes × wakeCoalesceRate
```

Default: `tripTrackingIntervalSec=30`, `emptyCoreRate≈4%`, `wakeCoalesceRate≈10%` of empty-core uncertain episodes.

### Cohort A — 5% active vehicles

| Scale | Active trips | ACTIVE_TICK/min | Empty-core eval/min | Provider fetches/min | DB writes/min (runs) | Redis ops/min | Extra wakes/min |
|------:|-------------:|----------------:|--------------------:|---------------------:|---------------------:|--------------:|----------------:|
| 5 | 0.25 | ~0.5 | ~0.02 | ~0.5 | ~0.5 | ~1 (job dedupe) | ≪0.01 |
| 1,000 | 50 | ~100 | ~4 | ~100 | ~100 | ~200 | ~0.4 |
| 10,000 | 500 | ~**1,000** | ~40 | ~**1,000** | ~**1,000** | ~2,000 | ~4 |

**Assumption label:** 5% simultaneous activity — **UNVALIDATED_CANDIDATE**; fleet may differ.

### Cohort B — High concurrent activity (15% active)

| Scale | ACTIVE_TICK/min | Empty-core/min |
|------:|----------------:|---------------:|
| 10,000 | ~3,000 | ~120 |

### Cohort C — Many uncertain open trips (2% fleet stuck UNKNOWN)

| Scale | Uncertain trips | Backoff ticks/min (avg 60 s interval) | Extra wakes |
|------:|----------------:|--------------------------------------:|------------:|
| 10,000 | 200 | ~200 | ≤200 coalesced to ≤20/min |

### Cohort D — Fleet provider outage then recovery

| Phase | Behaviour | Cost |
|-------|-----------|------|
| Outage | Empty-core → UNKNOWN; **no** false mass finalize | ACTIVE_TICK continues; fetches fail fast → **no gate** on error path |
| Backoff | Exponential on fetch errors: 30 s → 60 s → 120 s cap **600 s** with jitter ±15% | Reduced provider load |
| Recovery | Webhook R9 wake + next ACTIVE_TICK | Burst ≤ coalesced wake budget |
| Fairness | Per-vehicle max **1** pending corroboration job; round-robin via existing queue priority | Prevents starvation |

### Scheduler parameters (PROPOSED)

| State | Check interval | Backoff cap | Jitter | Max parallel provider budget |
|-------|---------------|-------------|--------|------------------------------|
| ACTIVE_TRIP (core present) | 30 s | n/a | existing handoff jitter | global concurrency **5** (config) |
| ACTIVE_TRIP empty-core UNKNOWN | 30 s → 60 s → 120 s | 600 s | ±15% | same |
| POSSIBLE_END | existing R10 dwell | n/a | n/a | validation concurrency separate |
| Corroboration wake | **≤1** per episode | 300 s min gap | n/a | R9 coalesce |

**Retry rules:**

| Error | Action |
|-------|--------|
| 403 / auth | Log + metric; no finalize; slower backoff; alert |
| Timeout | Retry next tick; no gate |
| Empty `[]` success | Empty-core gate |
| Redis/BullMQ loss | Recovery scheduler re-enqueue — existing |

**Restart:** `trip-tracking-recovery.scheduler` re-enqueues stale ACTIVE_TICK / stuck POSSIBLE_END — no new fleet scan.

**Diagnosis retention:** Forensics runs append-only **90 days** (existing table growth); metrics low-cardinality only.

**No scalability release from O(1) gate alone** — provider fetch budget dominates; measure in canary.

---

## Acceptance and deploy sequence (corrected — no circular gate)

| Step | Activity | Result type |
|------|----------|-------------|
| **1** | Decision contract + local scenario matrix reviewed | PASS / FAIL on design |
| **2** | Implementation + unit/integration/R10 regression tests | PASS / FAIL |
| **3** | Code review + merge to main | Process |
| **4** | **Separately authorized** controlled deploy + rollback plan | Operational |
| **5** | Natural drive validation on **verified new SHA** (pause, resume, finalize persistence) | PASS / FAIL / INCONCLUSIVE |
| **6** | Production readiness assessment | Only after step 5 |

**Removed:** “No deploy until natural Production validation” — that blocked step 2–4.

### Natural validation checklist (post-deploy only)

| Check | Method | Pass criterion |
|-------|--------|----------------|
| Pause visible | Natural or staged drive | `pauseDetectedAt` or IDLE within same `tripId` |
| Resume | Same trip continues | No spurious split |
| End candidacy | Operator stop + silence | `POSSIBLE_END` reached or documented UNKNOWN limit |
| Finalize persistence | DB | `trip_status=COMPLETED`, R10 runs present |
| R9 wake | Separate evidence | TDL-EV-R9 natural wake — not conflated with R11 |

---

## Implementation order (concrete — next PR)

### Affected files / components

| # | Component | File(s) | Behaviour change |
|---|-----------|---------|------------------|
| 1 | Empty-core gate V2 | `trip-empty-core-end-gate.ts` | Split positive (45 s) vs corroboration (120 s); STALE_POSITIVE decay; export `innerGateReason` |
| 2 | Provider operational anchor | `trip-fsm-clock-contract.ts`, `trip-detection-orchestration.service.ts` | `lastProviderActivityAt`; empty-core uses provider anchor only |
| 3 | Stop boundary + active filter | `trip-evidence.helpers.ts`, orchestration | `stopBoundaryAt`; filter core continuity `timestamp > stopBoundaryAt` |
| 4 | Persistence / forensics | orchestration logging | Persist `innerGateReason`, `positiveActivityAgeMs`, `stopBoundaryAt`; stop overwriting inner reason |
| 5 | Fetch outcome taxonomy | orchestration empty-core branch | Distinguish `[]` success vs error — separate metrics |
| 6 | Optional UNKNOWN LOW candidacy | orchestration + `worker.config.ts` | Flag-gated; sets LOW + `EMPTY_CORE_UNKNOWN_TIMEOUT` |
| 7 | Pause tagging | orchestration | Set `pauseDetectedAt` on corroborated motor-off (<120 s) |
| 8 | Corroboration wake | existing `SnapshotWakeIntakeService` | Enqueue ≤1 coalesced wake on prolonged UNKNOWN |
| 9 | Metrics | `trip-metrics.service.ts` | Low-cardinality counters/histograms |
| 10 | Prisma / detection state | schema + migration if needed | `stopBoundaryAt`, `lastProviderActivityAt`, optional pause fields |

### Data / job contracts

| Field / job | Contract |
|-------------|----------|
| `lastProviderActivityAt` | Max provider timestamp of qualifying motion; monotonic per trip |
| `stopBoundaryAt` | First corroborated stop; never from worker clock alone |
| `innerGateReason` | Stable enum string in forensics |
| ACTIVE_TICK | Unchanged interval default 30 s; backoff table for UNKNOWN |
| R9 corroboration wake | New reason code `EMPTY_CORE_CORROBORATION`; coalesce with existing mailbox |

### Required tests

| Test file | Coverage |
|-----------|----------|
| `trip-empty-core-end-gate.spec.ts` | AC-1–AC-6, S1–S7 gate matrix |
| `trip-fsm-clock-contract.spec.ts` | Provider anchor vs worker anchor |
| `trip-evidence.helpers.spec.ts` | `resumeAfterStop` / boundary filter |
| `trip-fsm-motor-off-pause-r10.spec.ts` | R10 regression — no bypass |
| `trip-end-validation-r5*.spec.ts` | LOW confidence path unchanged |
| Integration | POSSIBLE_END → FINALIZE with empty-core forensics |

### Risks

| Risk | Mitigation |
|------|------------|
| False end on UNKNOWN LOW path | Flag off default; R10 resume + LOW labelling |
| False open on sparse VLS | R9 wake; profile TTL override |
| Per-field timestamp gap | Phase 2 PD-4; document limit |
| Fleet fetch cost | Backoff + coalesce; no fleet scan |

### Measurable success criteria

| ID | Criterion |
|----|-----------|
| SC-1 | KS MS 661 replay: inner reasons match temporal doc |
| SC-2 | STALE_POSITIVE @67 s does not block after 120 s silence + fresh INACTIVE |
| SC-3 | Null VLS never produces HIGH confidence finalize |
| SC-4 | `innerGateReason` persisted and queryable |
| SC-5 | R10 suite green without guard weakening |
| SC-6 | Natural post-deploy drive: `POSSIBLE_END` or documented UNKNOWN with metrics |

---

## Open product decisions

| ID | Question | Default | Impact if wrong |
|----|----------|---------|-----------------|
| PD-1 | UI pause tag without split? | Tag only | UX only |
| PD-2 | LOW UNKNOWN-timeout candidacy? | **Off** | False ends vs open trips |
| PD-3 | Positive TTL 45 vs 60 s? | 45 s candidate | Sparse sender behaviour |
| PD-4 | Per-field VLS timestamps? | Phase 2 | Engine load rejuvenation |

**No blocking product question** if PD-2 remains **off** and PD-3 uses flagged 45 s default — implementation order above is complete.

---

## Alternatives rejected

| Alternative | Reason |
|-------------|--------|
| Global 120 s reduction | False ends |
| UNKNOWN → INACTIVE | Violates safety |
| Fleet polling increase | Cost / architecture |
| Per-vehicle override | Tenant rules violation |
| Webhook-only motor-off finalize | 19:53:24 not proven |
| Immediate COMPLETED | Bypasses R10 |

---

## Cross-references

- [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md)
- [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md)
- [KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md](KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md)
- [DECISION_REGISTER.md](../decisions/DECISION_REGISTER.md#tdl-dec-r11-001)

**Mutations:** NONE · **Authority promotion:** NONE
