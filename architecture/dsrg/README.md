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

| Role | SHA |
|------|-----|
| Active pinned executor (post DSRG-02 R1) | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Live application release | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| Prior pins preserved on VPS | `40c6dd9…`, `dc30d2c…` |

Enforcement (`VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1`) and OS sudoers remain **not activated** as of DSRG-02 R2 seal.

## Registry follow-up (formal)

DSRG is a **documentation hub** today. To register in `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`:

1. Add inventory row (mini description: deploy security & release governance).
2. Set initial `registry coverage status` to `AUDIT_IN_PROGRESS` per `MODULE_AUTHORITY_STANDARD.md`.
3. Promote to `AUTHORITY_ACTIVE` only after Production read-only VPS audit of deploy paths and validator commands are recorded.

Until then, VO5C evidence under `architecture/vehicle-onboarding/evidence/` remains the implementation authority; DSRG indexes and cross-links.

## Related evidence (preserved in place)

VO5C engineering evidence stays under `architecture/vehicle-onboarding/evidence/` (for example `VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md`, `VO5C_R2_SECURITY_FLOOR_ROLLBACK.md`). DSRG links and summarizes; it does not move or rename those files.
