# Trip-Detection Gap Forensic Audit — the 5 remaining NULL_UNRESOLVABLE RPM candidates

Date: 2026-08-28
Scope: **READ-ONLY forensic audit. `PRODUCTION_MUTATIONS = NONE`.**
Status: analysis and repair *design* only — nothing implemented, nothing deployed.

Follows `EVENT_TRIP_ASSOCIATION_STAGE2_EXECUTION_RECORD_2026-08-28.md`, which
repaired every historically resolvable RPM candidate and left exactly 5
`NULL_UNRESOLVABLE` rows. Those 5 are the subject here.

---

## 1. Executive verdict

**B — MULTIPLE TRIP-DETECTION FAILURE MODES CONFIRMED, sharing one upstream trigger.**

All five events are real drives. ClickHouse holds ignition/motion evidence
containing every one of them, and in four of five that evidence is
**HIGH confidence**. This is therefore *not* a provider telemetry gap and *not*
an ingestion gap — verdict C is positively excluded by data.

One upstream fault put all five into the same situation: between **2026-07-17
and 2026-07-20 11:20** the live V2 trip detector produced **zero trips
fleet-wide**, because `DimoSnapshotProcessor` aborted on an unguarded Battery V2
enqueue before it ever reached trip-start evaluation. For three days every trip
in the system came from the retroactive repair path.

The repair path then failed on all five, but for **three different reasons**:

| Failure mode | Candidates | Why |
|---|---|---|
| Drive longer than the reconciliation window | `79c4f647`, `d9197e1f` | 107 min and 98 min drives cannot fit both ignition ON and OFF inside a 45-minute window, so the segment is never formed |
| Detection opportunity shorter than the scheduler period | `d6073d34`, `aba38e11` | 37-minute drive leaves a 7m47s window in which a scan could see both endpoints; the scheduler ticks every 15 min and missed it |
| Confidence gate + suppressed second opinion | `5e46a6de` | the containing ignition fragment is **298 s, two seconds under the 300 s MEDIUM cutoff** → `LOW` → never applied; the clean **HIGH** motion segment covering the same event was never queried because the vehicle is `ICE` |

The five known candidates are sentinels, not the population. A bounded 90-day
cross-check finds **49 drives with ≥5 minutes of driving absent from any
canonical trip, totalling ~42.7 h across all 5 live tracked vehicles**, and the
pattern continues into August after the live-detection fix.

---

## 2. The exact five candidates

Re-derived directly from production, not from the Stage 2 report.
`trip_id IS NULL` and the deployed resolver returns no eligible trip. Exactly 5 remain.

| # | Candidate | Vehicle | Plate / model | Token | Observed at (UTC) | RPM | Threshold | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `79c4f647-2085-4783-9a21-fde57c07c991` | `8c850ff1` | HMÜ C 215 — VW Arteon | 187784 | 2026-07-18 12:41:13 | 5543 | 5000 | `CONTEXT_ENRICHED` |
| 2 | `d9197e1f-00cb-49a7-8ae7-52a6df1a0262` | `8c850ff1` | HMÜ C 215 — VW Arteon | 187784 | 2026-07-19 07:28:01 | 5013 | 5000 | `CONTEXT_ENRICHED` |
| 3 | `5e46a6de-8714-45f2-abdd-97142e0709da` | `8c850ff1` | HMÜ C 215 — VW Arteon | 187784 | 2026-07-20 06:47:22 | 5575 | 5000 | `CONTEXT_ENRICHED` |
| 4 | `d6073d34-6585-45c8-b00b-d16fb0d8e2be` | `19fedd4b` | WOB L 7503 — VW Tiguan | 192922 | 2026-07-20 06:50:27 | 5155 | 5000 | `CONTEXT_ENRICHED` |
| 5 | `aba38e11-d6f1-4c7a-a9c7-cba8779ed690` | `19fedd4b` | WOB L 7503 — VW Tiguan | 192922 | 2026-07-20 06:53:56 | 5887 | 5000 | `INSUFFICIENT_CONTEXT` |

All are `provider = DIMO`, `trigger_type = RPM_THRESHOLD`, organization
`faa710c9`. All five fall inside the 2026-07-17 → 2026-07-20 live-detection
outage. Candidates 3–5 cluster within 7 minutes across two vehicles, which is
the convoy signature discussed in §4.

---

## 3. Provider activity proof

Each candidate carries a `context_assessment_json` written at intake, which
recorded DIMO historical signals for a ±30 s window around the anchor. This is
independent of RPM and is the strongest available evidence.

| Candidate | speed min/avg/max (km/h) | samples | coolant avg | `engineOnHint` | Reason codes | Classification |
|---|---|---|---|---|---|---|
| `79c4f647` | 106 / 138.2 / **165** | 6 | 91.2 °C | true | NATIVE_EVENT_ANCHOR, WARM_ENGINE, HIGH_RPM, MOVING_BEFORE_EVENT | **VEHICLE_MOVEMENT_PROVEN** |
| `d9197e1f` | 103 / 103 / 103 | 16 | 93.0 °C | true | NATIVE_EVENT_ANCHOR, WARM_ENGINE, MOVING_BEFORE_EVENT | **VEHICLE_MOVEMENT_PROVEN** |
| `5e46a6de` | 0 / 45 / 118 | 24 | 90.3 °C | true | NATIVE_EVENT_ANCHOR, WARM_ENGINE, HIGH_RPM, MOVING_BEFORE_EVENT | **VEHICLE_MOVEMENT_PROVEN** |
| `d6073d34` | 72 / 82 / 92 | 21 | 95.5 °C | true | + HIGH_THROTTLE, HIGH_ENGINE_LOAD | **VEHICLE_MOVEMENT_PROVEN** |
| `aba38e11` | 77 / 86.3 / 105 | 3 | 95.3 °C | true | + SPARSE_SIGNAL_CADENCE, HIGH_THROTTLE | **VEHICLE_MOVEMENT_PROVEN** |

