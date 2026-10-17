# EXP-021 S4 Research Extension — PR B Pure Library

**Status:** Engineering complete (awaiting owner review; no merge/deploy)  
**Base main:** `d43ff450a0831be4072f6b1b5c687b5ac88f0a7b`  
**Source PR #2051 reference:** `6311d8c375dc5652bd64212ca4ed208175dc8148` (no drift at extraction time)

## Scope

Pure, side-effect-free road-matching and contextual evidence helpers under:

`backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research/`

## Explicit non-goals (this PR)

- Nest runtime wiring, schedulers, BullMQ, Prisma migrations
- Production DB, DIMO API, live OSM fetch
- Changes to S4A–S4F execution, L3, S1, QC, scores, or product UI
- Feature-flag activation or deployment

## Contracts (summary)

- **Inputs:** time-ordered GPS buckets (with availability/QC), optional L3 speed, versioned OSM ways + topology, algorithm config. Missing coordinates are **not** interpreted as standstill.
- **Outputs:** baseline and Viterbi hypotheses **always separate**; `ASSOCIATED` is algorithmic association only; `independentRoadIdAccuracy` remains **NOT_ASSESSABLE**.

## Validation

```bash
cd backend && npm run test:di:s4-research
```

Frozen Tesla replay via transpile-only harness — see `scripts/test/di-s4-research-tesla-replay.harness.ts`.

- **Geometry V2 authoritative pins:** `LDI10D_GEOMETRY_V2_REPLAY_PINS.json`
- **Legacy V1 geometry pins (historical):** `LDI10D_LEGACY_GEOMETRY_V1_REPLAY_PINS.json`
- **Per-bucket V1→V2 diff:** `LDI10D_GEOMETRY_V1_V2_BUCKET_DIFF.json` (488/1136 buckets; not a ground-truth accuracy claim)

**Adjacency:** `buildWayAdjacency` uses shared rounded node coordinates only — no OSM `layer`/`level`; grade-separated ways at identical coordinates may be treated as connected.
