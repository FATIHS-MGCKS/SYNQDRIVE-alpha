# Trip Detection Hardening — Design + Read-Only Replay Plan

**Date:** 2026-08-28
**Scope:** design and read-only validation only
**Base revision:** `main` @ `d6198e8b8`
**Predecessor:** `architecture/TRIP_DETECTION_GAP_FORENSIC_AUDIT_2026-08-28.md` (PR #1396)

```
PRODUCTION_MUTATIONS   = NONE
IMPLEMENTATION_STARTED = NO
BACKFILL_STARTED       = NO
READY_FOR_IMPLEMENTATION = YES
```

Nothing in this document was applied. No trip was created, repaired, split or
cancelled. No scheduler cadence, DIMO trigger or RPM threshold was changed. No
deploy or service restart was performed. All production access was `SELECT`-only,
and all algorithm evaluation happened in an offline harness against exported data
(`backend/scripts/analysis/trip-detection-replay/`).

---

## A. EXECUTIVE VERDICT

**B — multiple structural defects; controlled hardening required.**

The detector core is salvageable. Its data sources are good enough that an offline
replay recovers **61.9 of 63.7 uncovered driving hours** using nothing the system
does not already collect. What is broken is the set of rules layered on top of
that evidence, and the breakage is systematic rather than incidental:

- pairing is bounded by the query window, so a drive longer than the window is
  undetectable by construction;
- the duplicate check asks "does a trip touch this?" instead of "is this drive
  represented?", so a 6-minute trip inside a 107-minute drive marks the drive as
  handled;
- confidence is a function of one variable (duration) with a hard cliff;
- sources compete: for ICE profiles a motion segment is only consulted when
  ignition yields literally nothing, and a DIMO segment short-circuits ClickHouse
  entirely.

One finding materially revises the previous audit. The forensic audit named
window-bounded pairing and the confidence cliff as the reasons the five RPM
sentinels were never repaired. Replaying `TripOverlapDetector` against the real
trip rows shows that **all four distinct missing windows would have been
suppressed as duplicates even if pairing and confidence had worked perfectly**
(§B.4). Overlap suppression is the first blocker for 26 of 65 gaps and it fires
*before* the `trip_repairs` audit row is written, which is why four of the five
sentinels have no proposal record at all. Any fix that lands R1 or R3 without
reworking overlap semantics will move almost nothing.

A verdict of C (full detector redesign) is not warranted: the replay shows the
existing evidence, detectors and decision engine are sufficient. The changes are
to pairing bounds, coalescing, scoring, source composition and overlap semantics —
five well-isolated rule sets inside `TripReconciliationService`,
`ClickHouseAnalyticsService` and `TripOverlapDetector`.

---

## B. CURRENT FAILURE MODEL

### B.1 Re-derived lifecycle (Part 1)

Verified against `main` rather than inherited from the prior report.

#### Live path

```
DimoSnapshotScheduler @Interval(30s)
  → BullMQ dimo.snapshot.poll (jobId snapshot-{vehicleId})
    → DimoSnapshotProcessor.process()
      → TripDetectionOrchestrationService.evaluateSnapshotForTripStart()
        → RESTING → POSSIBLE_START  (+ BullMQ trip-ps-{vehicleId})
TripTrackingProcessor
  POSSIBLE_START     → processPossibleStart()   → createTrip() ONGOING, V2_LIVE
  ACTIVE_TICK (30s)  → processActiveTick()      → rolling endTime update
  POSSIBLE_END_CHECK → processPossibleEndCheck()
  END_VALIDATION     → processEndValidation()   (CUSUM)
  FINALIZE           → processFinalize()        → finalizeTrip() COMPLETED
```

| Element | File | Value |
|---|---|---|
| Snapshot cadence | `workers/schedulers/dimo-snapshot.scheduler.ts` | `@Interval(30_000)` |
| Tracking tick | `config/worker.config.ts` | `WORKER_TRIP_TRACKING_INTERVAL_MS` = 30_000 |
| Start cooldowns | `trip-detection-orchestration.service.ts` | complete 120_000 / discard 30_000 / timeout 60_000 ms |
| Snapshot staleness | `policy/trip-detection-policy.resolver.ts` | STALE at ≥ 90_000 ms |
| Start trigger | `trip-evidence.helpers.ts` | `strong ≥ 2` OR (`strong ≥ 1` AND movement) OR `weak ≥ 3` |
| ICE / EV / HYBRID active speed | `trip-evidence.helpers.ts` PROFILE_THRESHOLDS | 5 / 3 / 4 km/h |
| Quality discard | `checkTripQuality` | `< 60_000 ms` and `distanceKm < 0.1`; or `distanceKm < 0.1` and `maxConsecutiveActive < 2` |
| Merge with previous | `checkTripQuality` | gap `< 300_000 ms` → `reopenTripForMerge` |
| End timeout | `worker.config.ts` | `WORKER_TRIP_END_TIMEOUT_MS` = 1_800_000 |
| Mid-gap split | `worker.config.ts` | 180_000 ms gap, 200 m drift, 60_000 ms min pre-duration |
| Statuses | `decision/trip-decision.engine.ts` | ONGOING → COMPLETED / CANCELLED; COMPLETED → ONGOING on merge |

#### Repair path

```
TripReconciliationScheduler
  fast @Interval(15min) window 45min, vehicles active within 60min
  warm @Interval(4h)    window 12h,  all DIMO-token vehicles
  cold @Cron('0 3 * * *') window 7d, all DIMO-token vehicles
    → TripReconciliationService.reconcileWindow()
       1 repairStaleOngoingTrips
       2 detectAndRepairMissingTrips → collectRepairCandidates
       3 repairMissingEnds
       4 repairIntraTripGapSplits
       5 energy events
       6 event↔trip association sweep
```

`collectRepairCandidates` precedence, as written:

1. `useDimoSegmentFallback && dimoTokenId > 0` → fetch DIMO segments; if **any**
   candidate survives `!isOngoing && !startedBeforeRange`, **return immediately**.
   ClickHouse is never consulted.
2. Otherwise `IgnitionSegmentDetector` (ClickHouse, min 60 s).
3. `MotionSegmentDetector` (min 30 s) runs when
   `profile ∈ {EV, HYBRID, UNKNOWN} || candidates.length === 0`. **For ICE, one
   ignition candidate of any quality suppresses motion entirely.**
4. `dedupeRepairCandidates` — two candidates collapse only when **both** edges are
   within ±2 min; the higher `candidateRank` wins. Fragments are never merged.

Persistence gates, in order:

| Gate | Rule | Location |
|---|---|---|
| Overlap | any trip with `end_time ≥ start−5min` and `start_time ≤ end+5min`, **no `tripStatus` filter** → `continue` | `detectors/trip-overlap.detector.ts:41–57` |
| Audit row | `trip_repairs` created **after** the overlap check | `trip-reconciliation.service.ts:486` |
| Confidence | apply only when `HIGH` or `MEDIUM` | `:507` |
| Activity downgrade | ignition candidate + `ActivityWindowDetector` NOT_TRIGGERED → forced `LOW` | `:787–805` |

Confidence is assigned in exactly one place, from exactly one input:

```ts
// clickhouse-analytics.service.ts:148–153 (identical for motion at :240–245)
confidence: durationMs >= 15 * 60_000 ? 'HIGH'
          : durationMs >=  5 * 60_000 ? 'MEDIUM'
          : 'LOW'
```

Pairing is the ClickHouse window function:

```sql
-- clickhouse-analytics.service.ts:102–105
leadInFrame(changed_at) OVER (
  PARTITION BY vehicle_id ORDER BY changed_at
  ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
) AS off_time
```

The window predicate is applied **before** the lead, so the closing transition must
itself fall inside `[from, to]`, and the final row in every window has a NULL lead
and is dropped. The lead is taken regardless of the next row's value, so an
`ON, ON` pair produces a segment between two starts.

Indexes today: `vehicle_trips(vehicle_id, start_time)` exists;
`telemetry_state_changes` is `ORDER BY (vehicle_id, signal_name, changed_at)`
partitioned monthly. `trip_repairs` has no `(vehicle_id, window_from, window_to)`
index.

Existing coverage/health logic: none. `synqdrive_missing_trip_candidates_total`,
`synqdrive_repair_actions_total` and `synqdrive_trip_evidence_paths_total` exist
but have **no alert rules** (`backend/monitoring/prometheus/alerts.yml` alerts on
`synqdrive_enrichment_pending` and brake coverage only). Nothing compares driving
evidence against canonical trip time.

Downstream consumers of a missing or truncated trip: driver scoring
(`driver-score.service.ts`, gates `MIN_SCORED_TRIPS=3`, `MIN_DISTANCE_KM=50`),
behaviour enrichment (HF and LTE_R1, both require `endTime` and ≥ 60 s), misuse
reconciliation, trip attribution and booking assignment, tire usage ledger, brake
coverage modelling, Battery V2 LV-rest anchoring, rental analysis, all distance
and utilisation reporting, and the trips timeline UI. Every one of them silently
consumes the truncated window as if it were the whole drive.

#### B.2 Live-path hazard still present

The July outage was caused by an unguarded call sitting ahead of
`evaluateTripStart` in `DimoSnapshotProcessor.process()`. The Battery V2 call is
now wrapped in `try/catch` (`:259–303`) and `evaluateTripStart` has its own
`try/catch` (`:476–506`). But the same shape has reappeared one call earlier:

```ts
// workers/processors/dimo-snapshot.processor.ts:219–221
if (this.resolutionOutboxProcessor) {
  await this.resolutionOutboxProcessor.processPendingBatch();
}
```

An unguarded `await` on an unrelated outbox drain, executed before trip
evaluation, on the same job. If it throws, `evaluateTripStart` is never reached
and live detection stops fleet-wide, exactly as in July — and with no coverage
invariant, again silently. See §N.

### B.3 Structural defects, restated precisely

| # | Defect | Mechanism | Consequence |
|---|---|---|---|
| 1 | Window-bounded pairing | closing transition must fall inside the query window | detectability = `window − drive duration`; a drive longer than the tier window is impossible to detect |
| 2 | Scheduler phase dependency | eligibility interval is `window − duration` wide against a 15-min tick | a 37-min drive has a 8-min slot; detection becomes a lottery |
| 3 | Confidence cliff | `durationMs >= 300_000` is the only MEDIUM criterion | 298 s of proven motion is discarded; 20 min of engine-on parking is applied |
| 4 | No fragment coalescing | dedupe requires both edges within ±2 min | one flapping drive becomes N sub-threshold LOW candidates |
| 5 | Source competition | ICE motion runs only when ignition is empty; DIMO early-returns | the strongest available evidence is frequently never queried |
| 6 | Binary overlap | any trip within ±5 min suppresses the candidate, CANCELLED included | truncation is invisible; 18 CANCELLED rows can block repairs |
| 7 | Audit ordering | overlap check precedes `trip_repairs.create` | suppressed candidates leave no trace, so the defect is unobservable |
| 8 | No coverage invariant | nothing measures driving time vs trip time | a three-day fleet-wide outage produced no alert |

### B.4 Overlap suppression, verified against production

Replaying `TripOverlapDetector`'s exact query (`±5 min`, no status filter) against
the four distinct sentinel windows:

| Candidate window | Blocking trip | Relationship |
|---|---|---|
| 2026-07-18 11:58:55 → 13:45:46 | `1702244f` 11:45:46 → 11:55:53 | ends 3:02 before candidate start — inside tolerance |
| 2026-07-19 07:24:37 → 09:02:38 | `1917b0f8` 08:20:01 → 08:29:04 | wholly **inside** the candidate |
| 2026-07-20 06:28:51 → 07:06:04 | `6810cd87` 06:10:28 → 06:26:44 | ends 2:07 before candidate start |
| 2026-07-20 06:47:04 → 07:08:45 | `caba83b7` 07:13:11 → 07:29:44 | starts 4:26 after candidate end |

Four of four suppressed. The `d9197e1f` case is the clearest statement of the
defect: a 98-minute drive contains two short trips totalling ~29 minutes, and the
presence of those trips is treated as proof that the drive is covered.

---

## C. 49-GAP REPRODUCTION RESULT (Part 2)

Independently re-derived. Method: reconstruct drives from `telemetry_state_changes`
with an unbounded ON/OFF state machine over ignition **and** motion; coalesce
fragments separated by < 180 s; split envelopes at internal stationary runs
≥ 180 s so a "drive" means what the product's mid-gap splitter means; keep drives
≥ 5 min with movement evidence; measure coverage as the **union** of non-CANCELLED
trip intervals **clipped** to the drive.

Window `2026-05-30T17:00Z → 2026-08-28T17:00Z`.

| Metric | Value |
|---|---|
| Evidence-backed drives | 405 (398 movement-proven) |
| Telemetry artifacts excluded | 46 unpaired / over-long ON edges |
| Drives with ≥ 5 min uncovered | **65** |
| Total uncovered driving time | **63.72 h** |
| Vehicles affected | **6** |

Shape distribution — truncation dominates, as the prior audit concluded:

| Shape | Drives | Missing |
|---|---|---|
| INTERIOR_GAP | 27 | 28.52 h |
| MULTI_GAP | 22 | 25.56 h |
| PREFIX_TRUNCATION | 4 | 4.45 h |
| SUFFIX_TRUNCATION | 8 | 4.34 h |
| FULL_MISS | 4 | 0.86 h |

Per vehicle:

| Vehicle | Plate | Profile | Drives | Missing |
|---|---|---|---|---|
| `8c850ff1` | HMÜ C 215 | ICE | 32 | 30.14 h |
| `c10351f8` | KS MS 661 | ICE | 10 | 20.21 h |
| `19fedd4b` | WOB L 7503 | ICE | 16 | 8.00 h |
| `68868291` | KS FH 660E | EV | 5 | 5.07 h |
| `c43c3b45` | WOB L 9755 | ICE | 1 | 0.21 h |
| `a60c0749` | KS MX 2024 | ICE | 1 | 0.10 h |

Per month: 2026-06 → 1 drive / 3.54 h; 2026-07 → 52 drives / 47.87 h;
2026-08 → **12 drives / 12.30 h**. August is after the live-detection fix, so the
problem is current, not historical.

### Does 49 / 42.7 h / 5 reproduce? No — and the difference is explained.

Restricting to the prior audit's exact population (ignition only, no coalescing,
no stop splitting, 5 min–4 h plausible durations) reproduces the population almost
exactly: **365 drives / 179.57 h** against the prior **367 drives / 179.8 h**
(two-drive delta from the 90-day anchor being ~34 minutes earlier).

