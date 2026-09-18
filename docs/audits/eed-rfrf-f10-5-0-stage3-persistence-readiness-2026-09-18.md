# RFRF F10.5.0 — Stage-3 candidate persistence readiness & transaction safety

**Evidence ID:** EED-EV-0069  
**Class:** OPS+DOC  
**Date:** 2026-09-18  
**Maturity:** PROVEN_BY_TOOLING_TEST (Production read-only diagnosis included)

## Mission outcome

| Field | Value |
|-------|-------|
| **RFRF_F10_5_0_STAGE3_PERSISTENCE_READINESS** | **BLOCKED** (Production rebaseline + no Stage-2 raw-rise observation; isolated PG gate not runnable in Cloud Agent VM) |
| **STAGE_3_EXECUTED** | NO |
| **STAGE_3_START_AUTHORIZED** | NO |
| **READY_FOR_STAGE3_AUTHORIZATION_GATE** | NO |
| **READY_TO_MERGE_F10_5_0** | Pending CI on draft PR (local F10 gate PASS after `prisma generate`) |

## Git baselines

| Role | SHA |
|------|-----|
| **CURRENT_MAIN_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` (#1689 EXP-021) |
| **PR #1690 merge** | `4883516be35ddd1fdb00a96a97f9437f1e3cee1c` (ancestor verified) |
| **Tooling branch head** | (see PR) |

## Production rebaseline (read-only)

Accepted F10.4.2 baseline was release `20260918085306_v4994` / runtime `ca7bad8826871376a58efaa874f12992b88c4a04`.

**Observed at F10.5.0 audit time:**

| Field | Value |
|-------|-------|
| **CURRENT_PRODUCTION_RELEASE_ID** | `20260918174845_v4994` |
| **CURRENT_PRODUCTION_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` |
| **PRODUCTION_REBASELINE_REQUIRED** | **YES** |
| **CURRENT_RFRF_STAGE** | 2 |
| **Authorities** | master=true; persist/convergence/promotion/G2 false/absent |
| **Cutover** | `2026-09-18T10:25:41.000Z` (unchanged) |
| **raw_refuel_candidates** | 0 |
| **fallback VEE (SYNQDRIVE_RAW_FUEL_FALLBACK)** | 0 |
| **Live preflight** | PASS (with `RFRF_REQUIRED_GIT_SHA=0384adf…`) |
| **PRODUCTION_HAS_EXP021_1689** | **PARTIAL** — runtime SHA includes #1689 code; **no** `EXP021_CANARY_LIVE_WINDOW_*` keys in `backend.env`; ledger table not verified in this pass |

Do **not** treat F10.4.2 Stage-2 observational contract as automatically valid on the new release without operator rebaseline sign-off.

## Stage-3 semantic contract (code)

| Check | Result |
|-------|--------|
| Previous stage | 2 only |
| Target flags | master=true persist=true; convergence/promotion/G2 false; cutover required valid & unchanged on enable |
| Rollback 3→2 | Clears persist only; preserves master + cutover |

## Reachability (runtime + tests)

| Path | Verdict |
|------|---------|
| Raw detector | YES (master gate) |
| Candidate persistence | YES when persist=true; REJECTED not persisted |
| Fallback VEE / convergence / promotion / G2 | NO at Stage 3 (not-authorized skips; no persist-only VEE path) |
| Persist scope | **GLOBAL** (`RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` env); **STAGE3_GLOBAL_PERSISTENCE_BLAST_RADIUS=YES** |

## Stage-2 Production observation

| Field | Value |
|-------|-------|
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE2** | **NO** |
| **STAGE3_OBSERVATIONAL_READINESS** | **NO** |
| Notes | Post-deploy RFRF metric lines sparse on `/metrics`; prior replica B evidence showed branch invocations with capability skips and **no** detector/observation counters. No candidate rows. |

## Tooling delivered (F10.5.0)

- `rfrf-f10-stage3-transaction-safety-tests.sh` — failure matrix; recovery → **Stage 2**; dry-run 2→3 byte-identical
- `rfrf-f10-stage3-authority-matrix-tests.sh` — runtime reachability proofs
- `rfrf-f10-stage3-rollback-fixture-tests.sh` — `--from-stage 3` dry-run + rollback to Stage 2
- `rfrf-production-enable-stage.sh` — Stage-3 dry-run markers (`STAGE3_DRY_RUN_*`)
- `rfrf-production-rollback.sh` — Stage-3 cutover immutability + `STAGE3_ROLLBACK_TO_STAGE2_SAFE=YES`
- F10 operational gate extended

## POST–Stage-3 acceptance plan (future execution only)

Immediately after authorized Stage 3 enable + rolling restart:

1. Verify stage=3 env matrix; cutover byte-unchanged; runtime SHA unchanged vs planned deploy.
2. Confirm persist=true does **not** create fallback VEE without promotion authority.
3. On first admissible raw-rise after Stage 3: exactly one candidate row (or legitimate rediscovery); no duplicate identity; no VEE/convergence/promotion/G2 side effects.
4. If observations persist but DB writes systematically fail → **BLOCK**.
5. If DB writes occur without admissible detector evidence → **BLOCK**.
6. Monitor `synqdrive_rfrf_persist_*`, `synqdrive_rfrf_candidate_errors_total`, `synqdrive_rfrf_branch_error_total`.

## Validation (agent environment)

| Gate | Result |
|------|--------|
| F10 operational tooling gate | PASS (local, after `npx prisma generate`) |
| Stage 1/2/3 transaction + rollback fixtures | PASS |
| Isolated PostgreSQL F2/F3/F4/F9 gates | **NOT RUN** (no Docker/PostgreSQL on Cloud Agent VM) |
| `prisma validate` | PASS (via gate) |
| EED graph + module registry validators | PASS (via gate) |

## P0 blockers for authorization gate

1. **PRODUCTION_REBASELINE_REQUIRED=YES** — release/SHA moved off F10.4.2 accepted baseline.
2. **STAGE3_OBSERVATIONAL_READINESS=NO** — no proven Production raw-rise under Stage 2.
3. **Isolated real PG persistence proof not re-run** in this environment (code unchanged; prior F2/F9 evidence stands historically but not re-executed here).
