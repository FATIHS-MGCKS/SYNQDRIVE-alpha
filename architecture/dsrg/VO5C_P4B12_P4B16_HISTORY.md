# VO5C P4B12–P4B16 — history map

Preserved detail lives in original evidence files; this is a **navigation index**.

## Timeline

| Track | ID | Summary | Evidence / code |
|-------|-----|---------|-----------------|
| Offboard admission | **P4A** | Default-OFF server admission for canonical offboard HTTP; MFA; release attestation | `architecture/vehicle-onboarding/evidence/` (P4A entries in module ledger) |
| Offboard HTTP | **P1** | Master admin offboard route; legacy deregister lockdown path | `VO5C_P1_MASTER_ADMIN_OFFBOARD_HTTP.md` |
| Frontend cutover | **P2A–P2B4** | UI + legacy route lockdown + prune containment | `VO5C_P2A_*`, `VO5C_P2B1_*`, … |
| Security floor | **R2** | Rollback floor, pinned executor, shallow ancestry | `VO5C_R2_SECURITY_FLOOR_ROLLBACK.md`, `vps-vo5c-r2-h*` selftests |
| Deploy bypass enforcement | **P4B15** | Authority file; fail-closed entrypoints | `VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md`, PR #1967 |
| Pin promotion | **P6** | `dc30d2c` → `40c6dd9` config only; app stays `7f47c9f` | Operator run; seal 2026-10-10 |
| Attestation gap | **P4B16** | Post-deploy `SYNQDRIVE_DEPLOYED_GIT_SHA` sync design | § in P4B15 evidence |

## P4B12–P4B14 naming

Repository usage of **P4B12–P4B14** is informal (precursors to P4B15: admission, executor selection, connectivity staging). No separate `VO5C_P4B12.md` artifact; treat **R2-H2/H3/H4** and **P4A** as the functional predecessors to P4B15.

## Certified pin vs live app

- **Pinned executor** (`40c6dd9`): ops contract including P4B15 lib (not yet re-promoted after DSRG-01 code fix).
- **Live app** (`7f47c9f`): running `current` release; unchanged by pin-only promotion.

## Main-tip drift (2026-10-10)

After P6 authorization, `main` advanced to `3a4bb944` (PR #1968, EXP021 fleet scope). Pin SHA remains frozen at merge commit `40c6dd9` by design.
