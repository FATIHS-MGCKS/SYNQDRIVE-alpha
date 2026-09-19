# EXP-021 multi-vehicle cohort authority (2026-09-18)

## Before (single-token)

- Live-window activation and maturation canary operator assumed **KS MX 2024** only (`tokenId` 187336).
- Hard guards: allowlist length 1, `maxActiveFamilies === 1`, global unfinished-family cap.

## After (explicit cohort)

- **Configuration:** `EXP021_CANARY_LIVE_WINDOW_COHORT_JSON` — JSON array of `{ organizationId, vehicleId, tokenId, label? }`.
- **Maturation operator:** `EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON` or fallback to live-window cohort env.
- **Fail-closed:** missing/invalid/empty cohort → no live-window arms; maturation guards reject enrollment.
- **Authority predicate:** trip `vehicleId` ∈ cohort **and** resolved DIMO `tokenId` matches the same member **and** org matches **and** trip start ≥ `NOT_BEFORE`.
- **Forensic preservation:** `vehicleTripId` `a72fb179-3fca-42a1-bdc1-3461cbcade44` excluded from arm/finalize (no backfill).
- **PDI (PR #1692 unchanged):** `CANARY_VEHICLE_TRIP_CONFIRMED` from canonical COMPLETED `vehicle_trips`; no cross-vehicle adoption.
- **Concurrency:** per-`vehicle_trip_id` ledger/study run/RC session; per-vehicle blocking RC sessions; multi-replica claim convergence unchanged.
- **Fourth vehicle:** append one object to cohort JSON; set maturation allowlist + `maxActiveFamilies` to new size (no semantic code change).

## Maturation operator

- `assertCanaryHardGuards` resolves member by `--token-id` within cohort; unfinished cap is **per vehicle** (`countUnfinishedFamiliesForVehicle`).
- `runCohortMaturationWatchIteration` runs one wait/enroll iteration per member with isolated failures (`reference-capture-exp021-maturation-shadow-canary-cohort-operator.lib.ts`).
- CLI: existing `--token-id` per vehicle; cohort env required. Optional future `--watch-cohort` loop uses the cohort operator lib.

## VDC 7-day shadow coexistence (read-only audit)

| Resource | EXP-021 | VDC shadow | Interaction |
|----------|---------|------------|-------------|
| `vehicle_trips` / Trip FSM | READ for eligibility | READ (observation) | READ/READ — no FSM writes from either in this slice |
| `exp021_canary_live_window_activation_ledger` | WRITE (canary) | none | EXP-021 only |
| `exp021_maturation_shadow_*` | WRITE (M2 operator) | none | EXP-021 only |
| VDC shadow tables / queues | none | WRITE (shadow) | VDC only |
| `reference_capture_session` | WRITE (canary arm/finalize) | possible READ | READ/WRITE — different session lifecycle owners; no shared session IDs by design |
| Redis / BullMQ job names | RC + EXP021 namespaces | VDC shadow namespaces | Separate queue names — no identity collision identified |
| Scheduler leader lock | `reference_capture_exp021_canary_live_window_activation` | VDC uses distinct schedulers | Separate lock keys |
| DIMO provider budget | RC/maturation workers | VDC observation | READ/WRITE provider calls — **operational rate contention possible**; not mutating authority |

**EXP021_VDC_SHARED_MUTATING_AUTHORITY=NO** (neither mutates the other's decision tables).

**SAFE_FOR_EXP021_AND_VDC_PARALLEL_RUN=YES** with monitoring of DIMO rate limits.

## Activation / deploy sequence (future task)

1. Deploy cohort PR with activation **still false**.
2. Set cohort JSON + maturation allowlist + `maxActiveFamilies` = cohort size on VPS.
3. Set new `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO`.
4. Enable activation only after review.
5. Start **one** cohort-capable maturation operator (not in this PR).
