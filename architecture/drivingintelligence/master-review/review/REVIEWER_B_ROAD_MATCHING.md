# Reviewer B — Road Matching

## Scope

Baseline bucket matcher, Viterbi V2, backpointer (#2081 OPEN), OSM node-id topology, directed routing, route-aware R1–R4.1, direction-aware emission P1, B6/B6.1 (commit `180c74da8` not on main), TC-1..TC-6 as **DRIVER_REPORTED** context only.

## Read first

1. [../ROAD_MATCHING_EVOLUTION.md](../ROAD_MATCHING_EVOLUTION.md)
2. [../ALGORITHM_COMPARISON_MATRIX.md](../ALGORITHM_COMPARISON_MATRIX.md)
3. [../../evidence/EXP021_S4_RESEARCH_PR_B_PURE_LIBRARY.md](../../evidence/EXP021_S4_RESEARCH_PR_B_PURE_LIBRARY.md)
4. [../../evidence/ldi-10d/TESLA_DIRECTION_AWARE_P1_REGRESSION.md](../../evidence/ldi-10d/TESLA_DIRECTION_AWARE_P1_REGRESSION.md)
5. [../REFERENCE_TRIP_REGISTRY.md](../REFERENCE_TRIP_REGISTRY.md) — **REF-001** vs REF-002/003 trip IDs

## Open questions

- Does forward Viterbi improve **plausible** paths vs baseline on same decoder?
- Are directed penalties validated beyond frozen fixtures?
- How to audit service-road oscillation without GT?

## Deliverable

Algorithm comparison with CONFIRMED/AMBIGUOUS/UNKNOWN; no accuracy % without INDEPENDENTLY_VALIDATED data.
