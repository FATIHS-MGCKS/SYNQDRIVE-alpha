# ERD E5.4B — Canonical stored-energy alignment (Step 2)

**Status:** IMPLEMENTED (canonical projection only; **no** `chargingEnergyAddedKwh` product field)  
**Starting main:** `8ce2ee8e1313bc39dd7bc1e866b1da75ba5e9201` (includes merged Step 1 PR #1803)  
**Evidence ID:** EED-EV-0094  
**Decision:** EED-DEC-ERD-003 remains **PROPOSED** (Option C partial — stored-energy alignment only)

## Problem

Legacy RECHARGE VEE `energyDeltaKwh` uses `NormalizedDimoRechargeSegment.currentEnergyKwh` extrema delta (stored traction battery). Canonical projection pre-fix mapped `HvChargeSession.energyAddedKwh` (charging-added signal), causing shadow `DIFFERENT_DIMO_SIGNAL_SEMANTICS` (~15.6 kWh gap on six audited Production sessions).

## Pre / post

| | Source |
|---|--------|
| Legacy | `currentEnergyKwh.delta` via extrema |
| Canonical pre-fix | `energyAddedKwh` |
| Canonical post-fix | `deriveStoredTractionEnergyDeltaKwh(startEnergyKwh, endEnergyKwh)` |

Formula: `null` if start/end missing/non-finite; else `max(0, end - start)`. **No** `energyAddedKwh` fallback.

## Implementation

- `erd-recharge-energy-semantics.policy.ts` — pure helper + semantic constants
- `erd-recharge-projection-mapper.ts` — maps stored delta; `rawDetectionMeta.energyDeltaSemantic=STORED_TRACTION_BATTERY_ENERGY_DELTA`
- `ERD_RECHARGE_PROJECTION_META_VERSION` **1 → 2** (identity `v1` / `erd:physical:v1:` unchanged)

## Tests

| ID | Coverage |
|----|----------|
| E1, F1–F2, H1–H7 | Unit mapper + helper specs |
| PG-E1–PG-E4 | `erd-e5-2-recharge-projector.postgres.integration.spec.ts` |
| Shadow stored-energy | `erd-recharge-shadow-stored-energy-alignment.spec.ts` |
| Step 1 topology | Full `erd-recharge-shadow*` regression (unchanged comparator v2) |

## Explicit non-goals

- No Prisma migration / new VEE columns
- No `chargingEnergyAddedKwh` API field (Step 5)
- No legacy mapper changes
- No Shadow Parity enablement / Production mutation

## Governance

- `STEP_2_STORED_ENERGY_ALIGNMENT_IMPLEMENTED=YES`
- EED-DEC-ERD-002 remains VALIDATED (topology unchanged)
