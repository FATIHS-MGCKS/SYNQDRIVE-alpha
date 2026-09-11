# Vehicle Connectivity — Evidence Index

| ID | Title | Source type | Epistemic | Path |
|----|-------|-------------|-----------|------|
| VC-EVID-LTE-R1-PENDING-001 | KS MX 2024 LTE_R1 forensics — pending reconstruction | PRODUCTION_OBSERVATION_PENDING_RECONSTRUCTION | INFERRED | [LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](./LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md) |
| VC-EVID-PROD-BASELINE-001 | Production baseline gate | AUDIT_DOCUMENT | UNKNOWN | [PRODUCTION_BASELINE.md](./PRODUCTION_BASELINE.md) |

## Code evidence (repository — bootstrap index)

| Topic | Path |
|-------|------|
| Monotonic guard | `backend/src/modules/dimo/vls-monotonic-merge.util.ts` |
| Snapshot processor | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Freshness resolver | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` |
| Runtime builder | `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` |
| Connectivity alerts (DIMO module) | `backend/src/modules/dimo/connectivity-alert/` |
