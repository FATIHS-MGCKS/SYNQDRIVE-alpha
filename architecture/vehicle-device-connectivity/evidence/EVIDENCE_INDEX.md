# Vehicle & Device Connectivity — Evidence Index

| ID | Title | Source type | Epistemic | Path |
|----|-------|-------------|-----------|------|
| VDC-EVID-LTE-R1-PROD-001 | KS MX 2024 LTE_R1 Production forensics (Phase 2) | PRODUCTION_OBSERVATION | CONFIRMED | [LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](./LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) |
| VDC-EVID-LTE-R1-PENDING-001 | KS MX 2024 placeholder (superseded) | PRODUCTION_OBSERVATION_PENDING_RECONSTRUCTION | HISTORICAL | [LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](./LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md) |
| VDC-EVID-PROD-BASELINE-002 | Production baseline (Phase 2 verified) | PRODUCTION_OBSERVATION | CONFIRMED | [PRODUCTION_BASELINE.md](./PRODUCTION_BASELINE.md) |
| VDC-EVID-REPO-PHASE1-001 | Phase 1 repository audit | CURRENT_CODE | CONFIRMED | [REPOSITORY_INVENTORY.md](./REPOSITORY_INVENTORY.md), [CURRENT_STATE.md](../CURRENT_STATE.md) |
| VDC-EVID-GT-R1-PREFLIGHT-001 | GT-R1-UNPLUG-001 read-only preflight (provider + Production baseline) | PRODUCTION_OBSERVATION + PROVIDER_API | CONFIRMED | [GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](./GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md) |

## Code evidence (repository — bootstrap index)

| Topic | Path |
|-------|------|
| Monotonic guard | `backend/src/modules/dimo/vls-monotonic-merge.util.ts` |
| Snapshot processor | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Freshness resolver | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` |
| Runtime builder | `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` |
| Connectivity alerts (DIMO module) | `backend/src/modules/dimo/connectivity-alert/` |
