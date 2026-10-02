# RFRF F10.3.2 — Stage-1 Production execution

**Evidence ID:** EED-EV-0066  
**Class:** PRODUCTION / OPS  
**Date:** 2026-09-18  
**Execution window (UTC):** 2026-09-18T10:25:37Z … 2026-09-18T10:31:07Z (4-tick observation through natural coordinator ticks)

## Summary

| Field | Value |
|-------|-------|
| **RFRF_F10_3_2_STAGE1_EXECUTION** | PASS |
| **STAGE1_EXECUTION_ACCEPTED** | YES |
| **STAGE_2_START_AUTHORIZED** | NO |

Authorized Stage **0 → 1** Production mutation completed. Only `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` was persisted. All RFRF boolean authorities remained **OFF**. Rolling restart replica A then B at unchanged runtime SHA. No code deploy, no symlink promotion, no migrations.

## Tooling vs Production runtime (intentional split)

| Role | SHA / ID |
|------|-----------|
| **TOOLING_SHA** (ops scripts on VPS checkout) | `421cd96114b1f7745f7e78478e022a47291f068c` |
| **PRODUCTION_RUNTIME_SHA** (`/opt/synqdrive/current`) | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **PRODUCTION_RELEASE** | `20260918085306_v4994` |

Tooling at `421cd961…` (F10.3.0.2 merged on main) executed against Production runtime `ca7bad…` without deploying tooling SHA to Production.

## Stage and cutover

| Field | Value |
|-------|-------|
| **PRE_STAGE** | 0 |
| **POST_STAGE** | 1 |
| **CUTOVER_GENERATED_AT** | `2026-09-18T10:25:41.000Z` |
| **CUTOVER_AT** (`RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`) | `2026-09-18T10:25:41.000Z` |
| **CUTOVER_AGE_AT_MUTATION_SECONDS** | 48 |
| **BACKEND_ENV_ONLY_EXPECTED_STAGE1_DELTA** | YES |
| **STAGE1_CUTOVER_AGE_ACCEPTED** | YES |
| **STAGE2_BOUNDARY_AUDIT_REQUIRED** | YES (non-blocking Stage-2 prerequisite) |

### Cutover boundary note (Stage-2 prerequisite)

Cutover was selected at `2026-09-18T10:25:41.000Z`; Stage-1 mutation completed with **48s** elapsed before env write + rolling restart. Stage 1 activated **no** RFRF business processing; `raw_refuel_candidates` and fallback VEE counts remained zero. This does **not** reinterpret Stage 1 as failed.

Before Stage 2 master-detector activation, operators must perform an explicit **boundary audit** for telemetry/events in the 48-second interval between cutover selection and committed mutation.

## RFRF boolean authorities (unchanged OFF)

Post Stage 1, all remained false/absent:

- `RAW_FUEL_REFUEL_FALLBACK_ENABLED`
- `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED`
- `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED`
- `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED`
- `RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED`

## Business non-activation

| Metric | PRE | POST |
|--------|-----|------|
| **RAW_REFUEL_CANDIDATE_COUNT** | 0 | 0 |
| **FALLBACK_VEE_COUNT** (`SYNQDRIVE_RAW_FUEL_FALLBACK`) | 0 | 0 |
| **STAGE1_BUSINESS_PROCESSING_ENABLED** | — | NO |

No convergence, promotion, or G2 fallback handoff.

## Transaction and runtime

| Field | Value |
|-------|-------|
| **STAGE1_TRANSACTION_COMMITTED** | YES |
| **STAGE1_FINAL_STATE** | STAGE1 |
| **RFRF_STAGED_ENABLEMENT** | PASS |
| **AUTOMATIC_RECOVERY_INVOKED** | NO |
| **STAGE1_RECOVERY_FAILED** | NO |
| **ROLLING_RESTART_A** | YES |
| **ROLLING_RESTART_B** | YES |

| Preservation | Result |
|--------------|--------|
| Production release | unchanged (`20260918085306_v4994`) |
| Production runtime SHA | unchanged (`ca7bad…`) |
| `/opt/synqdrive/current` symlink | unchanged |
| Application deploy | NO |
| Migrations | NO |

