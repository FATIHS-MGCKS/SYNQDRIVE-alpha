# Tire Wear V3 — P3A distance prior (shadow)

| Field | Value |
|-------|--------|
| Model version | `tire-wear-v3-prior-0.1.0` (correctness pass: mount-period scope, full-precision math, stable fingerprint) |
| Dynamic β (DS4) | `0` (fixed in P3A) |
| Productive consumer | **none** — shadow table `tire_wear_v3_prior_shadow_v1` |
| Write gate | `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` default `false` |
| V2 impact | **none** (`tire-wear-v2` unchanged) |

## Scope

P3A implements a conservative, deterministic distance prior per `VehicleTireSetup` and wheel position (`FL`–`RR`):

- Wear-rate interval from life-table / explicit `expectedLifeKm` priors (`tire-health.config.ts`)
- Tread and remaining-km intervals with explicit separation of measurement vs model uncertainty
- Evidence levels `L0`–`L4` / `UNRATED` (single measurement → `L1`, no rate calibration)
- Minimum 3σ odometer spacing reference: **6800 km** at σ_m=0.2 mm, r≈0.125 mm/1000 km
- Ledger distance from `tire_trip_usage_ledger` where `invalidated_at IS NULL`

## Code map

| Path | Role |
|------|------|
| `backend/src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.math.ts` | Pure prior / calibration math |
| `backend/src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.service.ts` | Setup orchestration |
| `backend/src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.module.ts` | Nest module (exported service only) |
| `backend/prisma/migrations/20261025090000_tire_wear_v3_prior_shadow_v1/` | Additive shadow DDL |

## Isolation proof

`wear-v3-prior/tire-wear-v3-prior-productive-isolation.spec.ts` asserts productive tire health / rental paths do not import V3 prior symbols. DS4 shadow isolation spec remains separate.

## Example (50 km, SUMMER prior)

`h0=8.0 mm`, `h_min=3.0 mm`, `L∈[35000,45000] km` → `r∈[0.111,0.143] mm/1000 km`.  
50 km loss interval ≈ **[0.0056, 0.0071] mm** (see `tire-wear-v3-prior-example-calculations.spec.ts`).
