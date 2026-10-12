# DSRG — Evidence index

| ID | Path | Class | Summary |
|----|------|-------|---------|
| E-DSRG-01 | [`DSRG_01_EXECUTOR_EXECUTION_CONTRACT.md`](DSRG_01_EXECUTOR_EXECUTION_CONTRACT.md) | REPOSITORY + TEST | `exec bash` fix; runner path guard |
| E-DSRG-02 | [`DSRG_02_PIN_REPROMOTION_2026-10-11.md`](DSRG_02_PIN_REPROMOTION_2026-10-11.md) | PRODUCTION_PIN + HISTORICAL | R0–R2 pin promotion to `448a889` |
| E-EXP021-S4P4B | [`EXP021_S4P4B_AUTHORIZED_PIN_PROMOTION.md`](EXP021_S4P4B_AUTHORIZED_PIN_PROMOTION.md) | PRODUCTION_PIN | Owner-authorized pin `448a889` → `bc7e807` (live app unchanged) |
| E-EXP021-S4P7 | [`EXP021_S4P7_MASTER_ADMIN_S4_MONITORING.md`](EXP021_S4P7_MASTER_ADMIN_S4_MONITORING.md) | REPOSITORY + TEST | Master Admin S4 Platform Ops panel + `/admin/ops/driving-intelligence-s4` |
| E-DSRG-03-R0 | [`PRODUCTION_BASELINE.md`](PRODUCTION_BASELINE.md) | PRODUCTION_READ_ONLY | DSRG-03 R0 bounded VPS snapshot |
| E-DSRG-03-R2 | [`DSRG_03_R2_PRODUCTION_RECONCILIATION.md`](DSRG_03_R2_PRODUCTION_RECONCILIATION.md) | PRODUCTION_READ_ONLY | R2 reconciliation @ 2026-10-11T10:14:01Z |
| E-DSRG-03-R3 | [`DSRG_03_R3_PRODUCTION_AUDIT.md`](DSRG_03_R3_PRODUCTION_AUDIT.md) | PRODUCTION_READ_ONLY + SQL SELECT | R3 audit @ 2026-10-11T13:49:49Z |
| E-EXEC-PATHS | [`EXECUTION_PATH_INVENTORY.md`](EXECUTION_PATH_INVENTORY.md) | ARCHITECTURE_DOCUMENT | Six deploy/rollback path classes |
| E-GATE-A | [`GATE_A_READINESS.md`](GATE_A_READINESS.md) | AUDIT_DOCUMENT | Gate A matrix; R6 promotion revalidation |
| E-DSRG-03-R6 | [`DSRG_03_R6_AUTHORITY_PROMOTION.md`](DSRG_03_R6_AUTHORITY_PROMOTION.md) | AUDIT_DOCUMENT | Registry promotion proposal; safety separation |
| E-CI-GRAPH | [`CI_GRAPH_GATE.md`](CI_GRAPH_GATE.md) | ARCHITECTURE_DOCUMENT | Registry CI chain for graph validator |
| E-P4B16-R0-AUDIT | [`P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md`](P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md) | PRODUCTION_READ_ONLY | R0 VPS attestation vs release tree |
| E-P4B16-R0-DESIGN | [`P4B16_R0_ATTESTATION_DESIGN.md`](P4B16_R0_ATTESTATION_DESIGN.md) | ARCHITECTURE_DOCUMENT | Lifecycle + journal/state authority (R0A) |
| E-P4B16-R0A | [`P4B16_R0A_DESIGN_CORRECTION.md`](P4B16_R0A_DESIGN_CORRECTION.md) | ARCHITECTURE_DOCUMENT | R0A correction record |
| E-P4B16-R0-CODE | [`P4B16_R0_CODE_INVENTORY.md`](P4B16_R0_CODE_INVENTORY.md) | REPOSITORY | Writer/reader inventory |
| E-P4B16-R0-TESTS | [`P4B16_R0_OFFLINE_TEST_MATRIX.md`](P4B16_R0_OFFLINE_TEST_MATRIX.md) | ARCHITECTURE_DOCUMENT | Offline test matrix backlog |
| E-P4B16-R1A | [`P4B16_R1A_DURABLE_ATTESTATION_ENGINE.md`](P4B16_R1A_DURABLE_ATTESTATION_ENGINE.md) | REPOSITORY + TEST | R1A engine libs; offline selftest PASS |
| E-VO5C-P4B15 | [`../../vehicle-onboarding/evidence/VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md`](../../vehicle-onboarding/evidence/VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md) | REPOSITORY | P4B15 (preserved) |
| E-VO5C-R2 | [`../../vehicle-onboarding/evidence/VO5C_R2_SECURITY_FLOOR_ROLLBACK.md`](../../vehicle-onboarding/evidence/VO5C_R2_SECURITY_FLOOR_ROLLBACK.md) | REPOSITORY | Security floor (preserved) |
| E-OPS-SELFTEST | `backend/scripts/ops/vps-vo5c-*.selftest.sh` | CURRENT_TEST | Offline only; not live deploy proof |
| E-OPS-P4B16-R1A | `backend/scripts/ops/vps-release-attestation.selftest.sh` | CURRENT_TEST | P4B16 R1A attestation certification |
| E-P4B16-R1B | [`P4B16_R1B_DEPLOY_INTEGRATION.md`](P4B16_R1B_DEPLOY_INTEGRATION.md) | REPOSITORY + TEST | R1B deploy/rollback hooks; offline integration selftest |
| E-DSRG-DEPLOY-CONSOLIDATION | [`DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md`](DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md) | REPOSITORY + TEST | Single VPS pinned-runner contract; legacy path guards |
| E-OPS-P4B16-R1B | `backend/scripts/ops/vps-release-attestation-integration.selftest.sh` | CURRENT_TEST | P4B16 R1B hook certification |

## Ledger

Canonical: [`research/CHANGE_LEDGER.md`](../research/CHANGE_LEDGER.md)  
Redirect: [`../CHANGE_LEDGER.md`](../CHANGE_LEDGER.md)

## Machine graph evidence nodes

See [`graph/nodes.yaml`](../graph/nodes.yaml) (`DSRG-EVID-*`, `DSRG-TEST-*`).
