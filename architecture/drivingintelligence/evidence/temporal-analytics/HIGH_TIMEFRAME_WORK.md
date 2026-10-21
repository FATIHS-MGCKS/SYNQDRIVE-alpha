# High-Timeframe / Time-Series Intelligence — Workstream Audit

**Question:** What was actually implemented vs planned for trip → fleet history analytics?

---

## Classification summary

| Topic | Status | Evidence |
|-------|--------|----------|
| Trip-level impact persistence | **IMPLEMENTED** | `TripDrivingImpact`, `VehicleDrivingImpactCurrent` |
| 30-day rolling window | **IMPLEMENTED** | `VehicleDrivingImpactCurrent` |
| Driver/fleet distance-weighted aggregate | **PARTIAL** | `DriverScoreService` (misnamed vehicle stress) |
| Dedicated time-series store for DI | **NOT STARTED** | No DI-specific TS DB |
| Rolling baselines / fleet trends UI | **PARTIAL** | API exposes current aggregates; trend depth UNKNOWN |
| ClickHouse HF mirror analytics | **PARTIAL** | Optional `HF_MIRROR_ENABLED`; not canonical |
| V2 `DECISION_SUMMARY` stage | **IMPLEMENTED** (flag-gated) | Durable run artifacts |
| High-timeframe episode trends | **DESIGN ONLY** | 0034F mentions; not implemented |

---

## What exists in code

| Component | Role |
|-----------|------|
| `VehicleDrivingImpactCurrent` | Rolling 30-day vehicle stress snapshot |
| `DriverScoreService` | Aggregates trip stress over driver+vehicle scope |
| `RentalDrivingAnalysis` | Booking-period analysis |
| ClickHouse `telemetry_hf_*` | Optional analytics mirror |
| V2 reconciliation scheduler | Repairs stale runs every 10 min |

---

## What was intended in master plan (DI-EV-0001)

High-timeframe intelligence was an explicit program goal (trends, baselines, fleet history). **Forensic finding:** post-trip impact + rolling current state exist; dedicated longitudinal intelligence layer **not implemented** as separate subsystem.

---

## Open gaps

- Fleet baseline definitions not production-validated
- No documented SLO for historical recompute latency
- CH mirror coverage in production: UNKNOWN (`DI-OQ-PERSIST-002`)

---

## Links

- `research/OPEN_QUESTIONS.md`
- `COVERAGE_MATRIX.md` — high-timeframe row
- `CURRENT_STATE.md` — persistence section
