# P1.3-S5 — Historical Refuel Backfill Candidates (Read-Only)

**Generated:** 2026-08-30  
**Mode:** Read-only inventory — no rows modified

---

## Scope

This report lists candidate work for a **separate, reviewed** backfill operation. It does **not** reinterpret `durationSeconds`.

### A. Fuel-rise field derivation

Re-run `fetchFuelLevelSamples` + `deriveRefuelFuelLevelRise` for historical REFUEL rows where:

- `fuel_level_rise_duration_seconds IS NULL`
- `fuel_delta_liters > 1`
- DIMO telemetry still available for the detection window

### B. Stale sibling reconciliation

Production heuristic (Aug-30 audit): overlapping REFUEL singletons same vehicle/token where shorter row is contained in longer envelope.

**Known case:** KS MX 2024, 2026-08-28 — `685 s` sibling under `4818 s` canonical.

### C. Misleading UI label population (pre-fix)

Heuristic: `kind=REFUEL`, `duration_seconds >= 900`, material fuel delta.

| Metric | Value (prod audit) |
|--------|-------------------|
| Candidate events | 10 |
| Vehicles | 4 |
| Median duration | 3507.5 s |
| Max duration | 85384 s |

**Note:** Rows are not corrupt; only UI semantics were misleading before P1.3-S5.

---

## Explicit non-goals

- Do not rewrite `duration_seconds` on historical rows
- Do not populate `physicalRefuelDurationSeconds` (not in schema)
- Do not apply REFUEL fuel-rise logic to RECHARGE
