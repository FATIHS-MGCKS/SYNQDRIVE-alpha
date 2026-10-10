# APDS / EXP021 / RFRF dependencies

Deploy governance (DSRG / VO5C) must **not**:

| Module | Constraint |
|--------|------------|
| **APDS** | Mutate `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` or activate epochs during pin/enforcement work |
| **EXP021** | Open Gate-6 (`di_v0_s4_control` → `NOT_KILLED`) or change fleet coordinator flags via deploy scripts |
| **RFRF** | Alter rollback stage machinery or weaken fail-closed recovery |

## Verified non-interference (P6 / seal)

- APDS: `ACTIVE` epoch stable; approved pin `ab72f574…` unchanged
- EXP021: scheduler ticks on leader; Gate-6 **KILLED**
- RFRF: libs unchanged in P4B15 selftest scope

## EXP021 deploy guard

`vps-exp021-fleet-deploy-guard.lib.sh` is sourced by **executing** `vps-deploy-release.sh` — reinforces why deploy invocation must succeed on git-clean 644 scripts (DSRG-01).