On that identical population the gap count differs, and the cause is the coverage
arithmetic:

| Coverage method | Drives ≥ 5 min missing | Missing |
|---|---|---|
| Union of trip intervals, clipped to the drive | 66 | 48.90 h |
| `leadInFrame` pairing instead of state machine | 66 | 48.90 h |
| **Trip durations counted unclipped** | **56** | **43.27 h** |
| Prior audit reported | 49 | 42.70 h |

The prior figure credited a trip's **entire** duration as coverage of a drive it
merely overlapped, including the portion lying outside the drive. That
over-credits coverage and understates the gap. Pairing methodology is not
implicated: state-machine and `leadInFrame` pairing agree exactly.

So the corrected statement is:

- same population as before: **365 drives / 179.6 h** of ignition-backed driving;
- corrected coverage math on that population: **66 drives / 48.9 h** uncovered;
- adding motion evidence, coalescing and the EV: **65 drives / 63.7 h** uncovered.

The prior "49 drives / 42.7 h / all 5 vehicles" was directionally right and
quantitatively optimistic. The corrected figure is **63.7 h across 6 vehicles**,
of which **12.3 h occurred in August**.

---

## D. FAILURE CATEGORY TABLE (Part 3)

Each gap is attributed to the **first** stage of the current pipeline that blocks
it, computed by walking the real code path per gap rather than by inspection.

