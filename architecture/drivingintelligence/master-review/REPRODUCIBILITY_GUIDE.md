# Reproducibility Guide

**Environment:** `backend/` on branch `cursor/di-master-architecture-research-20261021` (from `origin/main`).

## Unit / integration tests (VERIFIED commands)

```bash
cd backend && npm ci && npx prisma generate
cd backend && npm run test:di:s4-research
cd backend && npm test -- --testPathPattern=di-v0-pure-core
cd backend && npm test -- --testPathPattern=di-v0-speed-qc
```

S4A Postgres (optional, requires `DI_V0_S4A_POSTGRES_INTEGRATION=1`):

```bash
cd backend && npm run test:di:s4a:postgres:ci
```

S4 research worker:

```bash
cd backend && npm run test:di:s4-research-worker
```

## Offline replay harnesses

| Harness | Command / path |
|---------|----------------|
| Tesla S4 research replay | `backend/scripts/test/di-s4-research-tesla-replay.harness.ts` |
| LDI-10D seven-algorithm | `npm run ldi10d:phase3c2-tesla-seven-algorithm-replay` (see `ldi-10d/fixtures/tesla-20261016/REPLAY_INSTRUCTIONS.md`) |
| Tesla direction-aware P1 | `backend/scripts/research/exp021-tesla-direction-aware-p1.harness.ts` |
| P2.1 QC preview | Documented in `EXP021_P2_1_REAL_TRIP_QC_PREVIEW.md` (requires read-only DB role) |

## Pinned artifacts

| Artifact | Path |
|----------|------|
| Geometry V2 pins | `architecture/drivingintelligence/evidence/ldi-10d/LDI10D_GEOMETRY_V2_REPLAY_PINS.json` |
| Tesla position grid | `architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/TESLA_POSITION_GRID.json` |
| Tiguan replays | `architecture/drivingintelligence/evidence/exp021-tiguan-20261019/replay/` |

## Authority validators

```bash
bash architecture/drivingintelligence/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## What this dossier did **not** run

- Production VPS read-only attestation (no `CLOUD_AGENT_OWNER_DEPLOY`)
- Live DIMO re-fetch (mutability risk)
- Cloud artifact replays under `/opt/cursor/artifacts/`

Document claims from those sources are **REPORTED**, not re-verified here.
