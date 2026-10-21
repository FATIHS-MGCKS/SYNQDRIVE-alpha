# Event → Trip Association Contract (Stage 1)

Date: 2026-08-28
Status: implemented (Stage 1) — Stage 2 historical repair still pending
Scope: `backend/src/modules/vehicle-intelligence/trips/event-association/`

---

## 1. Why this exists

Telemetry-triggered events (today: DIMO high-RPM webhook candidates) carry a
`trip_id` linking them to the trip during which they occurred. That link is the
foundation of the `Event → Trip → Driver` chain that near-live driver scoring
will be built on.

A production forensic audit of candidate `941382ca` (vehicle KS MX 2024, RPM
5213 at `2026-08-28T11:58:11Z`) found `trip_id = NULL` even though trip
`61715ecd` was ONGOING and the vehicle was demonstrably driving. Blast radius at
the time of the audit: 10 of 12 RPM candidates had a NULL `trip_id`, and stale
CANCELLED trips could win selection and produce a *wrong* link.

### Root cause — `end_time` means two different things

`vehicle_trips.end_time` has two distinct semantics depending on trip state:

| Trip state | Meaning of `end_time` | Safe as an upper bound? |
|------------|----------------------|-------------------------|
| `ONGOING` | **Rolling activity cursor.** `TripDetectionOrchestrationService` rewrites `end_time = now` on every ACTIVE_TRACKING tick (~30s). It always trails real time. | **No** |
| `COMPLETED` | **Canonical finalized boundary** written once by `TripDecisionEngine.finalizeTrip()`. | Yes |
| `CANCELLED` | Undefined; frequently `NULL` on discarded rows. | Never eligible |

The previous resolver applied a single predicate to all three:

```
start_time <= observed_at AND (end_time IS NULL OR end_time >= observed_at)
ORDER BY start_time DESC LIMIT 1
```

Against the ONGOING trip that evaluated as:

```
11:29:08 <= 11:58:11   PASS
11:58:02 >= 11:58:11   FAIL   <- rolling cursor, 9s stale
```

so the event was excluded from its own trip. The next tick landed at ~11:58:32.
Any event arriving in the ~30s window between two ticks was orphaned, and
nothing revisited it after finalization.

The same predicate also let a stale `CANCELLED` row with `end_time IS NULL` and
a later `start_time` outrank the real trip under `ORDER BY start_time DESC`.

### Explicitly rejected fix

A tolerance such as `end_time + 30s` was **rejected**. The defect is semantic,
not numeric: a tolerance hides the race and couples correctness to the polling
cadence. Change the tick interval and the bug returns.

---

## 2. Association contract

> If an event logically occurred during a uniquely identifiable vehicle trip,
> `event.trip_id` must eventually converge to that canonical trip.
> Temporary ingestion ordering must never create a permanent orphan.

The system is **eventually consistent**. `trip_id = NULL` is a valid transient
state, never a terminal one. A safe `NULL` is always preferred over a wrong FK.

---

## 3. Resolver precedence

Implemented in `event-trip-association.domain.ts` as a pure function. The first
tier that yields **exactly one** trip wins.

| # | Reason code | Rule |
|---|-------------|------|
| 0 | — | `CANCELLED` trips are filtered out before any tier runs |
| 1 | `ACTIVE_TRIP_MATCH` | `vehicle_trip_detection_states.active_trip_id` resolves to an `ONGOING` trip with `start_time <= observed_at` |
| 2 | `ONGOING_TRIP_MATCH` | Exactly one `ONGOING` trip with `start_time <= observed_at`; **upper boundary is OPEN** |
| 3 | `FINALIZED_WINDOW_MATCH` | Exactly one `COMPLETED` trip with `start_time <= observed_at <= end_time` |

Non-matching outcomes:

| Reason code | Meaning |
|-------------|---------|
| `NO_TRIP_YET` | No eligible trip exists for this vehicle/timestamp |
| `AMBIGUOUS_TRIPS` | A tier produced more than one plausible trip and nothing disambiguated it |
| `CANCELLED_EXCLUDED` | The only temporal match was a `CANCELLED` trip |

Additional rules:

- An `ONGOING` trip is **never** rejected because its rolling `end_time` is
  behind `observed_at`. That is the Aug-28 fix.