| Bucket | Drives | Missing | Vehicles | Confidence | Evidence |
|---|---|---|---|---|---|
| **B — fixed-window ON/OFF pairing** | 25 | 39.92 h | 4 | HIGH | no tier window can pair the drive's edges; deterministic from `leadInFrame` semantics |
| **I — duplicate/overlap suppression** | 26 | 20.00 h | 4 | HIGH | a pairable HIGH/MEDIUM candidate exists and `TripOverlapDetector` triggers on real trip rows |
| **C — scheduler phase miss** | 13 | 3.50 h | 4 | MEDIUM | pairable only in a sub-15-min slice of tick phases; replay confirms phase-dependent outcomes |
| **N — no blocker found** | 1 | 0.30 h | 1 | LOW | candidate is pairable, passes overlap, scores MEDIUM+ — attributable to G or H, not replayable offline |

Contributing (non-exclusive) factors:

| Factor | Drives |
|---|---|
| K — truncation from boundary selection | 61 of 65 |
| B — fixed-window pairing | 39 |
| I — overlap suppression | 26 |
| A — live ingestion abort (drive inside 2026-07-17 → 07-20 11:20) | 26 |
| C — scheduler phase | 7 |

Buckets **not** assigned, and why:

- **D (confidence cutoff)** — real, but never the *first* blocker: overlap fires
  earlier in every instance. It becomes binding only after overlap is fixed.
- **E (fragmented ignition)** — contributes to B and C rather than standing alone;
  the harness coalesces before measuring, so it is not separately countable.
- **F (motion suppressed)** — structurally certain for ICE from the code, but no
  gap is *first* blocked by it, because pairing or overlap intervenes first.
- **G (DIMO short-circuit)** and **H (ClickHouse not evaluated)** — not replayable
  offline; the DIMO segments API cannot be re-queried for a historical window
  without hitting the provider. These are the most likely explanation for the
  single N row.
- **J (persistence rejection)** and **L (split/repair interaction)** — no evidence
  found. Across 105 days `trip_repairs` holds exactly **one** `REJECTED` row, so
  candidates that reach the decision engine essentially always persist. Failure
  happens earlier, not at write time.

Second-order analysis — what becomes binding once containment-aware overlap lands:

| Bucket | Drives | Missing |
|---|---|---|
| B — fixed-window pairing | 25 | 39.92 h |
| **recoverable, no remaining blocker** | 27 | 20.30 h |
| C — scheduler phase | 13 | 3.50 h |

**20.30 h across 27 drives is recoverable by the overlap rework alone.** This is
the single most important input to PR sequencing (§I).

---

## E. PROPOSED TARGET ARCHITECTURE (Parts 4–7, 9–10)

### R1 — Bounded look-forward pairing (Part 4)

| Model | Correctness | Cost | Duplicate risk | Race risk | Restart | Out-of-order | 1000+ vehicles |
|---|---|---|---|---|---|---|---|
| 1. Independent ON/OFF persistence + later pairing | High | New table, two writes per transition | Medium — needs a dedupe key on the edge | Medium — two writers per edge | Good | Good | Good, but adds a stateful table |
| 2. Overlapping scan windows | Low | Cheap | High — same drive proposed by N windows | Low | Good | Good | Good |
| 3. **Bounded look-forward from each ON edge** | **High** | **One query, widened by a constant** | **Low — the ON edge is the identity** | **Low — stateless** | **Trivially correct, no state** | **Good — re-running re-reads the source** | **Good — bounded by ORDER BY prefix scan** |
| 4. State-machine reconstruction per vehicle | Highest | Requires full history or a checkpoint | Low | High — checkpoint contention | Needs recovery logic | Sensitive to late arrivals | Checkpoint table per vehicle |
| 5. Hybrid (3 + periodic 4) | High | Sum of both | Low | Medium | Medium | Good | Acceptable |

**Recommendation: model 3, bounded look-forward.**

Only ON edges *starting* inside `[from, to]` open a segment; the closing OFF is
sought forward through the series up to `LOOK_FORWARD_MS = 6 h` past the ON edge,
irrespective of the query window. Rationale:

- it makes detectability a function of the drive alone, not of the window
  (`98 min` and `107 min` drives become detectable from the fast tier);
- it is **stateless**, so restart behaviour is trivially correct and concurrent
  runs converge on identical output;
- the ON edge timestamp is a natural idempotency key
  (`vehicle_id + first_on_edge`), which model 2 lacks;
- cost is one query per source per vehicle per run, widened by a constant — on
  `ORDER BY (vehicle_id, signal_name, changed_at)` this is a prefix range scan.

An ON edge with no OFF inside the horizon is **deferred**, never closed at the
window edge. Fabricating a boundary at `to` is what produces truncated trips
today.

`MAX_DRIVE_MS = 6 h` bounds the result: a longer pairing is a telemetry artifact
(the harness found 46 such edges over 90 days) and must not become a trip.

### R2 — Evidence fragment coalescing (Part 5)

Coalesce **before** scoring, with explicit invariants:

- **I1** — a gap longer than `COALESCE_GAP_MS = 180 s` is never bridged.
  Deliberately equal to `TRIP_MID_GAP_SPLIT_MS`, so coalescing can never produce
  an envelope the live splitter would immediately split.
- **I2** — a gap containing a stationary run ≥ `STATIONARY_BREAK_MS = 150 s`
  **with telemetry present** is never bridged. That is a stop, not flapping.
- **I3** — a gap with **no telemetry at all** *is* bridged. Absence of data is
  short signal loss, not evidence of stopping. This is what distinguishes a
  provider gap from a park.
- **I4** — a merged envelope never exceeds `MAX_DRIVE_MS`.
- **I5** — an envelope is **split** at internal stationary runs ≥ 180 s. A single
  ignition-ON interval can span a stop with the engine running; without I5 the
  repair path would persist envelopes the live path would split, and the two
  paths would disagree about what a trip is.

I5 was added because the harness measured it: without it, 21 of 118 proposed trips
contained a stop of ≥ 10 minutes. With I1–I5, **0 of 89**.

