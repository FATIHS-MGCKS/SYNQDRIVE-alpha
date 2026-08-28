# E1 — Energy Event Detection Restoration (2026-08-27)

**Audit baseline:** `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md`  
**Regression commit:** `79e381069` (2026-07-16) — invalid recharge GraphQL query

## Root cause

`DimoRechargeSegmentsClient` queried `segments(mechanism: recharge)` with fields/args unsupported by the live DIMO Telemetry schema:

- `id` on `Segment` selection
- `limit` and `after` pagination arguments
- `agg` in `signals` selection

Every recharge fetch returned **HTTP 422**. Because `fetchEnergyEventSegments` coupled both mechanisms in one loop and the recharge client **rethrew** non-retryable errors, already-fetched refuel segments were discarded. `EnergyEventsService` caught the error and persisted nothing — fleet-wide REFUEL + RECHARGE outage since 2026-07-17.

## Failure coupling (fixed)

`DimoSegmentsService.fetchEnergyEventSegments` now returns per-mechanism outcomes:

- `SUCCESS_WITH_EVENTS`
- `SUCCESS_EMPTY`
- `FAILED`

A recharge failure no longer prevents refuel persistence (and vice versa).

## Prune hazard (fixed)

`pruneStaleSubSegments` previously deleted rows merely because they were absent from the current detector response. E1 invariants:

1. Never prune when any mechanism fetch failed
2. Never prune on absence from detector response alone
3. Only delete rows whose `dimoSegmentId` is explicitly listed in `coalescedFromSegmentIds` of a **multi-sub-segment** coalesced event persisted in this run

Prune predicate: `dimoSegmentId ∈ replacedSubSegmentIds` where `replacedSubSegmentIds` = ⋃ (`coalescedFromSegmentIds \ {coalescedSegmentId}`) for each persisted coalesced group with `coalescedFromSegmentIds.length > 1`, scoped to `(vehicleId, startTime ∈ [from, to])`.

## Recharge query repair

`buildDimoRechargeSegmentsQuery` now mirrors `buildEnergyEventSegmentsQuery`:

- Time-window bounded (`from` / `to`)
- No `id`, `limit`, `after`
- `signals { name value }` only
- 31-day window splitting retained

## Tests added

| File | Coverage |
|------|----------|
| `validate-dimo-segments-query.spec.ts` | Schema fixture validation; rejects 79e381069 regression shape |
| `dimo-segments.energy-events.spec.ts` | Mechanism isolation, retry classification |
| `energy-events.service.spec.ts` | Partial failure persistence, prune safety, idempotency |
| `dimo-recharge-segments.client.spec.ts` | Updated query shape, FAILED status on 422 |
| `ks-mx-2024-refuel.fixture.ts` | E2 reference case (default config misses refuel) |

## Live DIMO validation (2026-08-27)

Script: `backend/scripts/ops/validate-energy-event-dimo-queries.ts`

Tokens `187336` (KS MX 2024) and `186946` (KS FH 660E), window 2026-08-20 → 2026-08-27:

| tokenId | mechanism | httpStatus | segmentCount |
|---------|-----------|------------|--------------|
| 187336 | refuel | 200 | 0 |
| 187336 | recharge | 200 | 0 |
| 186946 | refuel | 200 | 0 |
| 186946 | recharge | 200 | 0 |

No HTTP 422. Refuel and recharge queries execute independently.

**Note:** KS MX 2024 refuel on 2026-08-23 still requires E2 `minIncreasePercent` tuning — default DIMO config returns `[]` even with a working transport path.

## Out of scope (E1)

- E2 detector sensitivity (`minIncreasePercent`, etc.)
- Fleet scalability
- Outage backfill (16 Jul → present)
- Full candidate/superseded lifecycle
