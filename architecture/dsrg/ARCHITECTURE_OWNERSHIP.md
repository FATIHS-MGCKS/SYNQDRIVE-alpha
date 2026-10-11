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

DSRG is a **documentation hub**, not a separate row in `SYNQDRIVE_RENTAL_ARCHITECTURE.md` until promoted under `MODULE_AUTHORITY_STANDARD.md`. Until then:

- **Epistemic source for deploy governance narrative:** `architecture/dsrg/*`
- **Canonical VO5C evidence:** `architecture/vehicle-onboarding/evidence/VO5C_*`
- **Runtime source of truth:** `backend/scripts/ops/*` on VPS pinned tree + live release

## Change approval (production)

| Action | Approvers |
|--------|-----------|
| Pin tree install / config pointer | SRE + VO5C platform (documented in P6) |
| `ENFORCEMENT_ACTIVE=1` | Dual: SRE + Security; negative bypass test |
| APDS epoch pin change | APDS operator allowlist workflow (independent) |