Long parking is structurally unbridgeable: 180 s is two orders of magnitude below
any parking period, and I2 blocks bridging as soon as telemetry shows the vehicle
stationary.

### R3 — Confidence model (Part 6)

Deterministic additive scoring, every contribution recorded on the proposal so an
operator can read *why*. No ML.

A hard gate precedes scoring:

> **Movement gate** — if telemetry was observed throughout the span, no motion
> signal is present, `maxSpeed ≤ 1 km/h`, and no DIMO segment corroborates, the
> candidate is `REJECT` regardless of duration. Absence of telemetry is *not*
> absence of movement, so the gate only applies when the vehicle was actually
> observed and seen stationary.

| Signal | Contribution |
|---|---|
| Duration ≥ 15 min / ≥ 5 min / ≥ 2 min / < 2 min | +2 / +1 / 0 / −1 |
| Motion signal present | +2 |
| Ignition signal present | +1 |
| Max speed ≥ 30 / ≥ 10 / > 1 / ≤ 1 km/h | +2 / +1 / 0 / −2 |
| Telemetry samples ≥ 10 / > 0 / none | +1 / 0 / −1 |
| Distance ≥ 1 km | +1 |
| Corroborating DIMO segment | +2 |

`score ≥ 4` → **HIGH** (apply) · `≥ 2` → **MEDIUM** (apply) · `≥ 1` → **LOW**
(propose, do not apply) · else **REJECT** (do not propose).

Engine load, throttle and RPM are deliberately left out of v1: they are not in the
ClickHouse mirror today, and every one of them is already implied by the motion and
speed terms. They are additive later without changing the thresholds.

**The 298-second case.** Candidate `5e46a6de`, 2026-07-20 06:47, a 298 s ignition
fragment against the 300 s MEDIUM cutoff — LOW today, proposed and dropped four
times. Under R3: duration 4.97 min → **0**; motion segment present → **+2**;
max speed 118 km/h → **+2**; samples ≥ 10 → **+1**. Score **5 → HIGH**. Two
seconds of duration stop being decisive because four independent signals agree the
vehicle was driving.

The inverse also holds: 20 minutes of engine-on parking scores duration +2,
ignition +1, speed −2, telemetry +1 = 2 → would be MEDIUM, but the movement gate
rejects it first. The harness measured this: false positives fell from 12 to 2.

### R4 — Evidence fusion (Part 7)

Current precedence, verified: DIMO early-return → ignition → motion (ICE only when
ignition is empty) → pick-one dedupe. Three suppression paths, no combination
path.

Proposed:

1. **Always evaluate every available source**, for every profile. Remove the DIMO
   early-return and the ICE motion condition. Sources are inputs, not a priority
   list.
2. **Fuse by union, not by selection.** Overlapping candidates from different
   sources merge into the union envelope, and the contributing sources are
   recorded on the proposal. A weak candidate can then only widen or corroborate a
   stronger one — never shadow it. This is the critical rule from the brief, and
   it is exactly what today's `dedupeRepairCandidates` violates: it requires both
   edges within ±2 min and otherwise discards the loser.
3. **Corroboration raises confidence** (`+2` for a DIMO segment). Two independent
   sources agreeing is stronger evidence than either alone, which the current
   `candidateRank` cannot express.
4. **Deterministic merge semantics** — sort by start, merge while
   `next.start ≤ current.end` and `merged length ≤ MAX_DRIVE_MS`. Union is
   commutative and associative, so the result is independent of source evaluation
   order. This is what makes concurrent runs converge (§R7).

DIMO segments remain canonical for **trip boundaries** where they exist and agree.
What changes is that their existence stops being a reason not to look at anything
else.

### R-K — Containment-aware overlap (new, and the highest-value change)

Replace "does any trip touch this window?" with "how much of this drive is
represented?".

```
relevant   = trips ∩ candidate, excluding CANCELLED
ongoing ∈ relevant                → AMBIGUOUS  (diagnostic, no write)
coverage_ratio ≥ 0.90             → DUPLICATE  (no write)
otherwise                         → REPAIRABLE_GAP
    uncovered spans ≥ 5 min       → propose, scored individually
    uncovered spans 1–5 min       → observed_gap metric only, no write
```

- **CANCELLED never counts as coverage.** 18 CANCELLED rows exist today and can
  currently block repairs.
- **ONGOING yields AMBIGUOUS, not a guess.** Its `end_time` is a rolling activity
  cursor, not a boundary.
- **The `trip_repairs` row is written before the verdict**, so suppressed
  candidates become observable. Today the audit trail is created after the check
  and therefore cannot record what the check rejected.
- Proposals are the **uncovered spans**, never the whole envelope, so a repair can
  never overlap an existing trip. The harness confirms: 0 of 89 proposals overlap
  an existing trip.

### R6 — Scheduler safety (Part 9)

**Recommendation: change no cadence.**

Of 63.72 uncovered hours, cadence is the first blocker for **3.50 h across 13
drives** (bucket C). The remaining 60.2 h are algorithmic. Even that 3.5 h is only
nominally a cadence problem: the eligibility interval is `window − duration`
*because* pairing is window-bounded, so it is defect B wearing a different hat.

Under R1 the fast tier's 45-minute window stops being an upper bound on drive
length, the eligibility interval becomes the whole window, and phase dependence
disappears. The replay measures this directly: across tick phases 0/3/6/9/12 min
the baseline recovers 0.30–0.95 h (a 3× swing on a tiny base), while the proposal
recovers 61.82–61.88 h — a 0.06 h spread, i.e. phase-independent.

Increasing frequency would raise the odds of landing inside a narrow eligibility
window without widening it. That is masking, and it would add load proportional to
fleet size for a defect that costs 5% of the gap.

Two cadence-adjacent changes *are* justified, neither of which is a frequency
change:

- the fast tier iterates vehicles **serially** with an `await` per vehicle; at
  1000 vehicles this needs bounded concurrency (§H);
- the cold tier's 7-day window with R1's look-forward should cap look-forward at
  the window end plus `LOOK_FORWARD_MS`, so a 7-day scan cannot degenerate into an
  unbounded scan.

### R7 — Idempotency and concurrency (Part 10)

| Property | Mechanism |
|---|---|
| Replaying the same evidence does not duplicate | The ON edge is the identity. Proposal key `(vehicle_id, first_on_edge_at, source_set)` with a unique index on `trip_repairs(vehicle_id, window_from, window_to, repair_type)`. Re-running produces the same key and upserts. |
| Concurrent scheduler runs cannot duplicate | Union fusion is commutative and associative, so two runs over overlapping windows compute identical envelopes. Combined with the unique proposal key, the second writer loses the race deterministically instead of creating a second trip. |
| Live detection vs repair cannot race | Repair proposals are the *uncovered spans* after subtracting existing trips, evaluated inside the same transaction that creates the trip. A live trip created between assessment and write violates the unique key or is caught by a re-check under `SELECT … FOR UPDATE` on the vehicle's trip range. An intersecting ONGOING trip yields AMBIGUOUS and no write at all. |
| Completed trips are immutable | The repair path may only **create** trips over uncovered spans. Extending an existing trip's boundary is explicitly out of scope for v1 — it is the one operation that could corrupt already-enriched trips, and truncation is better repaired by an adjacent trip than by mutating a scored one. Boundary correction, if wanted, belongs in its own PR with its own audit trail. |
| CANCELLED cannot win as canonical | Excluded from coverage, from `AMBIGUOUS` detection and from the overlap query. A CANCELLED row must never mark a drive as represented. |
| Ambiguity is explicit | `AMBIGUOUS` is a first-class verdict with a reason string, persisted on the proposal and exported as `synqdrive_trip_coverage_ambiguous_total`. The algorithm never guesses a boundary it cannot derive. |

