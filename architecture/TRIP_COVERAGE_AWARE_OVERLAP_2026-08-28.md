# Containment-Aware Overlap Suppression + Repair Audit Ordering (PR A)

**Date:** 2026-08-28
**Scope:** overlap suppression semantics, repair audit ordering, rollout flag
**Predecessors:** `TRIP_DETECTION_GAP_FORENSIC_AUDIT_2026-08-28.md` (PR #1396),
`TRIP_DETECTION_HARDENING_DESIGN_2026-08-28.md` (PR #1398)

```
PRODUCTION_MUTATIONS      = NONE
BACKFILL_STARTED          = NO
COVERAGE_MODE_PRODUCTION  = SHADOW
SCHEMA_MIGRATION          = NONE
```

Nothing here was applied to production data. No trip was created, repaired,
split or cancelled; no scheduler cadence, DIMO trigger or RPM threshold was
changed; no deploy or restart was performed. Production access was `SELECT` and
`EXPLAIN` only.

---

## 1. What was wrong

`TripOverlapDetector` answered *"does any canonical trip touch this window,
within a ±5 minute tolerance?"*. That is a containment question answered with an
intersection test, and the two are not the same predicate.

A 98-minute drive whose only canonical representation is two short inner trips
totalling 29 minutes intersects, so it was suppressed as a duplicate — leaving 69
minutes of real driving unrepresented. The 90-day replay attributes **26 drives /
20.00 h** of uncovered driving to this defect as the *first* blocking stage, and
it masks every downstream detector improvement: a better pairing rule cannot be
observed while its output is discarded one stage later.

A second defect compounded it. Suppression `continue`d before the `trip_repairs`
insert, so the audit table recorded proposals that were accepted and nothing at
all about proposals that were withheld — the single most common outcome was the
one outcome with no diagnostic trace.

## 2. Coverage model

`detectors/trip-coverage.util.ts` is pure interval algebra, shared verbatim by
the detector and the offline replay harness so the two cannot drift.

For a proposal `P = [p_start, p_end]`:

1. take canonical trips intersecting `P` (CANCELLED excluded — a cancelled trip
   records that no trip happened, so it is not coverage);
2. clip each to `P`, so a trip's duration *outside* `P` is never credited;
3. union the clipped spans;
4. derive `proposal_duration_seconds`, `covered_seconds`, `coverage_ratio`,
   `missing_seconds`, `prefix_missing_seconds`, `suffix_missing_seconds`,
   `interior_missing_seconds`, `longest_uncovered_span_seconds`,
   `covering_trip_count`, and the uncovered spans themselves.

Verdicts:

| Verdict | Condition | Suppresses |
|---|---|---|
| `FULLY_COVERED` | `missing_seconds <= 60` | yes |
| `SUBSTANTIALLY_COVERED` | `coverage_ratio >= 0.90` **and** `longest_uncovered_span < 180 s` | yes |
| `PARTIALLY_COVERED` | otherwise, with some coverage | no |
| `NOT_COVERED` | `covered_seconds == 0` | no |
| `AMBIGUOUS` | an ONGOING trip intersects, or the canonical set was truncated | yes |

`AMBIGUOUS` suppresses deliberately. An ONGOING trip's `end_time` is a moving
cursor, so neither "covered" nor "uncovered" can be asserted about the time it
will eventually claim; waiting is correct, creating a second trip over the same
time is not.

### Thresholds are measured, not chosen

Derived from the 1455 distinct repair candidates in the 90-day replay. The
coverage-ratio distribution of candidates the legacy detector suppressed is
sharply bimodal: 1143 sit at `>= 0.99` with zero uncovered driving (genuine
duplicates), 135 sit below 0.50 of which 97 contain uncovered driving, and only
26 fall in the 0.75–0.90 valley.

- `SUBSTANTIAL_COVERAGE_RATIO = 0.90` — with the span guard applied, no
  candidate carrying five or more minutes of uncovered driving is suppressed.
- `MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS = 180` — equal to `TRIP_MID_GAP_SPLIT_MS`.
  A silence this long is exactly what the live path treats as a trip boundary,
  so calling it "already covered" would contradict the detector. It rescues 6
  candidates from `DUPLICATE`, 5 of which contain real uncovered driving.
- `FULL_COVERAGE_SLACK_SECONDS = 60` — sub-minute residue is measurement noise.
- `MIN_REPAIR_SPAN_SECONDS = 300` — applies **only** to spans carved out of a
  partially covered proposal. It is not a minimum trip duration: a proposal that
  canonical trips do not cover at all is returned whole however short, because
  applying the floor there would make coverage suppress candidates that binary
  overlap accepts. RPM sentinel `5e46a6de` is a 4 min 58 s fully uncovered drive
  and is the reason this distinction is explicit.

### The safety invariant

Containment-aware suppression must be a *relaxation* of binary overlap, never a
tightening. The replay checks this rather than asserting it: across all 10071
candidates the current collector produces over the 90-day window, 470 are
accepted by binary overlap and **0** of those are blocked by coverage.

## 3. Audit ordering

`TripReconciliationService.detectAndRepairMissingTrips` now writes the
`trip_repairs` row for every evaluated proposal *before* acting on the
suppression decision. A withheld proposal is recorded with the new
`SUPPRESSED` status and carries, in existing columns plus the existing
`detector_evidence` JSON payload:

- proposal interval (`window_from` / `window_to`) and the originating candidate
  window when the row is a clipped sub-span;
- evidence source and detector;
- intersecting canonical trip ids;
- the full coverage metric set;
- `legacyVerdict`, `coverageVerdict`, `effectiveDecision`, `decisionSource`,
  `agreement`, `ambiguousReason`, `canonicalSetTruncated`;
- suppression reason, confidence, timestamp.

**No migration.** `trip_repairs.status` is a free-form `String` column, not a
database enum; only the Prisma schema comment was extended. `detector_evidence`
is already `Json?`.

Repair audit rows now use a deterministic id — `sha256(vehicleId | repairType |
windowFrom | windowTo)` rendered as a UUID — so the same drive re-evaluated by
the fast, warm and cold tiers updates one row instead of appending a tick log.
Measured re-evaluation factor on the replay dataset: **6.9 updates per insert**.
An `APPLIED` row is never rewritten by a later evaluation; a lost insert race
falls through to the existing row rather than failing the run.

## 4. Rollout flag

`TRIP_REPAIR_COVERAGE_MODE`, read via `worker.tripRepairCoverageMode`.

| Mode | Decides | Coverage computed | Trip persistence |
|---|---|---|---|
| `legacy` | binary overlap | yes, audit only | unchanged |
| `shadow` **(default)** | binary overlap | yes, audit only | unchanged |
| `enforce` | coverage verdict | yes | clipped to uncovered spans |

Anything other than `legacy` or `enforce` normalises to `shadow`, so a typo
cannot silently enable enforcement. In `enforce`, an accepted proposal is
persisted as its *repairable spans* rather than the whole envelope, so a
partially covered drive is never written on top of the trips that already cover
it. A clipped span inherits no boundary coordinates, DIMO segment id or distance
from the envelope, because those describe the envelope's edges and not the
span's.

## 5. Replay evidence (same 90-day dataset, 5 scheduler phase offsets)

Ground truth: 405 evidence-backed drives, 65 with `>= 5 min` uncovered,
**63.72 h** uncovered across 6 vehicles.

| Mode | Trips created | Drives recovered | Fully recovered | Recovered h | Residual h |
|---|---|---|---|---|---|
| baseline (today) | 5 | 1 | 1 | 0.30 | 63.42 |
| coverage_only (PR A alone) | 139 | 51 | 43 | **46.77** | 16.95 |
| no_suppression (control) | 4805 | 57 | 52 | 48.25 | 15.47 |
| proposed (PR A + B + C) | 125 | 59 | 55 | 59.87 | 3.85 |

Output quality at phase 0:

| Mode | False positives | False merges | Overlaps a real trip | Touches healthy drives |
|---|---|---|---|---|
| baseline | 3 | 2 | 0 | 0 |
| coverage_only | 15 | 23 | **0** | 2 |
| no_suppression | 108 | 242 | 4601 | 3227 |
| proposed | **0** | **0** | **0** | **0** |

`no_suppression` is the attribution control: today's candidates with suppression
removed entirely. It is what proves the false positives and false merges that
appear in `coverage_only` originate in the untouched pairing and confidence
stages rather than in the coverage rule — removing suppression makes them
7× and 10× worse. Containment-aware overlap does not create them; it stops
binary overlap from hiding them. **This is why `enforce` must not be enabled
until PR B (pairing) and PR C (confidence) land.**

Phase variance across offsets 0/3/6/9/12 min: `coverage_only` recovers
46.38–46.77 h (spread 0.39 h), `proposed` 59.71–59.87 h (spread 0.16 h).

### Zero-duration canonical rows

Three `coverage_only` proposals contain a canonical row with
`start_time == end_time`. All five such rows in the dataset are
`MID_TRIP_GAP_SPLIT` artifacts from the 2026-07-20 live-detection outage. They
claim no driving time, so containing one double-represents nothing and the
coverage model correctly credits them with zero. Cleaning them up is a separate
data-quality item, not a coverage defect.

### RPM sentinels

| Sentinel | baseline | coverage_only | proposed |
|---|---|---|---|
| 79c4f647 (5543 rpm) | missed | recovered | recovered |
| d9197e1f (5013 rpm) | missed | recovered | recovered |
| 5e46a6de (5575 rpm) | missed | missed | recovered |
| d6073d34 (5155 rpm) | missed | recovered | recovered |
| aba38e11 (5887 rpm) | missed | recovered | recovered |

PR A alone recovers four of five and regresses none. `5e46a6de` needs the
confidence rework: legacy pairing produces a 4 min 58 s candidate for it and
scores it `LOW` on duration alone, so it is rejected after coverage has already
accepted it. That is PR C's blocker, not this one's.

## 6. Performance

Measured on production (9 vehicles, 1897 trips, 9506 repair rows), `EXPLAIN
(ANALYZE, BUFFERS)`, read-only.

Query shape — unchanged from the legacy predicate except `LIMIT 1` becomes
`LIMIT 201`:

```sql
SELECT id, start_time, end_time, trip_status
FROM vehicle_trips
WHERE vehicle_id = $1
  AND ( (end_time IS NOT NULL AND end_time >= $windowStart AND start_time <= $windowEnd)
     OR (end_time IS NULL     AND start_time <= $windowEnd  AND start_time >= $windowStart) )
LIMIT 201;
```

- **Indexes.** `vehicle_trips_vehicle_id_start_time_idx` (composite) and
  `vehicle_trips_vehicle_id_idx` already exist; no new index is required.
- **No `ORDER BY`.** Ordering the query gives the planner a reason to walk
  `vehicle_trips_start_time_idx`, which is not selective on `vehicle_id`: that
  plan reads **1249 buffers / 8.6 ms** against **405 buffers / 1.9 ms** for the
  vehicle-scoped plan. The result set is bounded by `LIMIT`, so it is sorted in
  memory instead — which also makes ordering deterministic whichever plan the
  database picks.
- **Canonical intervals per proposal.** Measured over every trip window in
  production: avg 5.48, p95 12, p99 15, max 18 — against a hard cap of
  `MAX_CANONICAL_INTERVALS = 200`. Exceeding the cap yields `AMBIGUOUS`
  (`CANONICAL_SET_TRUNCATED`) rather than a coverage figure computed from a
  partial set.
- **Complexity.** `O(k log k)` for k intervals, k ≤ 200 — one sort, one linear
  union, one linear subtraction. Memory is bounded at 200 intervals × 4 fields
  per proposal, released per candidate.
- **Scale.** The query is vehicle-scoped and bounded by the per-vehicle trip
  count, not by fleet size, so 1000+ vehicles do not change its cost. There is
  no fleet-wide scan in any request path; the detector runs only inside the
  reconciliation worker. The one known ceiling is that the index range
  `vehicle_id = $1 AND start_time <= $hi` is unbounded below, so it scans a
  vehicle's whole history before the window — 994 rows for the busiest vehicle
  today. That is a pre-existing property of the legacy query, unchanged here;
  bounding it with `start_time >= windowStart - MAX_TRIP_DURATION` would alter
  which trips count as coverage and belongs in its own change.
- **Scheduler impact.** Audit-first ordering adds one `findUnique` plus one
  `create`-or-`update` per evaluated candidate. Replay-measured: 14.0
  evaluations per vehicle per day, 2.02 new audit rows per vehicle per day,
  6.9 updates per insert. Projected at 1000 vehicles: **~13 988 evaluations/day
  (~0.16/s) and ~2021 new rows/day**.

## 7. Tests

`detectors/trip-coverage.util.spec.ts`, `detectors/trip-overlap.detector.spec.ts`,
`detectors/trip-coverage.rpm-sentinels.spec.ts`,
`reconciliation/trip-repair-coverage-audit.spec.ts` — 55 cases covering the
18-row matrix from the design, the mode behaviours, audit ordering, idempotency
and the five sentinel windows as production-geometry fixtures.

## 8. Files

| File | Change |
|---|---|
| `detectors/trip-coverage.util.ts` | new — interval algebra, metrics, verdicts, thresholds |
| `detectors/trip-overlap.detector.ts` | binary overlap → coverage-aware, mode-gated, full evidence |
| `detectors/index.ts` | export the coverage utility |
| `reconciliation/trip-reconciliation.service.ts` | audit-first ordering, deterministic audit id, enforce-mode span clipping |
| `reconciliation/reconciliation.types.ts` | `REPAIR_STATUS.SUPPRESSED` |
| `config/worker.config.ts` | `tripRepairCoverageMode` + `normalizeCoverageMode` |
| `prisma/schema.prisma` | comment only — documents `SUPPRESSED` |
| `scripts/analysis/trip-detection-replay/*` | harness uses the shipped utility; `coverage_only` and `no_suppression` modes; invariant and write-volume checks |

## 9. Rollout

1. Merge with `TRIP_REPAIR_COVERAGE_MODE` unset (→ `shadow`). Production
   decisions are byte-identical to today.
2. Observe `detector_evidence.overlapDecision.agreement` on `trip_repairs`.
   `COVERAGE_WOULD_ACCEPT` counts the drives binary overlap is discarding;
   `COVERAGE_WOULD_SUPPRESS` must stay at zero, since a non-zero value would
   contradict the replay-verified invariant.
3. **Do not enable `enforce`** until PR B (pairing) and PR C (confidence) land.
   `coverage_only` shows enforcement alone would persist 15 false positives and
   23 false merges from the untouched upstream stages.

Rollback: set `TRIP_REPAIR_COVERAGE_MODE=legacy` and restart the worker — no
deploy, no data change. `SUPPRESSED` audit rows remain valid diagnostics.
