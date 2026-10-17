# LDI-10D Phase 3F — Stop inference feasibility (research only)

Phase 3E **does not** implement standstill inference.

## Signals available on Tesla 1136 s timeline

- Deceleration → low-speed sequences (`REPEATED_LOW_SPEED_SEQUENCE`)
- GPS ROW_ABSENT gaps (269 buckets) — may hide true standstill
- QC-untrusted seconds (347 tagged) — block trusted-speed stop proofs
- Post-gap acceleration patterns (observed L3 deltas only)
- Junction/curve proximity: **not available** on Tesla route (OSM bbox mismatch)

## Alternative explanations for low-speed / decel patterns

- Curve approach braking, congestion-like crawl, grade, following traffic, QC abstention

## Feasibility

| Criterion | Assessment |
| --- | --- |
| Deterministic replay | Feasible on committed fixture |
| Confirmed standstill without video | **High false-positive risk** |
| Owner-gated Phase 3F | Required before changing stop-and-go classification |