---

## F. COVERAGE INVARIANT (Part 8, R5)

**Invariant:** for every vehicle and every window, the driving time supported by
telemetry evidence must be represented by canonical trip time.

```
movement_interval   = evidence-backed drive unit (R1 pairing, R2 coalescing + I5 splitting)
canonical_coverage  = union of non-CANCELLED vehicle_trips intervals ∩ movement_interval
coverage_ratio      = duration(canonical_coverage) / duration(movement_interval)
missing_seconds     = duration(movement_interval) − duration(canonical_coverage)
```

Emitted per evaluated drive unit:

| Metric | Type | Labels |
|---|---|---|
| `synqdrive_trip_coverage_ratio` | Histogram | `profile`, `tier` |
| `synqdrive_trip_uncovered_seconds_total` | Counter | `vehicle_id`, `shape` |
| `synqdrive_trip_coverage_prefix_missing_seconds` | Histogram | `profile` |
| `synqdrive_trip_coverage_suffix_missing_seconds` | Histogram | `profile` |
| `synqdrive_trip_coverage_interior_missing_seconds` | Histogram | `profile` |
| `synqdrive_trip_longest_uncovered_span_seconds` | Gauge | `vehicle_id` |
| `synqdrive_trip_coverage_evidence_confidence` | Counter | `confidence` |
| `synqdrive_trip_canonical_trip_count` | Histogram | `shape` |
| `synqdrive_trip_expected_drive_duration_seconds` | Histogram | `profile` |
| `synqdrive_trip_coverage_ambiguous_total` | Counter | `reason` |

Thresholds:

| Level | Condition | Action |
|---|---|---|
| **WARNING** | `coverage_ratio < 0.95` on a drive ≥ 10 min, or `longest_uncovered_span ≥ 5 min` | finding recorded, no page |
| **REPAIR ELIGIBLE** | `coverage_ratio < 0.90` **and** evidence confidence ≥ MEDIUM **and** uncovered span ≥ 5 min | reconciliation proposes a repair |
| **CRITICAL DETECTION FAILURE** | fleet-wide `sum(uncovered_seconds) / sum(movement_seconds) > 0.25` over 6 h, **or** zero trips finalized fleet-wide for 6 h while movement evidence exists | page |

The second critical clause is the important one — it does not depend on any single
vehicle and fires on the *absence* of output in the presence of input.

How it would have caught each known failure:

| Failure | Detection |
|---|---|
| July fleet-wide outage (2026-07-17 → 07-20) | CRITICAL on day one: movement evidence present, `V2_LIVE` finalizations zero fleet-wide. Detected within 6 h instead of 3 days. |
| 98 / 107-minute missed drives | REPAIR ELIGIBLE — `coverage_ratio` 0.29 and 0.00, uncovered spans of 69 and 107 min |
| 37-minute scheduler-phase miss | REPAIR ELIGIBLE — `coverage_ratio` 0.0, single uncovered span of 37 min |
| Truncated-trip cases (61 of 65 gaps) | **This is the class binary overlap cannot see at all.** `coverage_ratio` 0.1–0.9 with prefix/suffix/interior attribution; today every one of these reports "a trip overlaps, therefore covered". |

The invariant is computed from data the reconciliation pass already reads, so it
adds no new query per run — only aggregation and metric emission.

---

## G. READ-ONLY REPLAY RESULTS (Part 12)

Harness: `backend/scripts/analysis/trip-detection-replay/`. `baseline.ts` mirrors
production line by line; `proposed.ts` is R1–R4 plus containment-aware overlap as
executable specification. Both are driven over identical evidence, simulating the
fast/warm/cold tiers chronologically for 90 days, with simulated trips fed back so
later runs observe earlier ones.

| Phase (min) | Mode | Trips created | Suppressed as duplicate | Ambiguous | Rejected | Drives recovered | Fully recovered | Recovered | Residual |
|---|---|---|---|---|---|---|---|---|---|
| 0 | baseline | 5 | 9720 | 0 | 346 | 1 | 1 | 0.30 h | 63.42 h |
| 3 | baseline | 5 | 9702 | 0 | 348 | 1 | 1 | 0.30 h | 63.42 h |
| 6 | baseline | 6 | 9706 | 0 | 348 | 2 | 1 | 0.95 h | 62.77 h |
| 9 | baseline | 6 | 9740 | 0 | 349 | 2 | 1 | 0.95 h | 62.77 h |
| 12 | baseline | 5 | 9708 | 0 | 350 | 1 | 1 | 0.30 h | 63.42 h |
| 0 | **proposed** | 89 | 7021 | 0 | 53 | **60** | **55** | **61.88 h** | **1.84 h** |
| 3 | proposed | 87 | 7003 | 0 | 53 | 60 | 55 | 61.88 h | 1.84 h |
| 6 | proposed | 87 | 7024 | 0 | 54 | 60 | 55 | 61.82 h | 1.90 h |
| 9 | proposed | 88 | 7006 | 0 | 54 | 60 | 55 | 61.82 h | 1.90 h |
| 12 | proposed | 88 | 7010 | 0 | 54 | 60 | 55 | 61.83 h | 1.89 h |

**How to read the baseline row.** The 63.72 h is what remains *after* every
production repair path has already run — `trip_repairs` for the same period
contains **377 applied** repairs (220 HIGH, 157 MEDIUM), almost all from the DIMO
segment path, and those repaired trips are part of the canonical coverage the gap
measurement subtracts. The baseline replay therefore answers a narrower question:
what would the **ClickHouse** repair path add on top of what production already
achieved? The answer is 0.30 h of 63.72 h, while suppressing 9720 candidates as
duplicates — a suppression-to-creation ratio of roughly 1900:1, which is the
single clearest measurement of defect 6.

The same table also shows the LOW-proposal leak: production accumulated **2830
`MISSING_TRIP` / `PROPOSED` / `LOW` rows** over 105 days, re-proposed on every
tier pass and never applied or expired. Exactly **1** `REJECTED` row exists, which
is why bucket J (persistence rejection) is unpopulated in §D.

Output quality of the proposal (phase 0):

| Check | Result |
|---|---|
| Trips created | 89 |
| False positives (observed stationary throughout) | **2** |
| False merges (≥ 10 min stop inside a created trip) | **0** |
| Proposals overlapping an existing trip | **0** |
| Proposals touching a healthy drive | **0** |
| Ambiguous cases | 0 in this dataset (no ONGOING trip intersected a candidate) |
| Residual misses | 1.84 h; 55 of 65 drives fully closed, 10 partially |

The two remaining false positives are drives where the snapshot mirror recorded no
speed above 1 km/h but ignition and motion transitions both fired — genuinely
ambiguous evidence, and the conservative reading is that they are real short
drives with a sparse mirror.

RPM sentinels — the five `NULL_UNRESOLVABLE` candidates from the forensic audit:

