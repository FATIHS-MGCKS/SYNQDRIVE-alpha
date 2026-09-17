# Vehicle & Device Connectivity — Evidence Index

| ID | Title | Source type | Epistemic | Path |
|----|-------|-------------|-----------|------|
| VDC-EVID-LTE-R1-PROD-001 | KS MX 2024 LTE_R1 Production forensics (Phase 2) | PRODUCTION_OBSERVATION | CONFIRMED | [LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](./LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) |
| VDC-EVID-LTE-R1-PENDING-001 | KS MX 2024 placeholder (superseded) | PRODUCTION_OBSERVATION_PENDING_RECONSTRUCTION | HISTORICAL | [LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](./LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md) |
| VDC-EVID-PROD-BASELINE-002 | Production baseline (Phase 2 verified) | PRODUCTION_OBSERVATION | CONFIRMED | [PRODUCTION_BASELINE.md](./PRODUCTION_BASELINE.md) |
| VDC-EVID-REPO-PHASE1-001 | Phase 1 repository audit | CURRENT_CODE | CONFIRMED | [REPOSITORY_INVENTORY.md](./REPOSITORY_INVENTORY.md), [CURRENT_STATE.md](../CURRENT_STATE.md) |
| VDC-EVID-GT-R1-PREFLIGHT-001 | GT-R1-UNPLUG-001 read-only preflight (provider + Production baseline) | PRODUCTION_OBSERVATION + PROVIDER_API | CONFIRMED | [GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](./GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md) |
| VDC-EVID-GT-R1-UNPLUG-FAILURE-001 | OBD UNPLUG webhook provider `failed` forensics + remediation design | PROVIDER_API + PRODUCTION_OBSERVATION + CODE | CONFIRMED | [GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md](./GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md) |
| VDC-EVID-GT-R1-UNPLUG-RECOVERY-001 | Authorized UNPLUG webhook `PUT` recovery — `failed`→`enabled`, subscriptions preserved | PROVIDER_API | CONFIRMED | [GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md](./GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md) |
| VDC-EVID-GT-R1-EXECUTION-001 | GT-R1-UNPLUG-001 controlled physical unplug/replug — KS MX 2024 LTE_R1 live observation | PRODUCTION_OBSERVATION + CODE | CONFIRMED | [GT_R1_UNPLUG_EXECUTION_2026-09-12.md](./GT_R1_UNPLUG_EXECUTION_2026-09-12.md) |
| VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 | Phase 1 canonical physical-device-state reconciliation foundation (dark deploy) | CURRENT_CODE + TEST | IMPLEMENTATION_PRESENT / POSTGRES_VALIDATED / FINAL_CI_VALIDATED | [PHYSICAL_STATE_FOUNDATION_2026-09-12.md](./PHYSICAL_STATE_FOUNDATION_2026-09-12.md) |
| VDC-EVID-RB019-PHASE2-SCOPE-001 | RB-019 Phase 2 runtime cutover scope & readiness audit (no implementation) | AUDIT_DOCUMENT | SCOPED_NOT_IMPLEMENTED | [../../../docs/audits/vdc-rb019-phase2-runtime-cutover-scope-2026-09-13.md](../../../docs/audits/vdc-rb019-phase2-runtime-cutover-scope-2026-09-13.md) |
| VDC-EVID-RB019-P21-DURABILITY-001 | RB-019 Phase 2 P2.1 durability foundation (outbox + authority latch + coordinator tx) | CURRENT_CODE + TEST | P2_1_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P21_DURABILITY_2026-09-13.md](./PHYSICAL_STATE_P21_DURABILITY_2026-09-13.md) |
| VDC-EVID-RB019-P22-SHADOW-001 | RB-019 Phase 2 P2.2 shadow + authority state-machine infrastructure (compare-only) | CURRENT_CODE + TEST | P2_2_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P22_SHADOW_AUTHORITY_INFRA_2026-09-13.md](./PHYSICAL_STATE_P22_SHADOW_AUTHORITY_INFRA_2026-09-13.md) |
| VDC-EVID-RB019-P23-WRITERS-001 | RB-019 Phase 2 P2.3 evidence writers + STATEFUL_SHADOW GT-R1 proof | CURRENT_CODE + TEST | P2_3_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P23_EVIDENCE_WRITERS_2026-09-14.md](./PHYSICAL_STATE_P23_EVIDENCE_WRITERS_2026-09-14.md) |
| VDC-EVID-RB019-P24-PRESEED-001 | RB-019 Phase 2 P2.4 physical-state pre-seed tooling | CURRENT_CODE + TEST | P2_4_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P24_PRESEED_2026-09-14.md](./PHYSICAL_STATE_P24_PRESEED_2026-09-14.md) |
| VDC-EVID-RB019-P25-ENTRY-GATE-001 | RB-019 Phase 2 P2.5 entry-gate / cutover-readiness audit (no implementation) | AUDIT_DOCUMENT | P2_5_ENTRY_GATE_AUDIT_COMPLETE | [../../../docs/audits/vdc-rb019-p25-entry-gate-readiness-2026-09-14.md](../../../docs/audits/vdc-rb019-p25-entry-gate-readiness-2026-09-14.md) |
| VDC-EVID-RB019-P25-CUTOVER-RUNTIME-001 | RB-019 Phase 2 P2.5 authority cutover runtime foundation | CURRENT_CODE + TEST | P2_5_IMPLEMENTATION_PRESENT / CUTOVER_ACTIVATION_NOT_PROVEN | [PHYSICAL_STATE_P25_AUTHORITY_CUTOVER_RUNTIME_2026-09-14.md](./PHYSICAL_STATE_P25_AUTHORITY_CUTOVER_RUNTIME_2026-09-14.md) |
| VDC-EVID-RB019-P25-ACTIVATION-READINESS-001 | RB-019 Phase 2 P2.5 cutover activation readiness / operational proof audit | AUDIT_DOCUMENT + PRODUCTION_OBSERVATION | CUTOVER_ACTIVATION_NOT_PROVEN | [../../../docs/audits/vdc-rb019-p25-cutover-activation-readiness-2026-09-15.md](../../../docs/audits/vdc-rb019-p25-cutover-activation-readiness-2026-09-15.md) |
| VDC-EVID-RB019-P25-SHADOW-PILOT-GATE-001 | RB-019 Phase 2 P2.5 STATEFUL_SHADOW pilot scope gate + scope-bound observability | CURRENT_CODE + TEST | P2_5_SHADOW_PILOT_GATE_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P25_SHADOW_PILOT_SCOPE_GATE_2026-09-16.md](./PHYSICAL_STATE_P25_SHADOW_PILOT_SCOPE_GATE_2026-09-16.md) |
| VDC-EVID-RB019-P25-BOOTSTRAP-GT-R1-001 | RB-019 Phase 2 P2.5 bootstrap GT-R1 expected-fix proof (`SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT`) | CURRENT_CODE + TEST | P2_5_BOOTSTRAP_PROOF_IMPLEMENTATION_PRESENT | [PHYSICAL_STATE_P25_BOOTSTRAP_GT_R1_PROOF_2026-09-17.md](./PHYSICAL_STATE_P25_BOOTSTRAP_GT_R1_PROOF_2026-09-17.md) |

## Code evidence (repository — bootstrap index)

| Topic | Path |
|-------|------|
| Monotonic guard | `backend/src/modules/dimo/vls-monotonic-merge.util.ts` |
| Snapshot processor | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Freshness resolver | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` |
| Runtime builder | `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` |
| Connectivity alerts (DIMO module) | `backend/src/modules/dimo/connectivity-alert/` |
| Physical-state reconciliation (Phase 1) | `backend/src/modules/dimo/device-connection-physical-state/` |
