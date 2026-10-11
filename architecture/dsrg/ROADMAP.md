# DSRG roadmap

## North star

All production release promotion paths that can change `/opt/synqdrive/current`, run Prisma migrate, or restart replicas must be **discoverable, attestable, and fail-closed** unless explicitly authorized through pinned executor + human gates.

## Phases (documentation labels)

| Phase | Label | Status (2026-10-10) | Outcome |
|-------|--------|------------------------|---------|
| R2 | Security floor & rollback guards | **Shipped** (ops scripts) | Floor ancestry, unsafe rollback denied, pinned preflight |
| P4B12–P4B14 | *(inventory / admission precursors)* | See [VO5C_P4B12_P4B16_HISTORY.md](./VO5C_P4B12_P4B16_HISTORY.md) | Evidence scattered in VO5C P4A/P2 tracks |
| P4B15 | Deploy bypass enforcement (code) | **Merged** PR #1967 @ `40c6dd9` | Authority file contract; entrypoint wiring; offline tests |
| P4B15-P6 | Pin promotion | **Done** on VPS | Config → `40c6dd9`; prior pins preserved; enforcement off |
| P4B16 | Deploy attestation sync | **Design** | `SYNQDRIVE_DEPLOYED_GIT_SHA` vs replica SHA; no auto APDS pin |
| DSRG-01 | Execution contract fix | **Merged** PR #1970 | `exec bash`; canonical pinned-ops runner |
| DSRG-02 | Pin re-promotion | **Done** 2026-10-11 | Config → `448a889`; `40c6dd9` preserved; app `7f47c9f` |
| P4B17+ | OS boundary activation | **Not started** | sudoers, optional `chattr +i`, `ENFORCEMENT_ACTIVE=1`, dual approval |

## Non-goals (DSRG)

- Replacing APDS epoch workflows
- EXP021 Gate-6 open/rekill automation
- RFRF stage rollout semantics