| Candidate | Observed | RPM | Baseline | Proposed |
|---|---|---|---|---|
| `79c4f647` | 2026-07-18 12:41:13 | 5543 | missed | **recovered** 11:58:55 → 13:25:53 |
| `d9197e1f` | 2026-07-19 07:28:01 | 5013 | missed | **recovered** 07:24:37 → 08:20:01 |
| `5e46a6de` | 2026-07-20 06:47:22 | 5575 | missed | **recovered** 06:46:22 → 07:08:45 |
| `d6073d34` | 2026-07-20 06:50:27 | 5155 | missed | **recovered** 06:26:44 → 07:06:04 |
| `aba38e11` | 2026-07-20 06:53:56 | 5887 | missed | **recovered** 06:26:44 → 07:06:04 |

5 of 5 recovered, 0 of 5 under the current algorithm. Note the recovered windows
stop at the next existing trip's start (`08:20:01`, `13:25:53`) rather than
spanning it: the proposal fills the *uncovered* span, leaving the existing trip
untouched.

Scenario coverage in this replay: 405 drives including long drives (up to 3 h 45),
short drives (5–10 min), split trips, fragmented ignition, EV (`68868291`, motion
only, no ignition telemetry), ICE, overlapping evidence, and 340 healthy drives —
none of which the proposal touched.

**Expected improvement: 61.9 of 63.7 uncovered hours recovered (97.1%), 55 of 65
drives fully closed, 60 of 65 materially improved, at 2 false positives and 0
false merges — against 0.3 h and 1 drive today.**

---

## H. SCALE ANALYSIS (Part 13)

Target 1000+ connected vehicles. Measured per-vehicle shapes from the current
fleet: ~10 state-change rows per vehicle per day (transitions only, not samples),
~2900 snapshot rows per vehicle per day at the 30 s cadence.

### ClickHouse

Per reconciliation run per vehicle the proposal issues **2 queries** (ignition,
motion) where today ICE issues 1–2 and EV issues 2. R1 widens the range by
`LOOK_FORWARD_MS = 6 h`.

```sql
SELECT changed_at, new_value
FROM telemetry_state_changes
WHERE vehicle_id = {vehicleId:String}
  AND signal_name = {signal:String}
  AND changed_at >= {from:String}
  AND changed_at <= {to:String} + INTERVAL 6 HOUR
ORDER BY changed_at
```

The table is `ORDER BY (vehicle_id, signal_name, changed_at)` partitioned monthly,
so this is a primary-key prefix range scan touching one or two partitions.

| Tier | Runs/day | Vehicles | Queries/day | Peak rate | Rows/query |
|---|---|---|---|---|---|
| fast | 96 | ~active subset, worst case 1000 | 192 000 | **2.2 q/s sustained**, 2000 in a burst | 45 min + 6 h ≈ **~3 rows** |
| warm | 6 | 1000 | 12 000 | 2000 per run | 12 h + 6 h ≈ **~8 rows** |
| cold | 1 | 1000 | 2000 | 2000 per run | 7 d + 6 h ≈ **~70 rows** |

Total ≈ **206 000 ClickHouse queries/day**, each returning tens of rows. The
binding constraint is query *count*, not data volume — the burst of 2000 queries
at each tier tick is what needs bounded concurrency, not the scan itself.

### PostgreSQL

Containment-aware overlap replaces one `findFirst` with one `findMany` per
candidate:

```sql
SELECT id, start_time, end_time, trip_status
FROM vehicle_trips
WHERE vehicle_id = $1 AND start_time < $3 AND (end_time IS NULL OR end_time > $2)
ORDER BY start_time
```

Served by the existing `vehicle_trips(vehicle_id, start_time)` index. Worst case a
7-day cold window for a heavily used vehicle returns ~40 rows.

| Query | Per run per vehicle | Index |
|---|---|---|
| vehicle + profile lookup | 1 | PK |
| trips in window | 1 (was 1 per candidate) | `(vehicle_id, start_time)` ✓ |
| proposal upsert | 1 per candidate | **needs `(vehicle_id, window_from, window_to, repair_type)` unique** |
| trip create + finalize | 2 per applied repair | PK |

Fetching trips **once per window** instead of once per candidate is a reduction:
today a window with 8 candidates performs 8 overlap queries.

### Fanout, memory, concurrency

- **Worst-case candidate fanout** — bounded by transitions in the window. A
  pathological flapping vehicle producing a transition every 30 s over a 7-day
  cold window yields ~20 000 rows → after R2 coalescing, ≤ 24 candidates/day.
  Coalescing is what makes fanout bounded; without it this vehicle produces
  thousands of LOW proposals, which is the mechanism behind the 2830 stale
  `PROPOSED`/`LOW` rows accumulated in the last 105 days.
- **Memory** — per vehicle per run the working set is the transition list plus the
  trip list: `~70 rows × ~64 B + ~40 rows × ~200 B ≈ 13 KB`. At 32-way concurrency
  that is well under 1 MB. Nothing accumulates across vehicles.
- **Concurrency** — the schedulers currently `await` per vehicle in a `for` loop.
  At 1000 vehicles and ~120 ms per vehicle that is **~2 minutes** per fast tick:
  inside the 15-minute budget but with no headroom for 5000 vehicles. Recommend a
  bounded pool (start at 16–32) plus a per-run wall-clock budget with an explicit
  `synqdrive_reconciliation_run_truncated_total` counter, so overrun becomes
  visible rather than becoming a silently skipped tail.
- **Index needs** — one addition:
  `@@unique([vehicleId, windowFrom, windowTo, repairType])` on `trip_repairs`, for
  the idempotency key in R7. Everything else is served by existing indexes.

---

## I. PR SLICING PLAN (Part 14)

Sequence derived from §D's second-order analysis: overlap semantics unlock 20.3 h
on their own and are a precondition for every later change being observable, so
they go first. Pairing carries the largest share (39.9 h) but is only realisable
once overlap stops suppressing the result.

### PR A — Containment-aware overlap + repair audit ordering

| | |
|---|---|
| **Scope** | Replace binary overlap with coverage assessment; exclude CANCELLED; ONGOING → AMBIGUOUS; write the `trip_repairs` row **before** the verdict; propose uncovered spans instead of whole envelopes |
| **Files** | `detectors/trip-overlap.detector.ts`, `reconciliation/trip-reconciliation.service.ts` (`detectAndRepairMissingTrips`), `reconciliation/reconciliation.types.ts` |
| **Schema** | `trip_repairs`: add `coverage_ratio`, `verdict`, `ambiguous_reason`; unique index `(vehicle_id, window_from, window_to, repair_type)` |
| **Tests** | Matrix rows K, L, S, T; new unit tests for coverage ratio, CANCELLED exclusion, ONGOING ambiguity, span subtraction |
| **Rollout risk** | **Medium** — more repairs will be created. Ship behind `TRIP_REPAIR_COVERAGE_MODE=off\|shadow\|on`, default `shadow` (assess and record, do not apply) |
| **Rollback** | Flag to `off`; no data migration to reverse |
| **Depends on** | — |
| **Production gate** | 48 h in `shadow`: `synqdrive_trip_coverage_ratio` populated, proposals recorded, zero applied. Compare proposal count against the harness's expectation (~27 drives / 20.3 h) before flipping to `on` |

### PR B — Bounded look-forward pairing + fragment coalescing

