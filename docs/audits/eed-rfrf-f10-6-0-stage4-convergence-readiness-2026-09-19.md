# RFRF F10.6.0 — Stage-4 convergence readiness + transaction safety

**Evidence ID:** EED-EV-0071  
**Class:** OPS / READINESS (no Production Stage 4 execution)  
**Date:** 2026-09-19  
**Prior Production execution:** EED-EV-0070 (Stage 3)  
**Repository baseline:** `3d4d1ee6fe96964b4511908b7b3bbadeb2d7b148` (#1693 ancestry verified)

## Executive summary

| Field | Value |
|-------|-------|
| **RFRF_F10_6_0_STAGE4_CONVERGENCE_READINESS** | PASS (tooling + tests + read-only Production rebaseline) |
| **PRODUCTION_REBASELINE_ACCEPTED** | **YES** (F10.6.0.1 — see below) |
| **PRODUCTION_REBASELINE_REQUIRED** | **NO** |
| **STAGE_4_EXECUTED** | NO |
| **STAGE_4_START_AUTHORIZED** | NO |
| **READY_FOR_STAGE4_AUTHORIZATION_GATE** | YES (structural; observational maturity still NO) |

Stage **4** means **`RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED=true`** with master + persist true, promotion/G2 false, cutover unchanged. This mission added Stage-4 dry-run markers, authority matrix + transaction/recovery fixtures, rollback `--from-stage 4` closure, and CI PG/Redis convergence gates — **without** mutating Production authorities.

## Production rebaseline (read-only)

| Field | EED-EV-0070 baseline | **Current (this audit)** |
|-------|----------------------|---------------------------|
| **CURRENT_PRODUCTION_RELEASE_ID** | `20260918174845_v4994` | **`20260918232713_v4994`** |
| **CURRENT_PRODUCTION_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` | **`16000fce6b240e8762941e396ef9628526bcd0dc`** |
| **REPLICA_A/B SHA** | `0384adf…` | **`16000fce6…` (both)** |
| **MIXED_RUNTIME** | NO | **NO** |

Deploy drift is consistent with post–#1692 application release on VPS; **RFRF Stage-3 env flags were re-verified** on current runtime (not re-executed).

### F10.6.0.1 — Production rebaseline acceptance (`0384adf…` → `16000fce6…`)

| Field | Value |
|-------|-------|
| **RFRF_BUSINESS_RUNTIME_DIFF_0384_TO_16000** | **EMPTY** (no paths under `raw-fuel-refuel-fallback`, `raw-refuel-candidate`, or RFRF runtime services) |
| **VDC_RUNTIME_DIFF_0384_TO_16000** | **EMPTY** (no paths under `device-connection-physical-state`) |
| **Allowed deploy delta** | EXP-021 reference-capture modules + RFRF **ops/test/docs** only (#1692 + #1691 tooling on `main`; not Stage-4 business semantics) |

**Git commits between SHAs:** `5860b125` (RFRF F10.5.0 tooling/tests), `16000fce6` (EXP-021 PDI publish #1692).

**Module classification (30 changed paths):**

| Module | Paths | RFRF Stage-4 authority impact |
|--------|-------|-------------------------------|
| EXP-021 reference capture | 8 under `reference-capture/exp021-*` | Independent; cross-workstream gate PASS |
| RFRF ops / CI / audits | 22 (`backend/scripts/**`, workflows, EED docs) | Tooling only; not deployed business runtime on VPS |
| RFRF business runtime | **0** | Unchanged between Production SHAs |
| VDC runtime | **0** | Unchanged between Production SHAs |

**Read-only re-verify (F10.6.0.1 UTC):** replicas both `16000fce6…`; Stage **3**; master/persist true; convergence/promotion/G2 false/absent; cutover unchanged; live preflight **PASS**; fallback VEE **0**.

| Field | Value |
|-------|-------|
| **PRODUCTION_REBASELINE_ACCEPTED** | **YES** |
| **PRODUCTION_REBASELINE_REQUIRED** | **NO** |

Historical EED-EV-0070 execution facts (release `20260918174845_v4994`, SHA `0384adf…`, candidates 0 at execution time) remain **unchanged** as historical record.

### RFRF authority (Production `backend.env`)

| Flag | Value |
|------|-------|
| **CURRENT_RFRF_STAGE** | **3** (preflight `CURRENT_STAGE=3`) |
| **RAW_FUEL_REFUEL_FALLBACK_ENABLED** | true |
| **RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED** | true |
| **RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED** | false/absent |
| **RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED** | false/absent |
| **RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED** | false/absent |
| **RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT** | `2026-09-18T10:25:41.000Z` |

### Live preflight

```bash
sudo SYNQDRIVE_CURRENT_LINK=/opt/synqdrive/current \
  RFRF_REQUIRED_GIT_SHA=16000fce6b240e8762941e396ef9628526bcd0dc \
  BACKEND_ENV=/opt/synqdrive/shared/backend.env \
  bash …/rfrf-production-preflight.sh --check --live-required
```

| Field | Value |
|-------|-------|
| **LIVE_PREFLIGHT** | **PASS** (`RFRF_PRODUCTION_PREFLIGHT=PASS`) |

### Stage-4 Production dry-run (zero mutation)

| Field | Value |
|-------|-------|
| **STAGE4_DRY_RUN_ZERO_MUTATION** | PASS |
| **STAGE4_DRY_RUN_TRANSITION** | 3→4 |
| **STAGE4_DRY_RUN_RESTART_CALLS** | 0 |
| **BACKEND_ENV_BYTE_IDENTICAL_AFTER_DRY_RUN** | YES (SHA256 unchanged) |

Wrong-source rollback `DRY_RUN=1 --from-stage 4` while env is Stage **3**: **BLOCKED** (`STAGE4_ENV_VERIFY=FAIL`, zero mutation).

## Stage-4 semantic boundary (code)

**Convergence-only (Stage 4)** — proven from `RawRefuelConvergenceService` + runtime orchestration:

| Question | Answer |
|----------|--------|
| **A. Allowed mutations** | Raw refuel **candidate** row lifecycle/metadata linking to authoritative **native** VEE id when evaluation says SAME native; **no** fallback `VehicleEnergyEvent` insert |
| **B. Lifecycle entry** | Candidates that pass readiness (`evaluateRawRefuelCandidateReadiness`); not REJECTED terminal paths |
| **C. Native sibling outcomes** | SAME / INSUFFICIENT / foreign-only / none / ambiguous overflow — via `evaluateRawRefuelNativeFallbackConvergence` |
| **D. Edge cases** | PROMOTED → fail-closed; CONVERGED_NATIVE → idempotent ALREADY_CONVERGED; concurrent → PG advisory lock + `FOR UPDATE` transaction in F5-PR1/F9 proofs |
| **E. Stage 4 cannot** | Create fallback VEE (promotion service + `evaluateFallbackPromotionAuthority`); mark PROMOTED; enqueue G2; mutate canonical native VEE fields |

| Reachability | Stage 4 |
|--------------|---------|
| Raw detector | YES |
| Candidate persist | YES |
| Convergence | YES |
| Fallback VEE | **NO** |
| Promotion | **NO** |
| G2 handoff | **NO** |

**STAGE4_CONVERGENCE_ONLY_BOUNDARY=PASS** (code + unit tests + CI PG matrix P20 / F5-PR1 / F9).

## Observational maturity (honest)

| Field | Value |
|-------|-------|
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE3** | **NO** |
| **REAL_STAGE3_CANDIDATE_PERSISTENCE_PROVEN** | **NO** (unchanged epistemic gate; 3 live rows noted under count only) |
| **STAGE3_CANDIDATE_COUNT** | **3** (read-only F10.6.0.1; natural rows after Stage 3 enablement) |
| **STAGE3_CANDIDATE_LIFECYCLE_BREAKDOWN** | SETTLING×2, INSUFFICIENT×1 (vehicles under configured VDC pilot org) |
| **STAGE4_OBSERVATIONAL_READINESS** | **NO** |
| **Classification** | **Epistemic P2** — `REAL_RAW_RISE_OBSERVED_UNDER_STAGE3` remains **NO**; formal positive-path observational proof not upgraded in this evidence (see EED-EV-0070 policy) |

## Blast radius

| Field | Value |
|-------|-------|
| **STAGE4_EXISTING_CANDIDATE_BLAST_RADIUS** | **BOUNDED** (3 rows; convergence at Stage 4 would evaluate per readiness — no promotion/G2/fallback VEE paths) |

## Tooling / tests

| Gate | Result |
|------|--------|
| **STAGE4_TRANSACTION_TOOLING_READY** | YES |
| **STAGE4_ROLLBACK_TO_STAGE3_SAFE** | YES (fixtures + rollback script marker) |
| **STAGE4_RECOVERY_TARGET_STAGE** | 3 |
| **STAGE4_MIXED_AUTHORITY_PREVENTED** | YES (rollback fixtures) |
| **STAGE4_CONVERGENCE_REAL_PG** | **PASS** (GitHub `rfrf-stage4-convergence-readiness` @ PR #1695 head `2a29a76…`, run 35409974783) |
| **STAGE4_MULTI_REPLICA_CONVERGENCE_SAFETY** | **PASS** (same CI job — F9 harness) |

Local fixture scripts: `rfrf-f10-stage4-{authority-matrix,transaction-safety,rollback-fixture}-tests.sh`; operational gate extended.

### CI completion (PR #1695 @ `2a29a76bad1b1c0869cbf1c82ee8aeb03a6ea24d`)

| Check | Result |
|-------|--------|
| **rfrf-stage4-convergence-readiness** | **PASS** (~26m43s) |
| **rfrf-stage3-persistence-readiness** | **PASS** (~27m35s) |
| **validate-module-registry** | **PASS** |
| **i18n-new-debt-gate** | **PASS** |
| **i18n-authority-protection** | **FAIL** (new workflow file; requires trusted `i18n-governance-authority-change` label) |
| **CI gate (all critical jobs)** | **PASS** (both workflow matrices) |
| **Migration / Backend integration / boundary repair PostgreSQL** | **PASS** |

## Cross-workstream

### EXP-021 (PR #1694 not touched)

| Field | Value |
|-------|-------|
| **EXP021_CROSS_WORKSTREAM_GATE** | **PASS** (read-only) |
| **EXP021_ACTIVE_CAPTURE_PRESENT** | **NO** (`EXP021_LEDGER_NONTERMINAL=0`; no tmux/execute operator) |
| **Studies / enrollments / runs** | 1 / 1 / 1 |

Ledger table on current DB: `exp021_canary_live_window_activation_ledgers` (post–#1692 schema).

### VDC (canonical post-T0 population + configured scopes)

**Metric semantics (F10.6.0.1):**

| Field | Definition |
|-------|------------|
| **VDC_PILOT_SCOPE_COUNT** / **VDC_CONFIGURED_PILOT_SCOPE_COUNT** | Count of tuples in `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON` |
| **VDC_CANONICAL_ACTIVE_VEHICLE_COUNT** | Distinct `(organization_id, vehicle_id)` with shadow observations where `observed_at >= T0` |

| Field | Value |
|-------|-------|
| **VDC_CROSS_WORKSTREAM_GATE** | **PASS** |
| **VDC_AUTHORITY_MODE** | **LEGACY** (authority cutover / side-effects env keys absent) |
| **VDC_PILOT_T0** | `2026-09-18T09:33:25.000Z` |
| **VDC_CONFIGURED_PILOT_SCOPE_COUNT** | **4** |
| **VDC_PILOT_SCOPE_COUNT** | **4** (same as configured — do not conflate with observation count) |
| **VDC_CONFIGURED_PILOT_SCOPES** | 4× `(org faa710c9…, vehicle ×4, provider DIMO)` — see Production env JSON |
| **VDC_CANONICAL_ACTIVE_VEHICLE_COUNT** | **3** (fourth configured pilot vehicle has **no** rows in canonical post-T0 window yet) |
| **VDC_CANONICAL_EPOCH_OBSERVATIONS** | **107** |
| **VDC_CANONICAL_EPOCH_BLOCKERS** | **107** |
| **VDC_CONFIGURED_SCOPE_DRIFT** | **NO** (configured count remains 4; active observation count 3 is not scope drift) |

## Observability

| Field | Value |
|-------|-------|
| **METRIC_IMPLEMENTATION_PRESENT** | **YES** (`synqdrive_rfrf_convergence_*` counters in metrics service) |
| **LIVE_METRIC_EXPOSITION_PRESENT** | **NO_EVENT_ZERO_SERIES_NOT_EXPOSED** — live scrape ~764B; no convergence series at zero invocations under Stage 3 |

## Explicit non-actions

- No Production Stage 4 execution, flag mutation, restart, deploy, migrations, backfill, manual VEE, promotion, or G2 enablement  
- No edits to PR #1694 / EXP-021 runtime  
- No RFRF business runtime semantic changes in this PR  

## Related evidence

- EED-EV-0052 / 0053 / 0054 — F5 convergence design  
- EED-EV-0056 — promotion boundary  
- EED-EV-0058 — G2 boundary  
- EED-EV-0062 — multi-replica closure  
- EED-EV-0070 — Stage 3 Production execution  
