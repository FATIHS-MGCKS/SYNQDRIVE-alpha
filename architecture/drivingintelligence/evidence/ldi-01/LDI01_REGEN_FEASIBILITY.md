# LDI01 — Regeneration Feasibility

## Classification framework (LDI-01)

| Class | Meaning |
|-------|---------|
| `VEHICLE_DECELERATION` | Negative Δv from speed (GPS/HF/L3) — **not** regen-specific |
| `FRICTION_BRAKING_CONFIRMED` | Requires pedal/switch or friction torque — **not in pin** |
| `REGEN_ACTIVE_CONFIRMED` | Positive traction power into battery while moving, signed + synced |
| `REGEN_POSSIBLE_UNCONFIRMED` | Decel + EV power present but timing/sign ambiguous |
| `REGEN_ENERGY_MEASURED` | Integrated kWh from HF power series (`hf-recuperation.ts`) |
| `UNKNOWN` | Missing power series or charging conflated with regen |

## Tesla token 186946 (frozen EXP021 evidence)

- **S4 frozen channels:** POSITION only — **no** traction power time series in pin.
- **HF schema:** `tractionBatteryPowerKw` declared in `HighFrequencyReading` (DIMO W→kW, positive = into battery).
- **Status:** `SCHEMA_DECLARED` / `NOT_VERIFIED` for on-trip regen on this pin.

## Excluded as regen proof (explicit)

- SOC step changes alone
- EED recharge/refuel segments
- GPS-only deceleration
- Video tacho slowing without power channel

## Sign / sync checklist (for future capture)

1. Confirm DIMO field maps to `powertrainTractionBatteryCurrentPower` at 1s HF.
2. Align HF timestamps with POSITION/L3 bucket labels (known bucket vs observation skew).
3. Separate stationary charging (positive power, speed ≈0) from on-road regen (`REGEN_MIN_SPEED_KMH=8`).
4. Persist raw HF export before any detector run.

**Assessment:** `REGEN_CONFIRMATION_FEASIBLE=RESEARCH` until independent HF power evidence is pinned.