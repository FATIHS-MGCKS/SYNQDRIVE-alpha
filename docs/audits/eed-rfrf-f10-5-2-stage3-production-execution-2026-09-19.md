# RFRF F10.5.2 — Stage-3 Production execution

**Evidence ID:** EED-EV-0070  
**Class:** PRODUCTION / OPS  
**Date:** 2026-09-19 (evidence landing); execution UTC **2026-09-18T23:09:14Z** … **~23:09:48Z**  
**Prior readiness:** EED-EV-0069 (F10.5.0 / F10.5.0.1)  
**Authorization gate:** F10.5.1 read-only (`READY_FOR_STAGE3_EXECUTION=YES`)

## Summary

| Field | Value |
|-------|-------|
| **RFRF_F10_5_2_STAGE3_EXECUTION** | PASS |
| **STAGE_3_EXECUTION_ACCEPTED** | YES |
| **STAGE3_AUTHORITY_TRANSITION_PROVEN** | YES |
| **REAL_RAW_RISE_POSITIVE_PATH_PROVEN_UNDER_STAGE3** | NO |
| **REAL_STAGE3_CANDIDATE_PERSISTENCE_PROVEN** | NO (authority enables persistence; no natural candidate row yet) |
| **STAGE_4_START_AUTHORIZED** | NO |
| **STAGE_4_EXECUTED** | NO |

Authorized Production Stage **2 → 3** completed. **`RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED=true`** added alongside existing master authority. Convergence, promotion, and G2 handoff remained **OFF**. **`RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`** unchanged at `2026-09-18T10:25:41.000Z`. Rolling restart replica A then B at unchanged runtime SHA. No application deploy, no release symlink change, no migrations.

**Maturity:** `PROVEN_IN_PRODUCTION` for Stage-3 **authority transition**, transaction safety, rolling restart, and cross-workstream survival — **not** for observing a real raw-fuel rise or persisted candidate row in Production.

## Repository authority note (F10.5.3 landing)

