# Suite: ROAD_MATCHING_BENCHMARK

**Goal:** Way association plausibility — **not** accuracy % without road-ID GT.

## Benchmarks

| BMK_ID | OSM pin | Decoders |
|--------|---------|----------|
| `BMK-TESLA-LDI10D-20261016` | `LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json` | Baseline, Viterbi, P1 regression |
| `BMK-TIGUAN-NAV-20261019` | `TIGUAN_OSM_FROZEN_SNAPSHOT.json` | A–E (forward, backtrack, strict node, route R4.1) |

## Pin contract

- GPS: frozen `*_POSITION_GRID.json` (no interpolation)
- OSM: sha256 in `TIGUAN_INPUT_MANIFEST.json` or Tesla frozen snapshot
- Code: `S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2` unless legacy pin explicitly requested
- Output: per-bucket evidence class `ASSOCIATED` | `AMBIGUOUS` | `UNKNOWN`

## Metrics (allowed)

- Class histograms (MEASURED on replay)
- Way-change counts (Tesla P1: 135 — observability only)
- Video way match/conflict (Tiguan) — **PROXY_ONLY**
- `independentRoadIdAccuracy` must remain **NOT_ASSESSABLE**

## Failure classes

Service road oscillation, parallel carriageways, underpass (Tiguan E002 audits), impossible graph transitions (F4-B).

## Command

```bash
cd backend && npm run test:di:s4-research
# Tiguan: see evidence/exp021-tiguan-20261019/RUNBOOK.md
```