Answering the required questions for all five: engine running **yes** (warm
coolant 90–95 °C plus `engineOnHint`), ignition **ON**, speed **> 0**, movement
**proven** (`79c4f647` was on a motorway at 106–165 km/h), continuous activity
interval **yes** (see §4). Odometer and GPS displacement were not needed and are
not separately asserted.

The decisive point: the enrichment pipeline **successfully fetched DIMO
telemetry for exactly these timestamps**. Provider data existed and was
retrievable at the time. No candidate is `INSUFFICIENT_PROVIDER_EVIDENCE`.

---

## 4. Timelines, gaps, and the reconstructed missing windows

### 4.1 Gap arithmetic (independently verified)

| Candidate | Previous trip end | Event | Next trip start | Gap | Event sits |
|---|---|---|---|---|---|
| `79c4f647` | 11:55:53 (`1702244f`) | 12:41:13 | 13:25:53 (`a16e75cd`) | **90.00 min** | +45.33 / −44.67 |
| `d9197e1f` | 05:07:00 (`69e68bf1`) | 07:28:01 | 08:20:01 (`1917b0f8`) | **193.02 min** | +141.02 / −52.00 |
| `5e46a6de` | 06:35:13 (`0f91164c`) | 06:47:22 | 07:13:11 (`caba83b7`) | **37.97 min** | +12.15 / −25.82 |
| `d6073d34` | 06:26:44 (`6810cd87`) | 06:50:27 | 07:09:01 (`ea8d1632`) | **42.28 min** | +23.72 / −18.57 |
| `aba38e11` | 06:26:44 (`6810cd87`) | 06:53:56 | 07:09:01 (`ea8d1632`) | **42.28 min** | +27.20 / −15.08 |

The Stage 2 statement of "38–193 minute gaps between completed trips" is
**confirmed**. Note candidates 4 and 5 share one gap, so there are **4 distinct
missing windows**, not 5. No `CANCELLED` trip overlaps any window (class F
excluded).

### 4.2 Reconstructed drives from ClickHouse `telemetry_state_changes`

Detector SQL reproduced exactly (`leadInFrame` pairing, `new_value = 1`,
`min duration 60 s` ignition / `30 s` motion) over a generous ±2 h window:

| Candidate | Ignition segment containing event | Motion segment containing event |
|---|---|---|
| `79c4f647` | 11:58:55 → 13:45:46 — **6411 s, HIGH** | 11:59:04 → 13:23:26 — **5062 s, HIGH** |
| `d9197e1f` | 07:24:37 → 09:02:38 — **5881 s, HIGH** | 07:24:56 → 08:17:18 — **3142 s, HIGH** |
| `5e46a6de` | 06:46:52 → 06:51:50 — **298 s, LOW** | 06:47:04 → 07:08:45 — **1301 s, HIGH** |
| `d6073d34` | 06:28:51 → 07:06:04 — **2233 s, HIGH** | 06:46:56 → 07:05:10 — **1094 s, HIGH** |
| `aba38e11` | 06:28:51 → 07:06:04 — **2233 s, HIGH** | 06:46:56 → 07:05:10 — **1094 s, HIGH** |

`LIKELY_MISSING_TRIP_START` / `END` per candidate (bounded by ignition, the
outer envelope; motion gives the moving sub-interval):

| Candidate | Likely start | Likely end | Boundary confidence |
|---|---|---|---|
| `79c4f647` | 2026-07-18 11:58:55 | 2026-07-18 13:45:46 | start **certain**, end **certain** (both are explicit ignition transitions) |
| `d9197e1f` | 2026-07-19 07:24:37 | 2026-07-19 09:02:38 | both **certain** |
| `5e46a6de` | 2026-07-20 06:41:00 | 2026-07-20 07:12:59 | **uncertain** — ignition flapping; envelope inferred from the fragment chain, motion 06:47:04→07:08:45 is the reliable core |
| `d6073d34` / `aba38e11` | 2026-07-20 06:28:51 | 2026-07-20 07:06:04 | both **certain** |

Nothing was inserted into `vehicle_trips`. This is reconstruction only.

### 4.3 Convoy corroboration

The two vehicles were driven together, which independently corroborates the
reconstruction and isolates the DIMO segment gap:

- 2026-07-18: Tiguan has DIMO segment `dimo-seg-192922-1784374200000`
  **11:30:00 → 13:45:48**. The Arteon's reconstructed drive ends **13:45:46** —
  two seconds apart — but DIMO produced **no segment for token 187784**.
- 2026-07-19: Tiguan has `dimo-seg-192922-1784445780000` **07:23:00 → 08:32:46**,
  covering the Arteon's 07:24:37 → 09:02:38 drive. Again no segment for 187784.
- 2026-07-20 morning: neither token has any DIMO segment between 04:04 and 12:05.

So DIMO `changePointDetection` has real per-token segment gaps. That is a
contributing factor, not the root cause — ClickHouse had the evidence.

---

