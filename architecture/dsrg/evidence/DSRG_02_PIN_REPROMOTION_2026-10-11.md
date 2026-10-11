# DSRG-02 — Pin re-promotion (R0 → R1 → R2 seal)

**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Production mode:** pin-only (no application deploy, no enforcement)

## Summary

| Item | Value |
|------|--------|
| Previous pin | `40c6dd99d60cb07575bcb687586c66c50651e213` (P4B15 / P6) |
| Current pin | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` (PR #1970 merge) |
| Live application (unchanged) | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| Config switch UTC (R1) | 2026-10-11T00:24:00Z – 00:24:41Z |
| Operator | Serin Fatih (`dev@synqdrive.eu`) — user self-attested SRE / Platform / Security |

## R0 — Preflight (read-only)

- PR #1970 merged to `448a889`; candidate on `main` ancestry.
- `main` tip later advanced (e.g. `1f5fdabe` Battery V2) with **no** `backend/scripts/ops` diff vs `448a889` — pin frozen to authorized merge SHA, not rolling `main`.
- Offline selftests PASS at `448a889` before promotion.
- EXP021 fleet-rollout ops files bundled in full-repo pin tree; **inactive** until Gate-6/fleet scripts invoked — not by pin pointer swap.
- APDS backend code in tree does not activate without app release + PM2 restart.

## R1 — Authorized execution

**Authorized mutations only:**

1. Install `/opt/synqdrive/shared/pinned-executor/448a88985b78b6a7c4d973913b9a6213bae3e9b4`
2. Atomic update `/opt/synqdrive/shared/vo5c-pinned-executor.env` (0600 root:root)

**Backup:** `vo5c-pinned-executor.env.bak-20261011T002400Z`

**Post-switch:** `vps-vo5c-first-security-deploy-preflight.sh` PREFLIGHT_PASS without `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED`.

## R2 — Final seal (2026-10-11T00:33:43Z)

### Pin / executor

- Config ROOT/SHA exact; mode `0600` root:root.
- Installed HEAD `448a889`; ops/full porcelain `0`; root ownership; no group/world-writable ops files.
- Runner: pinned-ops path guard + `exec bash` on `vps-deploy-release.sh` (100644).
- `chattr +i`: **absent** (extent `e` only) — expected pre-enforcement.
- Previous pin `40c6dd9` preserved; ops clean.

### Live safety

- Live + `SYNQDRIVE_DEPLOYED_GIT_SHA` = `7f47c9f`.
- PM2 replica PIDs `2970224`, `2970404` (unchanged since P6 baseline).
- Scheduler: `:3001` LEADER, `:3002` FOLLOWER.
- EXP021 successful leader tick `2026-10-11T00:33:37.986Z` **after** config switch `00:24:00Z`.
- Gate-6 GLOBAL **KILLED**.

### APDS / RFRF / VO5C

- ACTIVE epoch `3cbc5d95-a5fb-4259-8c00-88f0df93e77a` @ `2026-10-09 21:40:53.812` — unchanged.
- Approved release SHA `ab72f574014d6657cac158c253696b7237cdd3e6` — unchanged.
- RFRF rollback selftest PASS (offline); no RFRF ops diff pin-to-pin.
- VO5C flags off; authority file absent; armed stamp absent.

## Regression evidence (TEST_EXECUTED @ `448a889`)

| Test | Result |
|------|--------|
| `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` | PASS |
| `vps-vo5c-p4b15-production-deploy-bypass-enforcement.selftest.sh` | PASS |
| `vps-vo5c-r2-h3-final-closure.selftest.sh` | PASS |
| `vps-vo5c-security-floor-rollback.selftest.sh` | PASS |

PR #1970 CI all green at merge head `3f821036e54` / merge commit `448a889` — **PASS_INFERRED_FROM_PRIOR_CI** for unrelated app modules; pin certification relies on **TEST_EXECUTED** ops selftests above.

## Remaining enforcement prerequisites

1. Install `vo5c-production-deploy-authority.env` (`ACTIVE=0` first).
2. OS boundary: sudoers + `vo5c-pinned-deploy-wrapper.sh` per example.
3. Optional `chattr +i` on pin trees after operational sign-off.
4. Dual approval → `ENFORCEMENT_ACTIVE=1` + armed stamp monitoring.
5. Negative test: direct `current` deploy must fail when enforcement on.

## DSRG registry follow-up

Completed in **DSRG-03 R0** (registry row `AUDIT_IN_PROGRESS`, authority bootstrap). Promotion to `AUTHORITY_ACTIVE` remains open. VO5C evidence under `architecture/vehicle-onboarding/evidence/` remains canonical for P4B15 implementation history.
