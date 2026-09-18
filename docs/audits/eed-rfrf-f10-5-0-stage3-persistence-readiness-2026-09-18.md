# RFRF F10.5.0 / F10.5.0.1 — Stage-3 candidate persistence readiness & transaction safety

**Evidence ID:** EED-EV-0069  
**Class:** OPS+DOC  
**Date:** 2026-09-18  
**PR:** #1691 (draft)  
**Authoritative head:** `9ce8cb2758f182fc51fd331acb641b2cdff3b10a` (+ F10.5.0.1 commits on same branch)

## F10.5.0.1 micro-closure status

| Field | Value |
|-------|-------|
| **RFRF_F10_5_0_1_FINAL_MICRO_CLOSURE** | See §Validation — **PASS** when GitHub `rfrf-stage3-persistence-readiness` job green; otherwise **BLOCKED** pending CI |
| **STAGE_3_EXECUTED** | NO |
| **STAGE_3_START_AUTHORIZED** | NO |

### CI (PR #1691 @ `9ce8cb275…` baseline)

| Metric | Value |
|--------|-------|
| **GitHub checks (repo-wide on PR head at F10.5.0 land)** | **28 / 28 SUCCESS** (0 failed, 0 pending) |
| **Additional workflow** | `.github/workflows/rfrf-stage3-persistence-readiness.yml` — isolated PG + Redis + F10 gate (added F10.5.0.1) |

### Blocker taxonomy (corrected)

| Item | Severity |
|------|----------|
| **STAGE3_OBSERVATIONAL_READINESS=NO** | **Epistemic / operational note** — not a structural P0. Means no genuine Production Stage-2 raw-rise positive path observed yet. |
| **PRODUCTION rebaseline** | Governance acceptance of post-#1689 deploy while RFRF Stage 2 unchanged — **PRODUCTION_REBASELINE_ACCEPTED=YES** (read-only, this mission) |
| **Real PG re-proof** | Required for closure — executed via CI workflow (not Cloud Agent VM) |

**Authorization rule:** `READY_FOR_STAGE3_AUTHORIZATION_GATE=YES` is allowed with observational readiness **NO**, when structural/transactional/rebaseline/PG/cross-workstream/CI requirements pass.

Epistemic note to preserve in operator communications:

> Stage-3 structural/transactional readiness is proven, but no genuine Production Stage-2 raw-rise positive-path observation has yet occurred.

## Git baselines

| Role | SHA |
|------|-----|
| **CURRENT_MAIN_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` (#1689) |
| **PR #1690 merge** | `4883516be35ddd1fdb00a96a97f9437f1e3cee1c` |

## Production rebaseline (read-only acceptance)

| Field | F10.4.2 accepted | Current Production |
|-------|------------------|-------------------|
| **Release** | `20260918085306_v4994` | `20260918174845_v4994` |
| **Runtime SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` | `0384adf12bbb1407eb8e291726d3dac60323b8b6` (#1689 deployed) |

| Check | Result |
|-------|--------|
| **PRODUCTION_REBASELINE_ACCEPTED** | **YES** (governance read-only; legitimate #1689 deploy) |
| **PRODUCTION_REBASELINE_REQUIRED** | **NO** (after acceptance) |
| **CURRENT_RFRF_STAGE** | 2 |
| **Master / persist / conv / promo / G2** | true / false / false / false / false |
| **Cutover** | `2026-09-18T10:25:41.000Z` unchanged |
| **Candidates / fallback VEE** | 0 / 0 |
| **Live preflight** | PASS (`RFRF_REQUIRED_GIT_SHA=0384adf…`) |
| **Replicas** | Same SHA both replicas; MIXED_RUNTIME=NO |

## EXP-021 #1689 rebaseline (read-only)

| Field | Value |
|-------|-------|
| **PRODUCTION_HAS_EXP021_1689** | YES (runtime + migrations applied) |
| **EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED** | `true` |
| **EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO** | `2026-09-18T18:28:17.000Z` |
| **EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS** | **ABSENT** (env key not set; runtime default applies) |
| **Ledger table** | `exp021_canary_live_window_activation_ledgers` — **0 rows** at audit time |
| **Studies / enrollments / runs** | 1 / 1 / 0 |
| **EXP021_REBASELINE** | **PASS** (accepted baseline documented; canary armed in env, ledger empty, no duplicate-arm evidence collected in this pass) |

## VDC canonical epoch (exact 4-scope population)

**Population:** four scopes from `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON` (Production env).  
**T0:** `2026-09-18T09:33:25.000Z`  
**Filter:** `observed_at >= T0` AND `(organization_id, vehicle_id, provider)` in pilot cohort.

| Metric | Count |
|--------|------:|
| **VDC_CANONICAL_EPOCH_OBSERVATIONS** | **85** |
| **VDC_CANONICAL_EPOCH_BLOCKERS** | **85** |
| **Blockers ≤ observations** | YES |
| **Classification (blocking)** | 85 × `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` |
| **Monotonic vs F10.4.2 canonical 67/67** | YES (increase only; no reset/deletion) |
| **Authority** | LEGACY |
| **Pilot scope count** | 4 |
| **VDC_CROSS_WORKSTREAM_GATE** | PASS |

## Stage-3 semantics & tooling (unchanged from F10.5.0)

- Recovery on failed Stage 3 enable → **Stage 2** (not Stage 1)
- Rollback `--from-stage 3` → Stage 2; cutover immutable
- Persist scope: **GLOBAL** blast radius

## Real PostgreSQL / Redis proof (F10.5.0.1)

Isolated gates (never Production):

| Gate | Script |
|------|--------|
| F3→F2 handoff | `rfrf-f3-f2-handoff-postgres-gate.sh` |
| F4-PR2 runtime + candidate | `rfrf-f4-pr2-runtime-postgres-gate.sh` |
| F9 multi-replica PG+Redis | `rfrf-f9-multi-replica-integration-gate.sh` |

Orchestrator: `rfrf-stage3-persistence-readiness-ci-gate.sh`  
CI: `.github/workflows/rfrf-stage3-persistence-readiness.yml`  
Portability: `lib/rfrf-isolated-postgres-admin.sh` (`RFRF_CI_POSTGRES_SUPERUSER_URL` on GitHub Actions; `su - postgres` on VPS-style hosts).

## Stage-2 observation

| Field | Value |
|-------|-------|
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE2** | NO |
| **STAGE3_OBSERVATIONAL_READINESS** | NO |

## POST–Stage-3 acceptance (future execution)

Unchanged — see prior F10.5.0 section in KG changelog / EED-EV-0069 registry row.

## Local validation (agent)

| Gate | Result |
|------|--------|
| F10 operational tooling gate | PASS (after `npx prisma generate`) |
| Stage 1/2/3 fixture suites | PASS |
| Isolated PG gates on agent VM | N/A (no PostgreSQL) — **CI workflow required** |