| Field | Value |
|-------|-------|
| **Execution tooling pin** | `5860b125f7f6bf3cd0077cfa8a1253c13be341ba` (#1691 merged main) |
| **Expected main at F10.5.0 baseline** | `5860b125f7f6bf3cd0077cfa8a1253c13be341ba` |
| **Main at evidence-landing mission start** | `16000fce6b240e8762941e396ef9628526bcd0dc` (#1692 EXP-021 PDI publish — **not** Production deploy; Production runtime unchanged `0384adf…`) |

Evidence PR branches from current `main`; execution facts reference the **frozen tooling SHA** and **unchanged Production runtime SHA** above.

## Tooling vs Production runtime (intentional split)

| Role | SHA / path |
|------|------------|
| **TOOLING_SHA_USED** | `5860b125f7f6bf3cd0077cfa8a1253c13be341ba` |
| **TOOLING_EXECUTION_ROOT** | `/tmp/rfrf-f1051-tooling` → `/tmp/rfrf-f1051-tooling/backend/scripts/ops/` (isolated bundle on VPS) |
| **PRODUCTION_RUNTIME_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` |
| **PRODUCTION_RELEASE** | `20260918174845_v4994` |
| **PRODUCTION_CURRENT_LINK** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260918174845_v4994` |

Stage 3 executed:

```bash
sudo SYNQDRIVE_CURRENT_LINK=/opt/synqdrive/current \
  RFRF_REQUIRED_GIT_SHA=0384adf12bbb1407eb8e291726d3dac60323b8b6 \
  RFRF_STAGE=3 RFRF_ROLLOUT_ACK=YES \
  bash /tmp/rfrf-f1051-tooling/backend/scripts/ops/rfrf-production-enable-stage.sh
```

VPS transcript (not committed): `/tmp/rfrf-f1052-exec.log`

| Field | Value |
|-------|-------|
| **APPLICATION_DEPLOY_PERFORMED** | NO |
| **PRODUCTION_RUNTIME_SHA_CHANGED** | NO |
| **DATABASE_SCHEMA_CHANGED** | NO |
| **MIGRATIONS_RUN** | NO |

## Prior gates

| Workstream | Result |
|------------|--------|
| **F10.5.0 / F10.5.0.1** (#1691) | Stage-3 tooling + isolated PG/Redis proof (EED-EV-0069) |
| **F10.5.1** | Read-only authorization gate PASS; `READY_FOR_STAGE3_EXECUTION=YES` |
| **EXP-021 pre-execution** | Canary ledger terminal `TRIP_COMPLETED_SEEN`; no in-flight capture; no `--execute` enroll process |

## Stage and authority matrix

| Field | PRE (Stage 2) | POST (Stage 3) |
|-------|---------------|----------------|
| **RFRF stage** | 2 | 3 |
| **`RAW_FUEL_REFUEL_FALLBACK_ENABLED`** | true | true |
| **`RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED`** | false/absent | **true** |
| **Convergence / promotion / G2 env flags** | false/absent | false/absent |
| **`RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`** | `2026-09-18T10:25:41.000Z` | **unchanged** |

## Stage-3 runtime boundary (deployed semantics + live flags)

Verified on Production release `0384adf…` (same tree as pre-execution):

| Reachability | Result |
|--------------|--------|
| **STAGE3_RAW_DETECTOR_EXECUTION_REACHABLE** | YES (`master=true`) |
| **STAGE3_CANDIDATE_PERSISTENCE_REACHABLE** | YES (`persist=true`; `raw_refuel_candidates` table present) |
| **STAGE3_FALLBACK_VEE_REACHABLE** | NO (convergence/promotion/G2 false; runtime service gates promotion/convergence when unauthorized) |
| **STAGE3_CONVERGENCE_REACHABLE** | NO |
| **STAGE3_PROMOTION_REACHABLE** | NO |
| **STAGE3_G2_HANDOFF_REACHABLE** | NO |
| **STAGE3_PERSISTENCE_SCOPE** | GLOBAL (env-wide persist flag) |

## Transaction / recovery

| Field | Value |
|-------|-------|
| **RECOVERY_ARMED_BEFORE_FIRST_MUTATION** | YES |
| **STAGE3_RECOVERY_TARGET_STAGE** | 2 |
| **BACKUP_FILE** | `/opt/synqdrive/shared/backend.env.bak-rfrf-stage3-20260918230914` |
| **STAGE3_TRANSACTION_COMMITTED** | YES (`TX_COMMITTED=YES`, `STAGE3_ENABLE_EXIT_CODE=0`) |
| **AUTOMATIC_RECOVERY_INVOKED** | NO |
| **RECOVERY_FAILED** | NO |

## Rolling restart

| Field | Value |
|-------|-------|
| **REPLICA_A_POST_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` |
| **REPLICA_B_POST_SHA** | `0384adf12bbb1407eb8e291726d3dac60323b8b6` |
| **MIXED_RUNTIME_POST** | NO |
| **Scheduler convergence** | Exactly **1** leader after restart (A=LEADER, B=FOLLOWER) |

## Candidate / fallback VEE

| Metric | PRE | POST (execution) | POST (F10.5.3 re-verify) |
|--------|-----|------------------|---------------------------|
| **`raw_refuel_candidates`** | 0 | 0 | 0 |
| **Fallback VEE (`source_event_key` like `rfrf:%`)** | 0 | 0 | 0 |

| Field | Value |
|-------|-------|
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE3** | NO |
| **FALLBACK_VEE_BOUNDARY** | PASS (must remain 0 at Stage 3) |

## EXP-021 cross-workstream

| Field | Execution | F10.5.3 follow-up |
|-------|-----------|-------------------|
| **EXP021_CAPTURE_TERMINAL_BEFORE_STAGE3** | YES (`TRIP_COMPLETED_SEEN` ledger) | Still terminal (1 row) |
| **EXP021_IMMEDIATE_SURVIVAL_GATE** | PASS | Config/business counts stable (studies=1, enrollments=1, runs=1) |
| **EXP021_POST_STAGE3_NATURAL_TICK_PROOF** | WEAK at T+0 (0 log lines in short window) | **OBSERVABILITY_LIMITED** — `EXP021_FLEET_COORDINATOR_ENABLED=true`, `EXP021_FLEET_DRY_RUN=true`; **0** `EXP021_FLEET_DRY_RUN_OBSERVATION` lines in PM2 log buffer after 180s read-only poll; workers/readiness + live preflight PASS; no duplicate-tick evidence in logs |
| **EXP021_POST_STAGE3_NATURAL_TICK_COUNT** | — | 0 (log-buffer observable) |
| **EXP021_DUPLICATE_TICK_COUNT** | — | 0 |

Do **not** reactivate canary or rerun completed capture for tick proof.

## VDC cross-workstream

Canonical population: **4** pilot scopes; `observed_at >= 2026-09-18T09:33:25.000Z`.

| Field | PRE (execution snapshot) | POST (execution) | F10.5.3 re-verify |
|-------|--------------------------|------------------|-------------------|
| **Authority** | LEGACY | LEGACY | LEGACY |
| **Pilot scope count** | 4 | 4 | 4 |
| **Pilot T0** | `2026-09-18T09:33:25.000Z` | unchanged | unchanged |
| **Canonical epoch observations** | 107 | 107 | 107 |
| **Canonical epoch blockers** | 107 | 107 | 107 |

| Field | Value |
|-------|-------|
| **VDC_EPOCH_RESET** | NO |
| **VDC_ROWS_DELETED** | NO |
| **Blockers ≤ observations** | YES |

Counts may increase naturally after execution; hard invariants are authority/scope/T0 preservation and monotonicity.

## Post-execution live preflight (F10.5.3)

Read-only `rfrf-production-preflight.sh --check --live-required` with `RFRF_REQUIRED_GIT_SHA=0384adf…`:

| Field | Value |
|-------|-------|
| **LIVE_PREFLIGHT_EXIT_CODE** | 0 |
| **RFRF_PRODUCTION_PREFLIGHT** | PASS |
| **CURRENT_STAGE** | 3 |

## Explicit non-authorizations

- Stage **4** (convergence) **not** authorized or executed  
- Promotion, G2 handoff, fallback VEE creation **not** enabled  
- No candidate backfill or manual VEE creation  

## Related evidence

- **EED-EV-0068** — Stage-2 Production execution  
- **EED-EV-0069** — Stage-3 readiness tooling  
- **EED-EV-0070** — this record  