Post-restart scheduler: **A = LEADER**, **B = FOLLOWER**, **leaders = 1**. Redis/worker readiness **PASS**. Nginx dual upstream **PASS**.

Live preflight at execution: `RFRF_PRODUCTION_PREFLIGHT=PASS`, `DEPLOY_GIT_SHA_MATCH=YES`, `REDIS_WORKER_READINESS_GATE=PASS`, Prometheus targets A/B up, F8 alerts live loaded.

PRE/POST cross-workstream snapshot inside enable-stage transaction: **23/23** fields, `PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES`, `POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES`, `IMMEDIATE_RESTART_SURVIVAL_GATE=PASS`.

## EXP-021 cross-workstream

| Field | Value |
|-------|-------|
| **EXP021_IMMEDIATE_SURVIVAL_GATE** | PASS |
| **EXP021_POST_EXECUTION_4_TICK_SURVIVAL_GATE** | PASS |
| **EXP021_POST_RESTART_NATURAL_TICKS** | 7 (≥4 required; ~45s coordinator interval) |
| **FOLLOWER_OBSERVATION_COUNT** | 0 |
| **MULTI_LEADER_PRESENT** | NO |
| **DUPLICATE_TICK_FOR_SAME_INTERVAL** | NO |
| **FRESHNESS_PROVENANCE_OBSERVED** | YES |

| Entity | PRE | POST |
|--------|-----|------|
| Studies | 1 | 1 |
| Enrollments | 1 | 1 |
| StudyRuns | 0 | 0 |
| Global balances | 0 | 0 |
| Vehicle balances | 0 | 0 |

Coordinator remained **enabled** + **dry_run=true**. No automatic execution (no new StudyRun, capture, recording, lifecycle execution, or execution lock).

## VDC cross-workstream

| Field | Value |
|-------|-------|
| **PRE_VDC_AUTHORITY_MODE** | LEGACY |
| **POST_VDC_AUTHORITY_MODE** | LEGACY |
| **PRE_VDC_PILOT_SCOPE_COUNT** | 4 |
| **POST_VDC_PILOT_SCOPE_COUNT** | 4 |
| **VDC_PILOT_WINDOW_START** | `2026-09-18T09:33:25.000Z` |
| **POST_VDC_PILOT_T0_UNCHANGED** | YES |
| **VDC_IMMEDIATE_SURVIVAL_GATE** | PASS |
| **VDC_POST_EXECUTION_SURVIVAL_GATE** | PASS |

| Shadow observations | PRE | POST | FINAL |
|---------------------|-----|------|-------|
| Total | 6 | 6 | 6 |
| New epoch (`observedAt ≥` pilot T0) | 0 | 0 | 0 |
| New-epoch correctness blockers | 0 | 0 | 0 |

**VDC seven-day clock:** The absence of a new-epoch shadow observation at Stage-1 execution time does **not** prove completion of the independent seven-day VDC operational window (`2026-09-18T09:33:25.000Z` → `2026-09-25T09:33:25.000Z`). That clock remains running. **Do not** claim VDC P2.5 seven-day completion from this evidence.

## Evidence hygiene

| Field | Value |
|-------|-------|
| **EXECUTION_HELPER_COMMITTED** | NO |
| **SECRETS_COMMITTED** | NO |

Operator-local execution helpers and raw external logs were **not** committed. This artifact distills non-secret authoritative facts only (no `backend.env` contents, credentials, or database URLs).

## External references (not in git)

Execution agent stored raw logs outside the repository (e.g. under cloud-agent artifacts). Governance landing uses distilled facts above; independent review may correlate with those external logs if retained by operators.

## Classification

| Field | Value |
|-------|-------|
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO (Stage 1 env cutover only) |
| PRISMA_SCHEMA_CHANGED | NO |
| PRODUCTION_MUTATED (this PR) | NO |
| STAGE_1_EXECUTED | YES (recorded 2026-09-18) |
| STAGE_2_START_AUTHORIZED | NO |

## Related evidence

- EED-EV-0065 — F10.3.0 / F10.3.0.2 Stage-1 tooling + fail-closed cross-workstream gates (execution **not** performed)
- EED-EV-0064 — F10.2 live preflight closure (prior Production baseline; superseded for runtime SHA by `ca7bad…` at Stage-1 execution)
