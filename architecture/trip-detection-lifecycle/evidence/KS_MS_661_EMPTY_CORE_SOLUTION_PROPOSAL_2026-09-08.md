# KS MS 661 — Empty-core evidence contract (PROPOSED solution)

| Field | Value |
|-------|-------|
| **Document type** | PROPOSED implementation design (no runtime changes in this PR) |
| **Decision ID** | **TDL-DEC-R11-001** |
| **Status** | **PROPOSED** — not PRODUCTION_VALIDATED |
| **Evidence basis** | TDL-EVID-KS-MS-661-001, TDL-EVID-KS-MS-661-REPRO-001 |
| **Historical SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **Depends on** | Existing FSM + R10 finalize path (R10 guards apply **after** `POSSIBLE_END`) |

## Problem statement

When DIMO stops streaming **core** data during ignition-off / LTE sleep, the empty-core branch must decide whether to open `POSSIBLE_END`. Today the gate conflates:

1. **Positive activity evidence** (VLS ACTIVE, core motion) — should extend trips.
2. **End corroboration** (fresh INACTIVE or bounded unknown) — should allow `POSSIBLE_END`.
3. **Operational silence timer** (`operationalInactiveMs` vs 120 s) — separate clock.

On KS MS 661, **no `POSSIBLE_END` was ever reached** because:

- Operational timer reset / not yet elapsed (worker-time `lastActivityAt` updates on `motion_detected`).
- **Fresh** VLS ACTIVE samples (speed and later **engine load > 15**) block even when core is empty.
- After VLS ages out, **UNKNOWN** correctly prevents unsafe auto-end — but without a recovery path to fresh INACTIVE or corroborated stop, the trip stays **ONGOING** indefinitely.

**Product tension:** protect running trips during data gaps **vs** recognize pause/end without false finalize.

---

## Design goals

| Goal | Constraint |
|------|------------|
| Do not finalize on missing data alone | Keep UNKNOWN → KEEP_OPEN |
| Do not let one old ACTIVE reading block forever | Cap **positive** evidence TTL |
| Preserve fresh positive motion | Do not timeout-stale real movement |
| Reach existing R10 path | Fix pre-`POSSIBLE_END` only |
| Fleet-scalable | No new O(n) fleet scans; reuse `ACTIVE_TICK` |
| Pause ≠ auto-split | Pause detection optional; end candidacy separate |

---

## PROPOSED contract: `EmptyCoreEvidenceV2`

### 1. Split freshness domains (time semantics)

| Domain | Clock | Purpose | PROPOSED max age |
|--------|-------|---------|------------------|
| **Positive activity** | `providerObservedAt` of VLS/core | Extends trip / resets silence | **`positiveActivityMaxAgeMs`** (default **45 s**, ≤ CH assist stationary 45 s) |
| **End corroboration INACTIVE** | `providerObservedAt` | Allows empty-core → `POSSIBLE_END` | **`endCorroborationMaxAgeMs`** (keep **120 s** = `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`) |
| **Operational silence** | `resolveOperationalNoCoreInactivityAnchor` | Minimum stop duration before candidacy | **120 s** unchanged |
| **Worker processing** | `workerNow` | Scheduling only — **never** resets provider event age |

**Rule:** Re-reading the same VLS row **does not** reset provider age — age always `workerNow - sourceTimestamp`.

### 2. Positive vs unknown vs inactive (VLS)

Replace single tri-state gate logic for empty-core **end candidacy**:

| VLS classification | Condition | Empty-core effect |
|--------------------|-----------|-------------------|
| **POSITIVE_ACTIVE** | Fresh (< 45 s) AND (speed > motion OR engineLoad > 15 OR ignition+speed) | **KEEP_OPEN** |
| **STALE_POSITIVE** | ACTIVE signal but age ≥ 45 s | Treat as **UNKNOWN** for end (not as continued activity) |
| **FRESH_INACTIVE** | Fresh (< 120 s) AND explicit stationary | Contributes to **POSSIBLE_END** if other gates pass |
| **UNKNOWN** | Missing, stale (> 120 s), or stale-positive | **KEEP_OPEN** (safe) |

**KS MS 661 @ 19:54:38:** VLS age 67 s → today **FRESH ACTIVE**; under proposal → **STALE_POSITIVE → UNKNOWN** for end (operational timer still blocks until 120 s).

