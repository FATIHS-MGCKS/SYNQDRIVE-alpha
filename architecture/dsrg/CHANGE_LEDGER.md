# DSRG — Change ledger (append-only)

| Date (UTC) | ID | Change | Production impact |
|------------|-----|--------|-------------------|
| 2026-10-10 | **DSRG-01** | Document DSRG authority; map VO5C P4B12–P4B16; record P6 pin promotion seal | None (docs) |
| 2026-10-10 | **DSRG-01-A** | Fix pinned runner `exec` → `exec bash` for git-clean `vps-deploy-release.sh` (100644); execution-contract selftest | Merged PR #1970 |
| 2026-10-10 | **DSRG-01-R1** | Runner must be invoked from pinned ops dir (not `/current`); preflight from pin | Merged PR #1970 |
| 2026-10-11 | **DSRG-02-R0** | Read-only preflight for pin `40c6dd9` → `448a889` | None |
| 2026-10-11 | **DSRG-02-R1** | VPS pin promotion; config pointer only; `40c6dd9` tree preserved | Live app unchanged |
| 2026-10-11 | **DSRG-02-R2** | Final seal + evidence `DSRG_02_PIN_REPROMOTION_2026-10-11.md` | None (audit/docs) |
| 2026-10-11 | **DSRG-03-R0** | Central registry row + authority bootstrap (`AUDIT_MANIFEST`, `CURRENT_STATE`, Production baseline); **no** `AUTHORITY_ACTIVE` | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R1** | Manifest completeness (`PRODUCTION_RELEASE_PATH`, `REPO_PRODUCTION_DRIFT`, audit matrix, §4 inventory); PR #1973 certification for human review | None (docs) |

Historical VO5C deploy-governance entries remain in `architecture/vehicle-onboarding/research/CHANGE_LEDGER.md` — **reference only**; do not duplicate rows here.