| | |
|---|---|
| **Scope** | R1 and R2. Replace `leadInFrame` with look-forward pairing; add coalescing invariants I1–I5; defer unclosed ON edges |
| **Files** | `modules/clickhouse/clickhouse-analytics.service.ts`, `detectors/ignition-segment.detector.ts`, `detectors/motion-segment.detector.ts`, new `trips/detectors/segment-coalescing.ts` |
| **Schema** | None |
| **Tests** | Matrix rows A–E, O, P, Q, R; property test that coalescing never bridges > 180 s and never emits an envelope the mid-gap splitter would split |
| **Rollout risk** | **Medium-high** — changes what a candidate *is*. Longest-lived defect, largest behavioural delta |
| **Rollback** | `TRIP_PAIRING_MODE=window\|lookforward`, default `window` until PR A is at `on` |
| **Depends on** | PR A (without it, new candidates are suppressed as duplicates and the change appears to do nothing) |
| **Production gate** | `synqdrive_trip_uncovered_seconds_total` falls; no increase in trips containing a ≥ 10 min stationary run; repaired trip durations remain < 6 h |

### PR C — Evidence fusion + confidence model

| | |
|---|---|
| **Scope** | R3 and R4. Remove DIMO early-return and the ICE motion condition; union fusion; additive scoring with the movement gate; persist contributions on the proposal |
| **Files** | `reconciliation/trip-reconciliation.service.ts` (`collectRepairCandidates`, `dedupeRepairCandidates`, `resolveEffectiveConfidence`, `candidateRank`), new `trips/decision/confidence-model.ts` |
| **Schema** | `trip_repairs.detector_evidence` gains a `contributions` object (JSON, no migration) |
| **Tests** | Matrix rows F, G, H, I, J; a golden test asserting the 298 s case scores HIGH and 20 min of engine-on parking scores REJECT |
| **Rollout risk** | **Medium** — changes what is applied vs merely proposed |
| **Rollback** | `TRIP_CONFIDENCE_MODEL=duration\|evidence` |
| **Depends on** | PR B (fusion of fragmented candidates is only meaningful after coalescing) |
| **Production gate** | LOW-confidence proposal backlog stops growing; `synqdrive_trip_evidence_paths_total{path}` shows motion and DIMO paths both exercised on ICE vehicles |

### PR D — Coverage invariant + observability

| | |
|---|---|
| **Scope** | R5. Emit the coverage metric family from the reconciliation pass; add alert rules; surface a per-vehicle coverage finding |
| **Files** | `modules/observability/trip-metrics.service.ts`, `reconciliation/trip-reconciliation.service.ts`, `backend/monitoring/prometheus/alerts.yml` |
| **Schema** | None |
| **Tests** | Metric emission unit tests; alert-expression tests against recorded series |
| **Rollout risk** | **Low** — additive, no behaviour change |
| **Rollback** | Metrics are additive; alert rules revert independently |
| **Depends on** | PR A for `coverage_ratio` (could ship first in a read-only form if earlier signal is wanted) |
| **Production gate** | Alerts fire in staging against a replayed outage window; CRITICAL rule verified against the 2026-07-17 series |

### PR E — Bounded historical backfill tooling

| | |
|---|---|
| **Scope** | R8, dry-run only in this PR. CLI producing a classification and an exact diff; no write path merged until the dry run is reviewed |
| **Files** | `backend/scripts/ops/trip-coverage-backfill.ts`, reusing PR B/C detection |
| **Schema** | `trip_repairs.backfill_batch_id` |
| **Tests** | Dry run over the 90-day export reproduces the harness numbers exactly |
| **Rollout risk** | **Low** while dry-run-only |
| **Rollback** | n/a |
| **Depends on** | PR C |
| **Production gate** | Dry-run output reviewed per vehicle; ambiguity quarantine non-empty and inspected |

Detection changes and backfill are deliberately separated: repairing history with a
detector that is still changing would produce trips no one can reproduce later.

---

## J. REGRESSION MATRIX (Part 15)

Permanent protection. Rows A–T are the brief's minimum; each has a concrete
fixture derived from the replay dataset where one exists.

| # | Scenario | Fixture | Assertion |
|---|---|---|---|
| A | 10 min normal trip | `19fedd4b` healthy drive | one trip, `coverage_ratio ≥ 0.95`, no repair proposed |
| B | 37 min trip at scheduler boundary | `19fedd4b` 2026-07-20 06:28:51 | detected at every tick phase 0–14 min |
| C | 98 min trip | `8c850ff1` 2026-07-19 07:24:37 | single candidate; not truncated at the 45 min window |
| D | 107 min trip | `8c850ff1` 2026-07-18 11:58:55 | detected from the fast tier |
| E | Ignition fragmentation | synthetic: 5 ON/OFF pairs, gaps 40–90 s | coalesces to 1 candidate; I1/I2 respected |
| F | 298 s strong-motion case | `5e46a6de` 2026-07-20 06:47 | scores HIGH, applied |
| G | DIMO segment + stronger ClickHouse evidence | synthetic | both evaluated; union envelope; DIMO adds +2, does not truncate |
| H | DIMO segment absent | `c10351f8` any window | ClickHouse path fully exercised |
| I | ICE motion fallback | `8c850ff1` (ICE, ignition present) | motion evaluated **despite** non-empty ignition |
| J | EV vehicle | `68868291` (no ignition telemetry) | motion-only detection unaffected |
| K | CANCELLED stale trip | synthetic CANCELLED over the candidate | does not count as coverage; repair proceeds |
| L | Overlapping canonical trips | synthetic two overlapping COMPLETED | union coverage, not summed; no double credit |
| M | Scheduler rerun | same window twice | second run creates nothing; proposal upserted |
| N | Concurrent live + repair | parallel `reconcileWindow` + live finalize | exactly one trip; unique key holds |
| O | Provider gap during trip | synthetic 4 min telemetry hole | I3 bridges (no telemetry ≠ stop); one trip |
| P | Restart mid-drive | ON edge with OFF beyond window | deferred, not closed at `to`; detected next run |
| Q | Very short genuine movement | 90 s motion, 40 km/h | scored: duration −1, motion +2, speed +2, samples +1 → MEDIUM |
| R | Parking / false positive | 20 min ignition ON, speed 0 | movement gate → REJECT |
| S | Split trip | envelope with a 5 min internal stop | I5 splits into two units; two proposals |
| T | Historical replay | full 90-day export | harness numbers reproduce exactly |

Rows E, G, K, L, N, O, R require synthetic fixtures — no production example exists,
which is itself worth recording.

---

## K. ACCEPTANCE GATES (Part 16)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | The five RPM sentinel gaps are explainable and recoverable | **PASS** | 5/5 recovered in replay; each attributed to a named bucket (§D, §G) |
| 2 | Long trips are not structurally impossible to detect | **PASS** | 98 and 107 min drives recovered from the fast tier under R1 |
| 3 | Detection is not dependent on scheduler phase | **PASS** | 61.82–61.88 h across phases 0/3/6/9/12 (0.06 h spread) vs baseline 0.30–0.95 h |
| 4 | Weak ignition evidence cannot suppress stronger motion evidence | **PASS** | ICE motion condition removed; union fusion; `5e46a6de` recovered via the motion segment ignition had masked |
| 5 | Coverage is measured by duration, not binary overlap | **PASS** | §F invariant; §C reproduction; binary overlap shown to misclassify 61 of 65 gaps |
| 6 | Healthy trips remain unchanged | **PASS** | 0 of 89 proposals touch a healthy drive; 0 overlap an existing trip; extension of existing trips explicitly out of scope |
| 7 | No false canonical trip from CANCELLED rows | **PASS** | CANCELLED excluded from coverage and from the overlap query; matrix row K |
| 8 | Ambiguity is explicit | **PASS** | `AMBIGUOUS` verdict with reason, persisted and exported; never a guessed boundary |
| 9 | Algorithm bounded for 1000+ vehicles | **PASS with a condition** | §H: ~206k CH queries/day of a few rows each, one new index; **conditional on adding bounded concurrency** — the current serial loop is the real limit, not the algorithm |
| 10 | No production writes occurred | **PASS** | All access `SELECT`-only; all evaluation offline in the harness |

