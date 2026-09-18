# RFRF F10.5.0 / F10.5.0.1 — Stage-3 candidate persistence readiness & transaction safety

**Evidence ID:** EED-EV-0069
**Class:** OPS+DOC
**Date:** 2026-09-18
**PR:** #1691 (draft)
**Authoritative head:** `f52afca5346d2b6340cefe3e9655b895bc9f405e` (PR #1691 branch)

| Head role | SHA |
|-----------|-----|
| **STARTING_HEAD (F10.5.0 land)** | `9ce8cb2758f182fc51fd331acb641b2cdff3b10a` |
| **FINAL_HEAD (F10.5.0.1)** | `f52afca5346d2b6340cefe3e9655b895bc9f405e` |

## F10.5.0.1 micro-closure status

| Field | Value |
|-------|-------|
| **RFRF_F10_5_0_1_FINAL_MICRO_CLOSURE** | **PASS** (structural/transactional/rebaseline/PG/cross-workstream/tooling) — **merge gate blocked** until i18n authority label (see CI) |
| **READY_TO_MERGE_F10_5_0** | **NO** until `i18n-governance-authority-change` applied by trusted actor `FATIHS-MGCKS` on PR #1691 |
| **READY_FOR_STAGE3_AUTHORIZATION_GATE** | **YES** (with observational readiness **NO**; Stage 3 **not** authorized here) |
| **STAGE_3_EXECUTED** | NO |
| **STAGE_3_START_AUTHORIZED** | NO |

### CI (PR #1691 @ `f52afca5346d2b6340cefe3e9655b895bc9f405e`)

| Metric | Value |
|--------|-------|
| **CI_TOTAL** | 29 |
| **CI_SUCCESS** | 28 |
| **CI_FAILURE** | 1 |
| **CI_PENDING** | 0 |
| **Failed check** | `i18n-authority-protection` — `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` on `.github/workflows/rfrf-stage3-persistence-readiness.yml` |
| **Owner action** | Trusted actor applies label `i18n-governance-authority-change` (Layer-0 `labeled` event); re-run is automatic |
| **RFRF Stage-3 persistence workflow** | Run `35385459930` — **SUCCESS** (F3/F4/F9 isolated PG+Redis + F10 operational gate + final check) |
| **Stale blocker removed** | `KNOWN_P1_STAGE3_BLOCKERS=CI pending` is **obsolete** (was true before 28/28 on `9ce8cb275…`; superseded by i18n merge gate) |

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
| **Cutover** | `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=2026-09-18T10:25:41.000Z` (unchanged) |
| **Candidates / fallback VEE** | 0 / 0 |
| **Live preflight** | PASS (`RFRF_REQUIRED_GIT_SHA=0384adf12bbb1407eb8e291726d3dac60323b8b6`) — re-verified read-only **2026-09-18T19:55Z** |
| **Replicas** | Runtime git SHA `0384adf12bbb1407eb8e291726d3dac60323b8b6` on current release; **MIXED_RUNTIME=NO** |

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

| **RFRF_F3_F2_HANDOFF_REAL_PG** | PASS (CI workflow run `35385459930`) |
| **RFRF_F4_PR2_RUNTIME_REAL_PG** | PASS |
| **RAW_REFUEL_CANDIDATE_REAL_PG** | PASS |
| **RFRF_F9_MULTI_REPLICA_REAL_PG_REDIS** | PASS |
| **CANDIDATE_REAL_PG_TESTS** | PASS |
| **MULTI_REPLICA_CANDIDATE_SAFETY** | PASS |
| **Required tests skipped** | NONE |

## Stage-2 observation

| Field | Value |
|-------|-------|
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE2** | NO |
| **STAGE3_OBSERVATIONAL_READINESS** | NO |

## POST–Stage-3 acceptance (future execution)

Unchanged — see prior F10.5.0 section in KG changelog / EED-EV-0069 registry row.

## Local validation (agent, F10.5.0.1)

| Gate | Result |
|------|--------|
| Stage 3 authority matrix | PASS |
| Stage 3 transaction safety | PASS |
| Stage 3 rollback fixtures (`STAGE3_ROLLBACK_TO_STAGE2_SAFE=YES`) | PASS |
| Module registry validator | PASS |
| Isolated PG gates on agent VM | N/A (no local PostgreSQL) — proven in CI workflow |
| **KNOWN_P0_STAGE3_BLOCKERS** | **NONE** |
| **KNOWN_P1_STAGE3_BLOCKERS** | i18n Layer-0 authority label required for new workflow file (expected; not RFRF structural) |
| **KNOWN_P2_STAGE3_NOTES** | `STAGE3_OBSERVATIONAL_READINESS=NO` — epistemic only |
