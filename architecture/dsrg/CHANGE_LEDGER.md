# DSRG — Change ledger (append-only)

| Date (UTC) | ID | Change | Production impact |
|------------|-----|--------|-------------------|
| 2026-10-10 | **DSRG-01** | Document DSRG authority; map VO5C P4B12–P4B16; record P6 pin promotion seal | None (docs) |
| 2026-10-10 | **DSRG-01-A** | Fix pinned runner `exec` → `exec bash` for git-clean `vps-deploy-release.sh` (100644); execution-contract selftest | None until next **pinned executor** promotion; does not mutate installed `40c6dd9` tree |
| 2026-10-10 | **DSRG-01-R1** | Runner must be invoked from pinned ops dir (not `/current`); preflight always from pin; registry follow-up documented | PR #1970; offline only |

Historical VO5C deploy-governance entries remain in `architecture/vehicle-onboarding/research/CHANGE_LEDGER.md`.