- A dangling `active_trip_id` (trip deleted, or no longer `ONGOING`) is ignored
  and resolution falls through to tiers 2 and 3.
- `cancelledExcluded` is reported as a diagnostic even when a later tier
  succeeds, so wrong-association pressure stays observable.
- Ambiguity returns `tripId: null` plus the plausible ids. The resolver never
  picks one arbitrarily.

---

## 4. Reconciliation lifecycle

Three convergence paths, all owned by `EventTripAssociationService`.

| Path | Trigger | Entry point | Reason on success |
|------|---------|-------------|-------------------|
| Intake | Webhook persistence | `RpmWebhookCandidateService.ingestRpmThresholdEvent` → `resolveForEvent` | resolver tier code |
| Finalization | Trip becomes `COMPLETED` | `TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion` → `reconcileFinalizedTrip` | `RECONCILED_ON_FINALIZATION` |
| Delayed sweep | Tiered trip reconciliation | `TripReconciliationService.reconcileWindow` step 6 → `reconcileUnresolvedWindow` | `RECONCILED_DELAYED` |

### Finalization hook (primary mechanism)

`TripPostFinalizeAnalysisProducer` was chosen because it is already the single
awaited hook covering **every** persisted `COMPLETED` transition: live finalize
(`LIVE_FINALIZE`), live mid-gap split segment 1 (`MID_GAP_SPLIT`), and all
reconciliation repairs (`REPAIR_FINALIZE`). No new lifecycle hook was
introduced.

It runs before analysis init so downstream stages observe the converged link,
and is wrapped in its own try/catch — an association failure can never block
trip finalization or analysis.

Scan predicate:

```
vehicle_id = finalizedTrip.vehicle_id
AND observed_at BETWEEN finalizedTrip.start_time AND finalizedTrip.end_time
AND trip_id IS NULL
```

Each scanned candidate is then re-run through the full resolver, and written
only if the resolver independently returns *this* trip. A blanket `updateMany`
was deliberately avoided so overlapping trips cannot silently produce a wrong
link during backfill.

### Delayed sweep (safety net)

Reuses the existing `TripReconciliationService` tiered infrastructure rather
than adding a subsystem, because it already provides exactly the required
properties: per-vehicle scoping, an explicit time window, and tiered cadence
(fast 15 min / 45 min window, warm 4 h / 12 h, cold daily / 7 d). It runs as
step 6, after steps 1–4, so it observes trips repaired earlier in the same pass.

It covers what the other two paths structurally cannot:

- the event was persisted **before** its trip row existed
- the finalization hook failed transiently
- the association service was unavailable at intake

Candidates younger than **60 s** are skipped so a sweep can never race an
in-flight webhook transaction. There is no global cron and no full-table scan.

---

## 5. Idempotency guarantees

- `trip_id IS NULL` appears in **both** the scan filter and the `updateMany`
  predicate. A repeated run finds nothing to do and performs zero writes.
- A non-null `trip_id` is **never** overwritten by any runtime path.
- The write predicate also guards against a concurrent write from another path
  (finalization and sweep can overlap): the loser's `updateMany` returns
  `count: 0` and is not counted as an association.
- Reconciliation only ever updates `trip_id` on an existing row. It never
  creates candidates and never triggers enrichment.

---

## 6. Context enrichment interaction

Context enrichment is keyed on `candidateId` + `observedAt` + `tokenId` and
writes `context_assessment_json` on the same row. It has no dependency on
`trip_id` and already succeeds while `trip_id` is NULL — that behaviour is
preserved unchanged.

**Re-enrichment after late resolution is not required.** No downstream
materialization is keyed on `candidate.trip_id`:

- `RpmWebhookQueryService.getTripCandidates` selects by
  `vehicle_id + observed_at` within the trip window, not by `trip_id`
- `DataAnalyseService` exposes candidates read-only for diagnostics
- driving-analysis stages key on `tripId` from `vehicle_trips`, not on candidates

Reconciliation therefore performs a single column update with no side effects.

**Stage 2 follow-up:** once historical `trip_id` values are repaired,
`getTripCandidates` should switch from the time-window join to a direct
`trip_id` filter. Doing that now would regress the UI, since 83% of historical
candidates still hold a NULL `trip_id`.

---

## 7. Driver-score readiness

