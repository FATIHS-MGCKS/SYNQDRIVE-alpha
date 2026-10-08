# P25 APDS 9.5B — Shadow LV bootstrap execution fix (V2.1)

**Date:** 2026-10-08  
**Mode:** Engineering-only (no production mutation)  
**Certified production SHA (unchanged):** `3b557e208c1a06e91c0a13fb8ba861b1255ee375`  
**Active production epoch (unchanged):** `cf6d91ec-5e57-401c-ae21-c4ec9dabad25`  
**Immutable T0 (unchanged):** `2026-10-08T20:13:28.270Z`

## Confirmed incident (post-T0, read-only)

Production V2 execution admitted `FORCED_SOURCE_TIMESTAMP_MISSING` reconciliation polls but did not persist visible LV for them, while `IMMEDIATE_SNAPSHOT_REQUIRED` (R9) could seed simulated LV. Result: bootstrap deadlock (`simulatedLastLv` stayed null; forced-missing loop).

## Root cause

`P25_APD_SHADOW_ADVANCING_DECISIONS` excludes `FORCED_SOURCE_TIMESTAMP_MISSING`. V2 post-poll visibility and `resolveSimulatedLastLvSourceMs()` both required advancing decisions only.

## Corrected execution contract

| Artifact | Semantics |
|----------|-----------|
| `P25_APD_SHADOW_EXECUTION_V2` | Historical production observations; semantics frozen |
| `P25_APD_SHADOW_EXECUTION_V2_1` | Bootstrap-eligible forced-missing SUCCESS may persist `realPollVisibleLvSourceAt` when scientific guards pass |
| `lastAllowedPollStart` | Still **advancing decisions only** |
| `simulatedLastLvSource` | **Advancing + bootstrap-eligible** SUCCESS rows with visible LV |

New observations after deploy use `shadowExecutionVersion=P25_APD_SHADOW_EXECUTION_V2_1` at **pre-poll** (`P25_APD_SHADOW_EXECUTION_VERSION_CURRENT`). Post-poll does **not** relabel rows; historical production V2 rows stay V2.

Simulated `lastAllowed` / `simulatedLastLv` resolve **only** within `activationEpochId` (legacy NULL-epoch rows excluded from epoch-bound shadow).

## Epoch compatibility (recommendation)

- **Engineering:** V2.1 can ship without pausing the active epoch; version field separates observation semantics within the same epoch.
- **Science:** Compare V2 vs V2.1 trajectories explicitly; do not reinterpret existing V2 rows as if bootstrap had occurred.
- **Clean-slate option:** A future replacement epoch + T0 remains owner-authorized and is **not** part of this change.

## Replay / certification status

| Corpus | Status |
|--------|--------|
| Frozen 5-vehicle / 57-success historical replay (9.2C) | **Preserved** — B2/B4 core parity tests unchanged |
| Corrected execution (V2.1 bootstrap simulation) | **Repository unit + Postgres integration + synthetic timeline** in `p25-apd-shadow-execution-v2_1-bootstrap.spec.ts` |
| Full empirical re-run against production DB from Cloud Agent | **Blocked without authorized read-only DB** in this workstream — do not fabricate counters |

## Validation commands (engineering)

```bash
cd backend && npx prisma validate
cd backend && npm run build
cd backend && npm test -- --testPathPattern='p25-apd-shadow-lv-bootstrap|p25-apd-shadow-execution-v2_1-bootstrap|adaptive-polling-shadow-execution-v2'
# With DATABASE_URL:
cd backend && npm test -- apd-shadow-lv-bootstrap.postgres.integration.spec.ts
```