## 5. Current trip-detection pipeline

```
DIMO provider
  → DimoSnapshotProcessor (BullMQ queue DIMO_SNAPSHOT)
      · normalize snapshot
      · upsert VehicleLatestState
      · Battery V2 classifyAndEnqueue          ← line ~154
      · evaluateTripStart(...)                 ← line ~306
  → TripDetectionOrchestrationService (live FSM)
      · ACTIVE_TRACKING / processActiveTick / mid-gap split
      · finalizeTrip → TripDecisionEngine      → vehicle_trips (trip_source = V2_LIVE)
  ── retroactive safety net ──────────────────────────────
  → TripReconciliationScheduler
      · fast  @Interval 15 min → window = last 45 min, vehicles active in last 60 min
      · warm  @Interval  4 h   → window = last 12 h, all vehicles with DIMO tokens
      · cold  @Cron 03:00      → window = last 7 d,  all vehicles with DIMO tokens
  → TripReconciliationService.reconcileWindow
      1 repairStaleOngoingTrips
      2 detectAndRepairMissingTrips  ← the path that matters here
      3 repairMissingEnds
      4 repairIntraTripGapSplits
      5 detectEnergyEvents
      6 EventTripAssociationService.reconcileUnresolvedWindow   (Stage 1)
  → collectRepairCandidates
      · DIMO segments (if any → EARLY RETURN, since 2026-07-20)
      · else ClickHouse ignition segments (IgnitionSegmentDetector)
      · else/also motion segments (MotionSegmentDetector, EV/HYBRID/UNKNOWN or ignition empty)
  → confidence gate: only HIGH | MEDIUM are applied
  → TripDecisionEngine.createRepairedTrip + finalizeRepairedTrip
      → vehicle_trips (trip_source = REPAIRED, is_repaired = true)
```

Key constants, all in code:

- `MIN_IGNITION_SEGMENT_DURATION_MS = 60_000`, `MIN_MOTION_SEGMENT_DURATION_MS = 30_000`
- segment confidence: `≥ 15 min → HIGH`, `≥ 5 min → MEDIUM`, else `LOW`
- `detectAndRepairMissingTrips` applies only `HIGH` or `MEDIUM`; `LOW` stays `PROPOSED` forever
- `buildDimoSegmentCandidates` drops segments with `isOngoing` or `startedBeforeRange`
- ICE vehicles run the motion detector **only** when ignition produced zero candidates

---

## 6. Boundary matrix and first broken boundary

| # | Boundary | `79c4f647` | `d9197e1f` | `5e46a6de` | `d6073d34` | `aba38e11` |
|---|---|---|---|---|---|---|
| 1 | Vehicle → DIMO telemetry | PASS | PASS | PASS | PASS | PASS |
| 2 | DIMO → SynqDrive ingestion | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** |
| 3 | Telemetry → activity classification | PASS | PASS | PASS | PASS | PASS |
| 4 | Activity → trip-start detection (live) | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED |
| 5 | Trip-start → `vehicle_trip` persistence | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED |
| 6 | Active tracking | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED |
| 7 | Trip finalization | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED |
| 8 | Gap / split logic | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED | NOT EXERCISED |
| 9 | Missing-trip detection | **FAIL** | **FAIL** | PASS | **FAIL** | **FAIL** |
| 10 | Missing-trip repair persistence | NOT EXERCISED | NOT EXERCISED | **FAIL** | NOT EXERCISED | NOT EXERCISED |

**FIRST BROKEN BOUNDARY = 2 (DIMO → SynqDrive ingestion) for all five.**

Boundary 2 evidence: `DimoSnapshotProcessor.process` awaited
`batteryObservationProducer.classifyAndEnqueue()` **unguarded** at line ~154,
before `evaluateTripStart` at line ~306. Its `correlationId` was
`snapshot:${vehicleId}:${fetchedAt.toISOString()}` — colons in a BullMQ v5
custom job id, which BullMQ rejects. Every snapshot poll threw and aborted
before trip-start evaluation. Commit `06d5642b3` (2026-07-20 10:57:03 UTC)
hashed the job id and wrapped the call in `try/catch` with the comment *"Trip
start evaluation must not depend on battery queue health"*.

Corroborating production data — `V2_LIVE` trips per day, fleet-wide:

| Date | V2_LIVE | REPAIRED | Vehicles with live trips |
|---|---|---|---|
| 2026-07-15 | 14 | 4 | 2 |
| 2026-07-16 | 18 | 4 | 5 |
| **2026-07-17** | **0** | 34 | **0** |
| **2026-07-18** | **0** | 30 | **0** |
| **2026-07-19** | **0** | 25 | **0** |
| 2026-07-20 | 34 | 21 | 2 |

Last `V2_LIVE` before the outage: 2026-07-16 22:42. First after:
**2026-07-20 11:20:08** — 23 minutes after the fix commit. All five events fall
inside the outage.

Because the live path was dead, boundaries 4–8 were never reached; the
retroactive path is where the individual failures then occurred.

---

## 7. `detectAndRepairMissingTrips` audit

**Location:** `TripReconciliationService.detectAndRepairMissingTrips`
(`backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts`).
Not renamed.