Near-live driver scoring depends on `Event → Trip → Driver`. Stage 1 hardens the
first hop so a score can never be computed from an event permanently attached to
the wrong trip because of:

- rolling `end_time` timing (fixed by open-upper-bound ONGOING semantics)
- trip-creation races (fixed by delayed sweep convergence)
- stale `CANCELLED` trips (fixed by unconditional exclusion)
- temporary intake ordering (fixed by post-finalization reconciliation)

Ambiguous events stay unresolved and are therefore excluded from scoring rather
than contributing to the wrong driver. No driver-score product behaviour was
added in this stage.

---

## 8. Indexes and scaling

Reconciliation access pattern:

```sql
SELECT id, observed_at FROM rpm_webhook_candidates
WHERE vehicle_id = $1 AND observed_at BETWEEN $2 AND $3 AND trip_id IS NULL
ORDER BY observed_at ASC LIMIT 200;
```

Added: `rpm_webhook_candidates(vehicle_id, observed_at)`
(migration `20260828120000_rpm_candidate_event_trip_reconciliation_index`).

The pre-existing single-column `vehicle_id` index forced the vehicle's entire
candidate history to be read before the time filter applied — cost growing with
retention. The composite turns it into an index range scan bounded by the
reconciliation window, with `trip_id IS NULL` as a cheap filter over that range.

The resolver's own query is
`vehicle_id = $1 AND start_time <= $2 ORDER BY start_time DESC LIMIT 10`, already
served by the existing `vehicle_trips(vehicle_id, start_time)` composite. The
detection-state lookup uses the existing unique key on `vehicle_id`. No further
indexes were added.

### Scaling characteristics

Cost is driven by **window size and event density**, not fleet size — every
query is scoped to a single `vehicle_id`.

| Fleet | Finalization hook | Fast tier (15 min, 45 min window) |
|-------|-------------------|-----------------------------------|
| 10 vehicles | 1 indexed range scan per trip completion | ≤ 10 scans per tick |
| 100 vehicles | unchanged per trip | ≤ 100 scans per tick |
| 1000+ vehicles | unchanged per trip | ≤ 1000 scans per tick, spread across the interval |

Per-scan work is independent of fleet size and of history length. In the
overwhelmingly common case the scan returns zero rows and the call performs a
single index probe and no writes. The per-candidate resolver loop only executes
for rows that are actually unresolved, and is capped at 200 candidates per call.

---

## 9. Observability

Metric `synqdrive_event_trip_associations_total`, labels `stage` ∈
`{intake, finalization, delayed}` and `reason` ∈ the reason codes in §3–§4.
Both labels are low cardinality.

Structured log line `EVENT_TRIP_ASSOCIATION` is emitted:

- at intake only when resolution did **not** succeed and the reason is not the
  routine `NO_TRIP_YET` — so normal traffic is not spammed
- from reconciliation only when something was associated or found ambiguous

No secrets, tokens or raw payloads are logged.

---

## 10. Stage 2 — pending

Stage 1 changes **runtime** behaviour only. No historical production data was
modified. A read-only repair report for the 12 existing RPM candidates is at
`architecture/EVENT_TRIP_ASSOCIATION_STAGE2_REPAIR_REPORT_2026-08-28.md`.
Controlled historical repair is a separate, explicitly authorized task.

---

## 11. Files

| File | Role |
|------|------|
| `trips/event-association/event-trip-association.types.ts` | Reason codes and contract types |
| `trips/event-association/event-trip-association.domain.ts` | Pure precedence/ambiguity resolver |
| `trips/event-association/event-trip-association.service.ts` | Prisma-backed resolve + reconcile |
| `trips/event-association/event-trip-association.module.ts` | Dependency-free DI module shared by DIMO and vehicle-intelligence |
| `trips/event-association/event-trip-association.spec.ts` | Regression matrix A–J |
| `dimo/rpm-webhook-candidate.service.ts` | Intake delegates to the canonical resolver |
| `dimo/rpm-candidate-trip-association.regression.spec.ts` | End-to-end intake regression for the Aug-28 case |
| `driving-analysis-init/trip-post-finalize-analysis.producer.ts` | Post-finalization reconciliation hook |
| `trips/reconciliation/trip-reconciliation.service.ts` | Delayed sweep (step 6) |
| `observability/trip-metrics.service.ts` | Association metric |
