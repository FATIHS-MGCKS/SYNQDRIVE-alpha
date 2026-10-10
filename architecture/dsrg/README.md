# DSRG — Deploy Security & Release Governance

**DSRG** is the cross-cutting documentation authority for **production deploy safety** on SynqDrive VPS: pinned executors, attestation, authorization, OS privilege boundaries, and coexistence with APDS, EXP021, and RFRF.

This directory is **documentation-only**. It does not replace:

- `architecture/vehicle-onboarding/` — vehicle onboarding module authority and VO5C evidence
- Production scripts under `backend/scripts/ops/` (names unchanged)

## Scope

| Topic | Primary doc |
|-------|-------------|
| Roadmap & phases | [ROADMAP.md](./ROADMAP.md) |
| Ownership & decision rights | [ARCHITECTURE_OWNERSHIP.md](./ARCHITECTURE_OWNERSHIP.md) |
| VO5C P4B12–P4B16 narrative map | [VO5C_P4B12_P4B16_HISTORY.md](./VO5C_P4B12_P4B16_HISTORY.md) |
| Pinning & executor integrity | [PINNING_AND_ATTESTATION.md](./PINNING_AND_ATTESTATION.md) |
| Deploy authorization & enforcement | [DEPLOYMENT_AUTHORIZATION.md](./DEPLOYMENT_AUTHORIZATION.md) |
| OS / sudoers boundary | [OS_PRIVILEGE_BOUNDARY.md](./OS_PRIVILEGE_BOUNDARY.md) |
| Rollback & emergency containment | [ROLLBACK_AND_CONTAINMENT.md](./ROLLBACK_AND_CONTAINMENT.md) |
| APDS / EXP021 / RFRF dependencies | [CROSS_MODULE_DEPENDENCIES.md](./CROSS_MODULE_DEPENDENCIES.md) |
| Append-only change log | [CHANGE_LEDGER.md](./CHANGE_LEDGER.md) |

## Certified production pin (reference)

| Role | SHA (2026-10-10) |
|------|------------------|
| Pinned executor (post P6) | `40c6dd99d60cb07575bcb687586c66c50651e213` |
| Live application release | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| Prior pinned executor (preserved) | `dc30d2c91e458603c7d45ba2e25c1ca0a1d0c672` |

Enforcement (`VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1`) and OS sudoers remain **not activated** as of DSRG-01.

## Related evidence (preserved in place)

VO5C engineering evidence stays under `architecture/vehicle-onboarding/evidence/` (for example `VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md`, `VO5C_R2_SECURITY_FLOOR_ROLLBACK.md`). DSRG links and summarizes; it does not move or rename those files.