| Property | Behaviour |
|---|---|
| When it runs | via `reconcileWindow` step 2, from the tiered scheduler or manual trigger |
| Cadence | fast 15 min / warm 4 h / cold daily 03:00 |
| Vehicle selection | fast: `VehicleLatestState` with `lastSeenAt` **or** `providerFetchedAt` within 60 min. warm/cold: all vehicles with a `dimoTokenId` |
| Lookback | 45 min / 12 h / 7 d |
| Provider inputs | DIMO changePoint segments; ClickHouse `telemetry_state_changes` (`ignition`, `motion`) |
| Required evidence | a paired ON→OFF transition **both inside the query window** |
| Minimum duration | ignition 60 s, motion 30 s |
| Confidence | `≥15 min HIGH`, `≥5 min MEDIUM`, else `LOW` |
| Applied | **only HIGH or MEDIUM** |
| Exclusions | `TripOverlapDetector` verdict `TRIGGERED` → `continue` **before** any audit row is written |
| Idempotency | **none** — the same window is re-proposed on every run; `LOW` rows accumulate indefinitely |
| Batch limits | none |
| Surrounding trips | affect it only through the overlap check |

### Why it did not repair each window

**`79c4f647` and `d9197e1f` — it never formed a candidate.**
Segments are built by pairing an ON with the next transition **inside the query
window**. For a drive of duration `D`, a window of length `W` can contain both
endpoints only if a run happens in a slot of length `W − D`. With `W = 45 min`:

- `79c4f647`: `D = 107 min` → `45 − 107 < 0` → **structurally impossible**
- `d9197e1f`: `D = 98 min` → **structurally impossible**

Replaying the exact detector SQL at 15-minute ticks across event ±60 min returns
**no candidate containing the event at any tick**, confirming the arithmetic.
The warm and cold windows are wide enough, and a ±2 h replay does return
**HIGH** — but no proposal of any source was ever recorded covering these two
events (verified by direct query). DIMO produced no segment for token 187784 for
either drive, and a 107-minute drive inside a 45-minute window would in any case
be dropped by the `startedBeforeRange` filter.

**`5e46a6de` — it examined the window and the predicate rejected it.**
This is the only candidate with a proposal that actually contains the event:

| Repair id | Window | Confidence | Status | Created |
|---|---|---|---|---|
| `7ed7eb01` | 06:46:52 → 06:51:50 | LOW | PROPOSED | 06:56:22 |
| `dd1dc936` | 06:46:52 → 06:51:50 | LOW | PROPOSED | 07:11:23 |
| `98fb07a2` | 06:46:52 → 06:51:50 | LOW | PROPOSED | 07:26:22 |
| `e9d6b268` | 06:46:52 → 06:51:50 | LOW | PROPOSED | 08:26:23 |

The exact rejecting predicate is
`if (effectiveConfidence === 'HIGH' || effectiveConfidence === 'MEDIUM')`.
The segment is **298 s**; `MEDIUM` requires **300 s**. It missed by **two
seconds** and was re-discovered and re-dropped four times.

The underlying cause is ignition flapping: the drive was shredded into
06:41:00–06:43:15, 06:43:20–06:45:44, 06:46:52–06:51:50, 06:51:52–06:55:29,
06:55:43–06:59:38, 07:02:46–07:03:46, 07:10:43–07:12:59. Merged, that is a
~32-minute drive that would score `HIGH`. Compounding it, the motion detector
had a clean **HIGH** segment 06:47:04 → 07:08:45 (1301 s) containing the event
in the same window — but the vehicle profile is `ICE`, and motion runs for ICE
only when ignition produced **zero** candidates. Ignition produced many, so the
better evidence was never queried.

**`d6073d34` and `aba38e11` — the opportunity window was shorter than the tick period.**
`D = 37.2 min` → opportunity `= 45 − 37.2 = 7.8 min`. Detection required a run
in **[07:06:04, 07:13:51]**. Observed proposal-bearing runs for this vehicle on
that morning: 05:26:21, 05:41:20, **06:41:21**, **07:26:20**, 08:11:23 — none in
the slot. By the 07:26:20 run the 45-minute lookback began at 06:41:20, which
truncated the 06:28:51 ignition-ON; the detector then saw only
07:09:01 → 07:16:48 (467 s, MEDIUM) and created *that* trip instead — which is
exactly the `ea8d1632` boundary the events fall short of.

**Evidence limitation, stated explicitly:** `trip_repairs` rows are written only
when a candidate is proposed, and the overlap check runs *before* the row is
created. Absence of a row is therefore a lower bound on scanning, not proof that
no scan occurred. This is itself an audit blind spot worth closing.

---

## 8. Root cause per candidate

Classified independently; they do **not** all share one repair-path cause.

| Candidate | Primary | Secondary |
|---|---|---|
| `79c4f647` | **J** — live detector dead (ingestion abort), then **A/G**: 107-min drive exceeds the 45-min window so no candidate can form | DIMO segment gap on token 187784; `startedBeforeRange` drops long segments |
| `d9197e1f` | **J** then **A/G** — 98-min drive, same structural impossibility | same |
| `5e46a6de` | **J** then **H** — proposal contained the event but was rejected at the confidence gate (298 s vs 300 s) | **E** — ICE rule suppressed the HIGH motion segment; ignition-signal fragmentation |
| `d6073d34` | **J** then **G** — opportunity window 7.8 min < 15-min tick period; lookback truncated the ignition-ON | DIMO segment gap on token 192922 |
| `aba38e11` | **J** then **G** — identical window to `d6073d34` | same |