**@ 20:00:26 post-IDLE:** engineLoad 42.7 @ age 64 s → today **ACTIVE**; under proposal still **POSITIVE** (< 45 s? 64s > 45 → **STALE_POSITIVE**).

### 3. Operational anchor fix (worker vs provider)

**BEFORE:** `lastActivityAt = workerNow` on every `motion_detected` → shrinks `operationalInactiveMs` on worker clock.

**PROPOSED:** For empty-core inactivity only, anchor = **`max(providerEventTime)`** of:

- `lastMeaningfulMovementAt` (already provider-time), and
- latest **provider-timestamped** core motion in last fetch window (new field `lastProviderActivityAt`).

Do **not** use bare `lastActivityAt` (worker time) for empty-core silence measurement.

**Effect on KS MS 661:** anchor stays tied to last proven provider motion (~19:54:21 provider time if proven), not repeated worker ticks.

### 4. Core-path continuity (pre empty-core)

**PROPOSED:** `assessActiveContinuity` motion must use points with `timestamp > lastStopBoundaryAt` where `lastStopBoundaryAt` is updated when:

- Operator-visible stop signals: ignition-off in core stream, or
- `IDLE_WITHIN_TRIP` entry, or
- CH assist end boundary.

Without archived samples, implement **resumeAfterStop** filter analogous to R10 `resumeAfterAt` but on **ACTIVE** path — only provider timestamps **after** stop boundary count as motion.

**Classification:** fixes **SUSPECTED** stale motion; requires new persisted boundary field.

### 5. Pause vs end (product)

| Concept | FSM / behavior | PROPOSED |
|---------|----------------|----------|
| **Pause** (2:16) | Same trip, `IDLE_WITHIN_TRIP` or tagged pause state | Optional `pauseDetectedAt` evidence; **does not finalize** |
| **End candidacy** | `POSSIBLE_END` | Empty-core corroborated INACTIVE + 120 s silence |
| **Trip split** | Mid-gap split | Only on sustained gap + drift — **unchanged** |

User goal “~1 min pause visible” → UI/analytics from **`pauseDetectedAt`**, not mandatory auto-split.

### 6. Recovery path (unknown handling)

When empty-core + UNKNOWN for **`unknownGraceMs`** (default **180 s**) after operational silence ≥ 120 s:

1. Schedule **one** corroboration snapshot wake (existing R9) — not fleet poll.
2. If still UNKNOWN → enter **`POSSIBLE_END`** with **LOW** confidence + `endMode=EMPTY_CORE_UNKNOWN_TIMEOUT` **only if** no POSITIVE_ACTIVE in last 45 s **and** trip age > min trip duration.

**Safety:** still requires `POSSIBLE_END` → existing R10 validation before finalize.

**Explicit non-claim:** If provider never returns any signal, system **cannot** know ignition-off — document as **product limit**, not fake certainty.

### 7. Handoff to R10

No change to R10 guards. Proposal only increases **`POSSIBLE_END` reachability**. R10 then handles false resume / stale finalize on KS-MX-class cases.

---

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Lower global 120 s inactivity | False ends on brief stops / traffic |
| Remove UNKNOWN safety → auto-end | Violates “missing data ≠ end proof” |
| Mid-gap split threshold tweak only | KS MS pause too short; doesn't fix empty-core VLS |
| Fleet-wide polling increase | Not scalable; R9 wake exists |
| Per-vehicle / tokenId override | Not scalable; violates architecture rules |
| Immediate finalize on motor-off webhook | 19:53:24 payload not proven; unsafe |

---

## Scalability model (explicit assumptions)

### Vehicle cohorts

| Cohort | Behavior | Scheduler |
|--------|----------|-----------|
| **Resting** | No `ACTIVE_TICK` | Existing snapshot tier polling only |
| **Active trip** | `ACTIVE_TICK` ~30 s | Already per-trip BullMQ job |
| **Uncertain empty-core** | Extra corroboration wake | **≤1** R9 wake per episode, coalesced |

### Cost model

```
ops_per_minute ≈ activeTrips × (60 / activeTickIntervalSec) × opsPerTick
```

| Scale | Assumed active trips (5%) | ACTIVE_TICK/min | Empty-core evals/min | Extra wakes/min |
|------:|--------------------------:|----------------:|---------------------:|----------------:|
| 5 | 0.25 | ~0.5 | ~0.5 | ≪ 0.1 |
| 1,000 | 50 | ~100 | ~100 | ~2 (uncertain subset) |
| 10,000 | 500 | ~1,000 | ~1,000 | ~20 |

