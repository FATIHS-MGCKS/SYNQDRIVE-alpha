# Suite: ROUTING_BENCHMARK

**Goal:** Directed graph, turn restrictions, transition plausibility on **frozen** OSM + route context.

## Algorithms

| ID | Config |
|----|--------|
| Directed routing | One-way penalties (route PR family) |
| `S4_RESEARCH_ROUTE_AWARE_VITERBI_R4_1` | Tiguan variant **E** |
| Topology | Strict node-id R1 (#2082) — Tiguan C/D |

## Benchmarks

- `BMK-TIGUAN-NAV-20261019` — primary
- `BMK-TESLA-LDI10D-20261016` — route-aware merges on research branch pins

## Metrics

- Topology conflict / impossible transition counts (F4-B)
- **Not** path-length vs GT without independent route GT

## Known limits

Turn restrictions largely **UNKNOWN** in OSM extract; layer/level not modeled — documented in PR B pure library.