All ten gates pass, one with an attached condition. `READY_FOR_IMPLEMENTATION = YES`.

---

## L. REMAINING UNKNOWNS

1. **DIMO segment behaviour is not replayable.** The early-return's real frequency
   is unmeasured — the harness omits it, which is charitable to the baseline. The
   single unattributed gap (bucket N, 0.30 h) is most likely explained here. Worth
   instrumenting `synqdrive_trip_evidence_paths_total{path}` before PR C.
2. **Snapshot mirror completeness.** ClickHouse `telemetry_snapshots` is written
   fire-and-forget. Drives with a sparse mirror get weaker movement evidence, which
   is the likely cause of the 2 residual false positives.
3. **The 1.84 h residual.** 10 drives remain partly uncovered under the proposal
   (55 of 65 are fully closed). Not yet individually diagnosed; most are likely
   sub-5-minute uncovered spans below `MIN_REPAIR_SPAN_MS`, which is intended
   conservatism rather than a defect.
4. **Boundary correction of existing truncated trips.** The proposal fills gaps
   *around* short trips rather than extending them, so a 6-minute trip inside a
   107-minute drive stays 6 minutes with repaired trips either side. Whether that
   is the right canonical shape, or whether the short trip should be absorbed, is a
   product decision this design does not make.
5. **Enrichment cost of the new trips.** 89 repaired trips over 90 days on 6
   vehicles is small, but at 1000 vehicles the equivalent is ~15 000 enrichment
   jobs per 90 days. Sizing belongs with PR C.
6. **`STATIONARY_BREAK_MS = 150 s` is not empirically tuned.** Chosen to sit below
   `COALESCE_GAP_MS`. Worth a sensitivity sweep during PR B.

---

## M. FIRST IMPLEMENTATION PR RECOMMENDATION

**PR A — containment-aware overlap + repair audit ordering**, shipped behind
`TRIP_REPAIR_COVERAGE_MODE` defaulting to `shadow`.

Rationale:

- It is the **first blocker** for 26 of 65 gaps and unlocks **20.3 h of the 63.7 h
  with no other change** (§D second-order).
- It is a **precondition for measuring anything else**: while overlap suppresses
  9720 candidates per 90 days, an improvement in pairing or confidence produces no
  observable delta.
- It fixes the **observability defect** in the same change — moving the
  `trip_repairs` write ahead of the verdict turns an invisible suppression into a
  recorded decision, which is what makes PRs B and C verifiable in production.
- It is the **smallest diff**: one detector and one method in the reconciliation
  service, plus additive columns.
- Shadow mode makes it a **pure read** on day one: assess, record, apply nothing.

---

## N. FIRST BROKEN BOUNDARY

Two, at different layers.

**In the repair path — boundary 6, duplicate/overlap prevention.** For 26 of 65
gaps this is the earliest stage that blocks a recoverable drive, and for all four
distinct RPM sentinel windows it would have blocked the repair even with pairing
and confidence fixed (§B.4). It is also the boundary that destroys its own
evidence, since the audit row is written after the check.

**In the live path — boundary 2, DIMO → SynqDrive ingestion, still exposed.**
`DimoSnapshotProcessor.process()` line 219 awaits
`resolutionOutboxProcessor.processPendingBatch()` **unguarded**, ahead of
`evaluateTripStart`. This is the same shape as the July 2026 trigger, which was
fixed at the Battery V2 call site rather than as a class. A throw from the outbox
drain aborts trip evaluation for that snapshot, and if it throws persistently it
does so fleet-wide.

This is not part of the hardening design and needs no design work — it is a
`try/catch` and a warning log, matching the treatment the Battery V2 call already
received at `:259–303`. Recommended as a standalone one-line fix ahead of PR A,
because the coverage invariant that would detect a recurrence does not exist yet.

---

## O. PRODUCTION MUTATIONS

Allowed and performed:

- `SELECT` against production PostgreSQL (trips, vehicles, RPM candidates, repairs)
- `SELECT` against production ClickHouse (state changes, snapshot aggregates)
- offline algorithm evaluation over exported files
- documentation and analysis-only tooling committed to the repository

Forbidden and not performed: creating, repairing, splitting or cancelling trips;
write-mode reconciliation; historical backfill; DIMO trigger changes; RPM
threshold changes; scheduler cadence changes; deploys; service restarts; merges.

```
PRODUCTION_MUTATIONS   = NONE
IMPLEMENTATION_STARTED = NO
BACKFILL_STARTED       = NO
READY_FOR_IMPLEMENTATION = YES
```

---

## Appendix — R8 historical backfill strategy (Part 11, design only)

Executed only after PRs A–C are live and the coverage invariant has been stable
for one full cold cycle.

| Requirement | Design |
|---|---|
| Dry-run classification first | `trip-coverage-backfill.ts --dry-run --from --to --vehicle` emits per drive: movement interval, coverage ratio, uncovered spans, proposed trips, confidence and contributions. No write path is reachable without `--apply`, which is a separate merged change. |
| Exact before/after diff | Per vehicle: canonical trip list before, proposed additions, resulting coverage ratio. Rendered as a reviewable artifact, not a log. |
| No blind `updateMany` | Writes go through `TripDecisionEngine.createRepairedTrip` / `finalizeRepairedTrip` only — the same architectural rule the reconciliation service already obeys. |
| No overwrite of valid trips | Backfill may only **create** trips over spans uncovered by non-CANCELLED trips. Existing trips are never modified, extended or deleted. |
| Source provenance | `trip_source = REPAIRED`, `is_repaired = true`, `start/end_detection_mode = COVERAGE_BACKFILL_*`, `trip_repairs.backfill_batch_id`, and the full contribution vector in `detector_evidence`. |
| Ambiguity quarantine | `AMBIGUOUS` verdicts, `MAX_DRIVE_MS` violations and unresolved ON edges are written as proposals with `status = QUARANTINED` and never applied. Reviewed by hand. |
| Per-vehicle batching | One vehicle per batch, one date range per batch, sequential. A batch is a unit of review and of rollback. |
| Rollback / auditability | Every created trip carries `backfill_batch_id`; rollback is `DELETE FROM vehicle_trips WHERE backfill_batch_id = $1 AND is_repaired` plus the enrichment rows keyed to those trips. Never a time-range delete. |
| Bounded date range | Maximum 7 days per invocation, hard-capped at the 90-day analysis window. No open-ended range. |
| No uncontrolled fleet-wide write | No "all vehicles" mode exists. `--vehicle` is required. |

Expected population from the current replay: ~89 trips across 6 vehicles covering
~61.9 h, of which the 12.3 h in August matter most because that data feeds live
driver scores and rental analysis.