**Assumptions:** 5% simultaneously active; 30 s tick; 4% of active ticks hit empty-core; 10% of those trigger one coalesced wake.

**Per-tick ops:** 1× core fetch + 1× VLS read + gate eval — **already today**; proposal adds **O(1)** age comparisons, optional wake enqueue.

**No new fleet SCAN.** Reuse `SnapshotWakeIntakeService` coalescing + existing BullMQ dedupe.

### Multi-worker / failure

| Scenario | Behavior |
|----------|----------|
| Duplicate `ACTIVE_TICK` | Idempotent gate; forensics append-only |
| PM2 restart | `trip-tracking-recovery` re-enqueues stale jobs — existing |
| Provider fleet outage | Trips stay OPEN (safe); metrics `empty_core_unknown_duration` |
| Redis loss | Wake coalesce may duplicate fetch — bounded by R9 generation guards |

---

## Observability (minimal, bounded labels)

**Metrics (low cardinality):**

- `trip_empty_core_gate_total{decision,inner_reason,profile}`
- `trip_empty_core_vls_age_bucket`
- `trip_empty_core_unknown_duration_seconds` (histogram)

**Forensics persistence fix (required):**

- Persist **`innerGateReason`** separately from outer `no_core_data_keep_open`
- Add `positiveActivityAgeMs`, `nextCorroborationAt`, `stopBoundaryAt`

**No unbounded vehicleId/tripId metric labels.**

---

## Implementation checklist (next PR — not this one)

| # | Change | File(s) |
|---|--------|---------|
| 1 | Split positive vs corroboration freshness | `trip-empty-core-end-gate.ts` |
| 2 | Provider-time operational anchor | `trip-fsm-clock-contract.ts`, orchestration |
| 3 | `resumeAfterStop` on active continuity | `trip-evidence.helpers.ts` |
| 4 | Persist `innerGateReason` + ages | orchestration logging |
| 5 | Optional unknown-timeout → LOW confidence `POSSIBLE_END` | orchestration + config flag |
| 6 | Unit matrix (8 scenarios from REPRO doc) | `trip-empty-core-end-gate.spec.ts`, orchestration specs |
| 7 | Forensics metrics | `trip-metrics.service.ts` |

---

## Acceptance criteria (post-implementation)

| # | Criterion | Method |
|---|-----------|--------|
| AC-1 | Reference replay @ 19:54:38 yields documented inner reason(s) | Unit test + forensics field |
| AC-2 | Fresh INACTIVE VLS + 120 s silence → `POSSIBLE_END` eligible | Unit test #3 replay |
| AC-3 | Null VLS → KEEP_OPEN (no finalize) | Unit test #4 |
| AC-4 | STALE_POSITIVE (67 s) does **not** block end after 120 s silence | New unit test |
| AC-5 | Engine load > 15 @ age 64 s → STALE_POSITIVE, not perpetual ACTIVE | New unit test |
| AC-6 | Synthetic post-stop motion before boundary → no `motion_detected` | Continuity unit test |
| AC-7 | R10 guards unchanged; engaged only after `POSSIBLE_END` | Regression KS-MX suite |
| AC-8 | Natural drive re-run (KS MS 661 or successor) reaches `POSSIBLE_END` or documented product limit | Production read-only observation |

---

## Open product decisions

| ID | Question | Default if unset |
|----|----------|------------------|
| PD-1 | Should 2–3 min pause appear as UI “pause” without split? | Tag only, same trip |
| PD-2 | Is LOW-confidence `POSSIBLE_END` on prolonged UNKNOWN acceptable? | Off by default flag |
| PD-3 | `positiveActivityMaxAgeMs` default 45 s vs 60 s | 45 s aligned with CH assist |

---

## Risks prevented / introduced

| Risk | Mitigation |
|------|------------|
| False finalize on gap | UNKNOWN + no LOW-confidence without flag |
| False open forever | STALE_POSITIVE decay; unknown grace + optional LOW candidacy |
| R10 bypass | No finalize shortcut |
| Fleet cost explosion | No new scans; coalesced wakes |
| **New risk:** premature LOW-confidence end | Feature flag + requires 120 s silence + no fresh positive |

---

**NEXT_GATE (implementation):** Implement items 1–4 on branch `cursor/trip-fsm-r11-empty-core-evidence-64c8` with unit matrix AC-1–AC-6 before any Production deploy.