Excluded by evidence: **B** (no swallowing split), **C** (provider data present),
**D** (data *was* ingested — it is in ClickHouse), **F** (no CANCELLED or deleted
trip overlaps any window), **K** (no concurrency signature), **L** (no trip
anywhere contains these timestamps), **I** (timestamps are coherent across
sources).

### Shared systemic root cause

One trigger, three amplifiers:

1. **Trigger** — an unguarded, non-trip-related failure inside the snapshot
   processor could abort trip-start evaluation. Fixed on 2026-07-20.
2. **Amplifier 1 — window-bounded segment pairing.** Segments only exist if both
   transitions fall in one query window, so detectability is a function of
   `window − duration`. Long drives are invisible to the fast tier; medium
   drives are a scheduling lottery.
3. **Amplifier 2 — duration used as a proxy for confidence.** A raw ON→OFF
   duration decides whether a real drive is persisted, with no coalescing of
   fragments and a hard cliff at exactly 300 s.
4. **Amplifier 3 — evidence sources compete instead of combining.** ICE
   suppresses motion when ignition yields anything, and since 2026-07-20 DIMO
   segments short-circuit ClickHouse entirely. Each source's blind spot is
   exactly what the other would have covered.

Amplifier 3's DIMO early-return was introduced **after** these five events
(commit `06d5642b3`, 10:57 on 2026-07-20) and therefore did **not** cause them.
It is listed because it makes the same class of miss more likely going forward:
a wide warm/cold window almost always contains some DIMO segment, so the
ClickHouse detectors that hold the missing evidence are now rarely reached.

---

## 9. Production blast radius

Bounded, indexed queries only. No full scans.

Method: reproduce ignition segments from ClickHouse for the last 90 days,
restrict to vehicles still in `vehicles`, keep plausible drive durations
(5 min – 4 h), and measure **time coverage** by non-cancelled `vehicle_trips`.

Measuring coverage in *seconds* matters: a naive "does any trip overlap"
test counts a 107-minute drive as covered when a single 6-minute trip sits
inside it, which is exactly the shape of these failures.

| Metric | Value |
|---|---|
| Plausible ignition drives ≥5 min, live fleet, 90 d | 367 (179.8 h) |
| ≥90 % covered (healthy) | 301 drives (0.7 h missing) |
| 50–90 % covered | 33 drives (5.8 h missing) |
| **<50 % covered** | **33 drives (36.2 h missing)** |
| **Drives with ≥5 min untracked** | **49 drives, ~42.7 h** |
| Drives with 0 % coverage | 0 |

| Vehicle | Plate | Drives ≥5 min untracked | Untracked time |
|---|---|---|---|
| `8c850ff1` | HMÜ C 215 | 22 | 19.06 h |
| `c10351f8` | KS MS 661 | 10 | 17.24 h |
| `19fedd4b` | WOB L 7503 | 15 | 6.02 h |
| `c43c3b45` | WOB L 9755 | 1 | 0.31 h |
| `a60c0749` | KS MX 2024 | 1 | 0.12 h |

| Month | Drives ≥5 min untracked | Untracked time |
|---|---|---|
| 2026-06 | 0 | 0.0 h |
| 2026-07 | 35 | 29.8 h |
| **2026-08** | **14** | **12.9 h** |

**KNOWN 5 GAPS** — confirmed, and the `19fedd4b` 06:28:51 → 07:06:04 drive is
present in the uncovered set as an independent validation of the method.
**POTENTIAL ADDITIONAL GAPS** — 49 drives / ~42.7 h.
**TOTAL VEHICLES AFFECTED** — **5 of 5** live tracked vehicles, not the 2 with
RPM sentinels.
**CONFIDENCE** — medium-high, and these are **lower bounds**: the analysis uses
ignition only (motion-only drives on EV-style vehicles are excluded), covers
90 days, and drops segments over 4 h.

Two secondary findings:

- **The dominant failure shape is truncation, not absence.** No drive has 0 %
  coverage; the common pattern is a canonical trip covering a fraction of a
  longer real drive, leaving uncovered spans in the middle. Any event landing in
  such a span becomes `NULL_UNRESOLVABLE`. This also means "count the missing
  trips" is the wrong metric — uncovered *time* is the right one.
- **16 ignition-ON events across 5 vehicles never receive an OFF within 4 h**
  (the longest pairs an ON with a transition 7 days later). These are telemetry
  artifacts, not drives, and they are a second reason ON/OFF pairing is fragile.
  They were excluded from the numbers above rather than inflating them.

Exhaustive detection across all signals and full history would need an offline
job; it was not run.

---

## 10. Driver-score and downstream impact

`candidate.trip_id` itself is not consumed by scoring — confirmed in Stage 2:
`driver-score.service.ts` contains no RPM references, and
`data-analyse.service.ts` selects candidate fields without `tripId`. So the five
`NULL` associations cost nothing directly.

The real downstream cost is the **missing trip time**. Roughly 42.7 h of
driving is not represented by a canonical trip, so for those spans there is no
trip to enrich, score, attribute to a driver or booking, or bill. Consequences:

- driving scores are computed over a biased sample — the drives that survived
  detection — and the most affected vehicle is missing ~19 h;
- behaviour, speeding and abuse events in uncovered spans are never attributed;
- vehicle-level distance and utilisation are understated;
- tire/brake usage attribution keyed off trips under-counts.

No recalculation is recommended yet: recomputing scores over an incomplete trip
set would just re-bias them. Score reconciliation should follow trip repair, not
precede it.

---

## 11. Architectural weaknesses

