# DSRG-03 R5 — Break-glass path correction

| Field | Value |
|-------|-------|
| **Starting PR head** | `3d5979ecdab038e32eed00e719a153af159b8dd9` |
| **Mode** | `DOCUMENTATION_AND_TEST_VERIFICATION` |
| **Production mutations** | **NO** |
| **BREAK_GLASS_READY** | `NOT_VERIFIED` |
| **ENFORCEMENT** | **OFF** (unchanged) |

## Path correction (R4 runbook drift)

| Incorrect (removed) | Verified replacement | Evidence |
|---------------------|----------------------|----------|
| `/opt/synqdrive/config/vo5c-pinned-executor.env` | `/opt/synqdrive/shared/vo5c-pinned-executor.env` | DSRG-02 R1/R2, `PRODUCTION_BASELINE.md`, R3 audit |
| `/opt/synqdrive/pinned-executors/<sha>/` | `/opt/synqdrive/shared/pinned-executor/<full-sha>/` | DSRG-02 R1 install step |

## Recovery consistency audit (DSRG tree)

| Topic | Canonical reference | Verification status |
|-------|---------------------|---------------------|
| Pin config + backups | `ROLLBACK_AND_CONTAINMENT.md` BG-C | Backup naming **confirmed** in DSRG-02 evidence; restore drill **NOT_VERIFIED** |
| Sudoers example | `backend/scripts/ops/vo5c-production-deploy-privilege-boundary.sudoers.example` | Production install **absent** (R3) |
| Wrapper example | `/opt/synqdrive/shared/bin/vo5c-pinned-deploy-wrapper.sh` | **NOT installed** — example only |
| Pinned runner | `<PINNED_ROOT>/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh` | DSRG-02 seal **CONFIRMED** in pin tree |
| Failed sudoers recovery | BG-D in rollback doc | **NOT_VERIFIED** (no live sudoers to exercise) |

No other stale `config/` or `pinned-executors/` paths remain under `architecture/dsrg/` after R5.
