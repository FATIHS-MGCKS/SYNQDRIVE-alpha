# Tires Health — Open Hypotheses

Graph nodes `TIRE-HYP-*`. A hypothesis moves to a decision only with evidence against tread measurements.

| ID | Hypothesis | Epistemic | How to test (future, shadow only) |
|----|-----------|-----------|-----------------------------------|
| TIRE-HYP-DS4-EVENT-LOAD-PROXY-001 | DS4 event Δv/duration distributions (per setup, per channel) correlate better with measured tread loss than DI per-100 km stress scores | UNKNOWN | Shadow adapter rows vs `vehicle_tire_tread_measurements` deltas on the 4 covered vehicles once ≥ 2 measurements per setup exist |
| TIRE-HYP-B3-ATTENUATION-CORRECTABLE-001 | B3 attenuation is systematic enough that ordinal classes remain stable across vehicles, so no numeric correction is needed for a tire load proxy | UNKNOWN | Compare class membership stability between C4_ONLY and C5_1_PREFERRED trips of the same vehicle; Fable sign-off required before numeric use |

No speculative weightings or class boundaries are proposed.
