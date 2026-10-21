# Architecture ownership — DSRG

## Decision

**DSRG** owns **cross-cutting deploy governance documentation** and coordinates with module authorities. It does **not** own vehicle onboarding product logic, APDS shadow epochs, or EXP021 experiment schedulers.

| Concern | Owning authority | DSRG role |
|---------|------------------|-----------|
| Pinned executor ops scripts | VO5C / VPS ops (implementation) | Specify contracts, attest gaps, promotion runbooks |
| Vehicle onboarding admission | `architecture/vehicle-onboarding/` | Map P4A offboard admission; no duplication |
| APDS shadow epochs | APDS / P25 evidence | Dependency & non-interference rules |
| EXP021 fleet / Gate-6 | DI S4 ops + backend modules | Dependency; deploy must not open Gate-6 |
| RFRF rollback stages | RFRF scripts + evidence | Deploy enforcement must not weaken RFRF traps |

## Registry coverage

DSRG is registered in `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md` as **`AUTHORITY_ACTIVE`** (DSRG-03 R6 promotion — effective on merge). It was **`AUDIT_IN_PROGRESS`** from DSRG-03 R0 through R5 and **previously absent** from the central inventory.

| Layer | Authority |
|-------|-----------|
| Deploy governance architecture (cross-cutting) | `architecture/dsrg/*` |
| VO5C phase implementation evidence | `architecture/vehicle-onboarding/evidence/VO5C_*` |
| Runtime behavior | `backend/scripts/ops/*` on VPS pinned tree + live release |
| APDS approved pin / epochs | APDS owning module (see [CROSS_MODULE_DEPENDENCIES.md](./CROSS_MODULE_DEPENDENCIES.md)) |
| EXP021 / Gate-6 | Driving Intelligence + EXP021 ops |
| RFRF rollback | RFRF contracts and scripts |

## DSRG responsibilities (this workstream)

- Deployment governance architecture and pinned-executor execution contract
- Release authorization, attestation, and enforcement **policy**
- OS privilege boundary readiness and security-floor / rollback **interaction** with deploy paths
- Production deploy enforcement rollout (when explicitly authorized)

## Vehicle Onboarding responsibilities (unchanged)

- Vehicle onboarding and offboarding product flows
- VO5C product admission and MFA (historical P4A–P4B evidence preserved in place)

## Change approval (production)

| Action | Approvers |
|--------|-----------|
| Pin tree install / config pointer | SRE + VO5C platform (documented in P6) |
| `ENFORCEMENT_ACTIVE=1` | Dual: SRE + Security; negative bypass test |
| APDS epoch pin change | APDS operator allowlist workflow (independent) |