1. **Detectability depends on scheduler phase.** `opportunity = window − duration`
   is an accidental property, not a designed one. Any drive longer than the fast
   window is invisible to it, and 30–45 min drives are a coin flip.
2. **Duration is a proxy for confidence.** A hard 300 s cliff decides whether a
   real drive becomes a trip. `5e46a6de` lost by 2 seconds.
3. **No fragment coalescing.** A noisy ignition line turns one drive into seven
   sub-threshold fragments; each is judged alone. The code comments acknowledge
   the fragmentation but address it only by preferring DIMO.
4. **Evidence sources are mutually exclusive.** ICE suppresses motion; DIMO
   short-circuits ClickHouse. Each source's blind spot is the other's strength.
5. **`LOW` proposals are an unbounded, non-idempotent backlog.** 8103 DIMO and
   313 ClickHouse `LOW` rows are re-proposed forever with no dedupe, no expiry
   and no alert — a real signal buried in noise.
6. **The overlap check runs before the audit row is written**, so
   overlap-suppressed candidates leave no trace and cannot be audited.
7. **Non-trip failures can abort trip detection** — the original trigger. The
   `try/catch` fixed one call site; the ordering hazard remains structural.
8. **No coverage invariant.** Nothing compares "hours the vehicle was running"
   against "hours represented by trips", so a 3-day fleet-wide live-detection
   outage produced no alert.

---

## 12. Recommended repair strategy — DESIGN ONLY

Not implemented. Ordered by value over risk.

**R1 — Decouple segment pairing from the query window.** When an ON has no OFF
inside the window, look forward past `to` for the closing transition (bounded,
e.g. +6 h) instead of discarding it. This alone fixes `79c4f647` and `d9197e1f`
and removes the phase lottery for `d6073d34`/`aba38e11`. Touches
`ClickHouseAnalyticsService.findIgnitionSegments` / `findMotionSegments`.

**R2 — Coalesce fragments before scoring.** Merge consecutive same-signal
segments separated by less than a configurable idle gap (~3 min, aligned with
`TRIP_MID_GAP_SPLIT_MS`) and score the merged envelope. `5e46a6de`'s seven
fragments become one ~32-min `HIGH` drive. Do this before the confidence gate.

**R3 — Combine evidence instead of choosing one source.** Always evaluate DIMO,
ignition and motion, then dedupe and rank as `dedupeRepairCandidates` already
can. Removes the DIMO early-return and the ICE motion suppression. Keeps DIMO
canonical for boundaries via `candidateRank`, while letting ClickHouse fill
DIMO's gaps.

**R4 — Stop using raw duration as the sole confidence input.** Corroborate with
movement: a segment with sustained speed > 0 and a plausible distance should
reach `MEDIUM` regardless of length. Avoids losing a real drive by 2 seconds.

**R5 — Add a coverage invariant and alert.** Periodically compare running time
against trip-covered time per vehicle and alert when the uncovered fraction
exceeds a threshold. This is the control that would have caught the 3-day
outage on day one.

**R6 — Make repairs idempotent.** Deduplicate `PROPOSED` repairs on
`(vehicle, window)` and expire stale ones, so the queue reflects reality.

**R7 — Move the overlap check after the audit write** (or record a suppressed
verdict) so every considered candidate is auditable.

**R8 — Separately, a bounded historical backfill** for the ~42.7 h identified in
§9, run through `TripDecisionEngine` with the same guard discipline as Stage 2.
Should follow R1–R4, not precede them.

Explicitly **not** recommended: changing DIMO triggers or RPM thresholds; the
threshold behaved correctly and the events are genuine.

---

## 13. Tests required before implementation

- `ClickHouseAnalyticsService`: ON with no OFF in window resolves via bounded
  look-forward; ON with no OFF at all stays unpaired; the >4 h artifact class is
  not promoted to a drive.
- Fragment coalescing: seven `5e46a6de`-shaped fragments merge to one `HIGH`
  candidate; genuinely separate drives split by a real idle gap do **not** merge.
- Confidence: a 298 s segment with sustained movement reaches `MEDIUM`; a 298 s
  segment with no movement stays `LOW`.
- Source combination: with DIMO returning one segment and ClickHouse another
  that DIMO missed, both survive; DIMO still wins on overlap by rank.
- ICE + non-empty ignition candidates still evaluates motion.
- Regression fixtures replaying all four real missing windows from recorded
  `telemetry_state_changes`, asserting exactly one repaired trip per window with
  the reconstructed boundaries from §4.2.
- Idempotency: reconciling the same window twice yields one proposal, not two.
- Tenant scoping preserved on every new query path.
- Guard: a thrown Battery/energy/enrichment call cannot prevent trip-start
  evaluation (regression for the original trigger).

## 14. Production validation plan

1. Run the repaired detector in **dry-run** over the four known windows and
   confirm it proposes exactly the §4.2 boundaries.
2. Dry-run over the 90-day blast-radius set; compare proposals against the 49
   uncovered drives and review any proposal that is *not* in that set.
3. Shadow mode in production for one full fast/warm/cold cycle, writing
   `PROPOSED` rows only, and diff against current behaviour.
4. Enable application for `HIGH` only, monitor `repairActions` and
   `tripEvidencePaths`, then extend to `MEDIUM`.
5. Track the §11.8 coverage invariant before and after; expect uncovered time to
   fall toward zero for the affected vehicles.
6. Only then run the bounded historical backfill (R8), with a Stage-2-style
   rollback record.

## 15. Evidence gaps

- **DIMO MCP was unavailable** during this audit (`namespaceStatus: error`), so
  DIMO segment behaviour was inferred from persisted `dimo_segment_id` values in
  `vehicle_trips` and from `trip_repairs` reasons, not from a live API replay.
  Re-checking the four windows against the DIMO segments API would firm up the
  "DIMO produced no segment for token 187784" claim.
- **PM2 logs do not reach back to 2026-07-17**, so the ingestion abort is
  established from code plus the fleet-wide `V2_LIVE` gap and the 23-minute
  post-deploy recovery, not from the original stack traces.
- **`trip_repairs` under-records**: overlap-suppressed candidates are never
  written, so "no proposal existed" is a lower bound on what was considered.
- Blast radius uses **ignition only** and excludes >4 h segments; motion-only
  drives are not counted. The 42.7 h figure is a floor.
- Odometer and GPS displacement were not independently queried; movement is
  proven from speed, coolant and ignition/motion instead.

## 16. Confidence

- All five are real drives and no canonical trip covers them: **very high** (direct production data).
- First broken boundary is the ingestion abort: **high** (code ordering, the fix commit's own message, and a fleet-wide outage that ends 23 minutes after deploy).
- Per-candidate repair-path causes: **high** for `5e46a6de` (the rejected proposal rows are in the audit table) and for `79c4f647`/`d9197e1f` (the window arithmetic is unconditional); **medium-high** for `d6073d34`/`aba38e11` (rests partly on scan cadence inferred from proposal timestamps, which under-records).
- Blast radius magnitude: **medium**, direction and lower bound: **high**.

## 17. Overlap with the concurrent enrichment work

This audit concerns **canonical trip detection** — "did a `vehicle_trip` exist
for a real drive?" — not enrichment of existing trips. No file was modified.

Files the proposed fixes would touch, none of which are enrichment:

- `backend/src/modules/clickhouse/clickhouse-analytics.service.ts` (R1, R2, R4)
- `backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts` (R3, R6, R7)
- `backend/src/modules/vehicle-intelligence/trips/detectors/{ignition,motion}-segment.detector.ts` (R2)
- `backend/src/workers/schedulers/trip-reconciliation.scheduler.ts` (R5)

Likely enrichment-owned files to avoid: `trip-enrichment-orchestrator.service.ts`,
`trip-behavior-enrichment.service.ts`, `lte-r1-behavior-enrichment.service.ts`,
`trip-analysis-coordinator.service.ts`, `trip-analytics-canonical.service.ts`.

**One shared-file risk:** `trip-reconciliation.service.ts` calls
`enqueueRepairEnrichment`. If the enrichment work changes that contract, R3/R6/R7
will conflict there. Coordinate on that single function.

---

## 18. Per-candidate summary

### CANDIDATE `79c4f647-2085-4783-9a21-fde57c07c991`
- **VEHICLE:** `8c850ff1` — HMÜ C 215, VW Arteon, token 187784
- **OBSERVED_AT:** 2026-07-18 12:41:13 UTC
- **RPM:** 5543 (threshold 5000)
- **VEHICLE_ACTIVITY:** VEHICLE_MOVEMENT_PROVEN — 106–165 km/h, coolant 91 °C, ignition ON
- **EXPECTED_TRIP_WINDOW:** 11:58:55 → 13:45:46 (107 min, ignition; motion 11:59:04 → 13:23:26)
- **PREVIOUS_TRIP:** `1702244f` ended 11:55:53 (45.33 min before)
- **NEXT_TRIP:** `a16e75cd` started 13:25:53 (44.67 min after)
- **FIRST_BROKEN_BOUNDARY:** 2 — ingestion abort killed live detection; then 9 — no repair candidate could form
- **PRIMARY_ROOT_CAUSE:** J → A/G — 107-min drive cannot be paired inside a 45-min window
- **SECONDARY_FACTOR:** DIMO produced no segment for token 187784 (convoy partner got one ending 13:45:48); `startedBeforeRange` would drop it anyway
- **CURRENT_RECONCILIATION_BEHAVIOR:** still cannot detect it — no proposal has ever covered this event
- **FIX_DIRECTION:** R1 (bounded look-forward pairing), then R8 backfill
- **CONFIDENCE:** high

### CANDIDATE `d9197e1f-00cb-49a7-8ae7-52a6df1a0262`
- **VEHICLE:** `8c850ff1` — HMÜ C 215, VW Arteon, token 187784
- **OBSERVED_AT:** 2026-07-19 07:28:01 UTC
- **RPM:** 5013 (threshold 5000)
- **VEHICLE_ACTIVITY:** VEHICLE_MOVEMENT_PROVEN — 103 km/h sustained over 16 samples, coolant 93 °C
- **EXPECTED_TRIP_WINDOW:** 07:24:37 → 09:02:38 (98 min, ignition; motion 07:24:56 → 08:17:18)
- **PREVIOUS_TRIP:** `69e68bf1` ended 05:07:00 (141.02 min before)
- **NEXT_TRIP:** `1917b0f8` started 08:20:01 (52.00 min after)
- **FIRST_BROKEN_BOUNDARY:** 2, then 9
- **PRIMARY_ROOT_CAUSE:** J → A/G — 98-min drive, same structural impossibility
- **SECONDARY_FACTOR:** DIMO segment gap on token 187784 (partner had 07:23 → 08:32:46)
- **CURRENT_RECONCILIATION_BEHAVIOR:** still undetectable by the fast tier
- **FIX_DIRECTION:** R1, then R8
- **CONFIDENCE:** high

### CANDIDATE `5e46a6de-8714-45f2-abdd-97142e0709da`
- **VEHICLE:** `8c850ff1` — HMÜ C 215, VW Arteon, token 187784
- **OBSERVED_AT:** 2026-07-20 06:47:22 UTC
- **RPM:** 5575 (threshold 5000)
- **VEHICLE_ACTIVITY:** VEHICLE_MOVEMENT_PROVEN — 0–118 km/h over 24 samples, coolant 90 °C
- **EXPECTED_TRIP_WINDOW:** ~06:41:00 → 07:12:59 (uncertain boundaries — ignition flapping); reliable core 06:47:04 → 07:08:45 from motion
- **PREVIOUS_TRIP:** `0f91164c` ended 06:35:13 (12.15 min before)
- **NEXT_TRIP:** `caba83b7` started 07:13:11 (25.82 min after)
- **FIRST_BROKEN_BOUNDARY:** 2, then **10** — detection succeeded, persistence was refused
- **PRIMARY_ROOT_CAUSE:** H — the containing proposal was **298 s** against a **300 s** MEDIUM cutoff → `LOW` → never applied; re-proposed and re-dropped 4 times
- **SECONDARY_FACTOR:** E — a clean **HIGH** motion segment (1301 s) covering the event existed in the same window but was never queried, because ICE runs motion only when ignition yields nothing; plus ignition fragmentation into 7 sub-threshold pieces
- **CURRENT_RECONCILIATION_BEHAVIOR:** would still propose `LOW` and still drop it
- **FIX_DIRECTION:** R2 (coalesce fragments), R3 (evaluate motion too), R4 (movement-corroborated confidence)
- **CONFIDENCE:** very high — the rejected proposals are in `trip_repairs`

### CANDIDATE `d6073d34-6585-45c8-b00b-d16fb0d8e2be`
- **VEHICLE:** `19fedd4b` — WOB L 7503, VW Tiguan, token 192922
- **OBSERVED_AT:** 2026-07-20 06:50:27 UTC
- **RPM:** 5155 (threshold 5000)
- **VEHICLE_ACTIVITY:** VEHICLE_MOVEMENT_PROVEN — 72–92 km/h over 21 samples, coolant 95.5 °C, HIGH_THROTTLE + HIGH_ENGINE_LOAD
- **EXPECTED_TRIP_WINDOW:** 06:28:51 → 07:06:04 (37.2 min, ignition HIGH; motion 06:46:56 → 07:05:10 HIGH)
- **PREVIOUS_TRIP:** `6810cd87` ended 06:26:44 (23.72 min before)
- **NEXT_TRIP:** `ea8d1632` started 07:09:01 (18.57 min after)
- **FIRST_BROKEN_BOUNDARY:** 2, then 9
- **PRIMARY_ROOT_CAUSE:** G — the only detecting window was [07:06:04, 07:13:51], 7m47s wide against a 15-min tick; observed runs at 06:41:21 and 07:26:20 both missed it, and by 07:26 the lookback had truncated the 06:28:51 ignition-ON
- **SECONDARY_FACTOR:** no DIMO segment for token 192922 that morning
- **CURRENT_RECONCILIATION_BEHAVIOR:** still phase-dependent — would succeed or fail depending on tick alignment
- **FIX_DIRECTION:** R1 (removes phase dependence), R5 (coverage alert)
- **CONFIDENCE:** medium-high — scan cadence is inferred from proposal timestamps, which under-record

### CANDIDATE `aba38e11-d6f1-4c7a-a9c7-cba8779ed690`
- **VEHICLE:** `19fedd4b` — WOB L 7503, VW Tiguan, token 192922
- **OBSERVED_AT:** 2026-07-20 06:53:56 UTC
- **RPM:** 5887 (threshold 5000) — the highest of the five
- **VEHICLE_ACTIVITY:** VEHICLE_MOVEMENT_PROVEN — 77–105 km/h, coolant 95.3 °C; only 3 samples, hence `INSUFFICIENT_CONTEXT` at intake (a cadence verdict, not an activity verdict)
- **EXPECTED_TRIP_WINDOW:** 06:28:51 → 07:06:04 — the **same** drive as `d6073d34`
- **PREVIOUS_TRIP:** `6810cd87` ended 06:26:44 (27.20 min before)
- **NEXT_TRIP:** `ea8d1632` started 07:09:01 (15.08 min after)
- **FIRST_BROKEN_BOUNDARY:** 2, then 9
- **PRIMARY_ROOT_CAUSE:** G — identical to `d6073d34`; one missing trip accounts for both events
- **SECONDARY_FACTOR:** same DIMO segment gap; sparse signal cadence degraded intake context but did not affect detection
- **CURRENT_RECONCILIATION_BEHAVIOR:** same as `d6073d34`
- **FIX_DIRECTION:** R1, R5 — repairing the one drive resolves both candidates
- **CONFIDENCE:** medium-high

---

## 19. Production safety

Read-only throughout: `SELECT` against PostgreSQL, `SELECT` against ClickHouse,
PM2 log reads, and source inspection. No `INSERT`, `UPDATE`, `DELETE`, `UPSERT`,
no trip creation, no write-mode reconciliation, no DIMO trigger or threshold
change, no configuration change, no deploy, no restart, no queue mutation.

**PRODUCTION_MUTATIONS = NONE**
