# RFRF F10.4.2 — Stage-2 Production execution

**Evidence ID:** EED-EV-0068  
**Class:** PRODUCTION / OPS  
**Date:** 2026-09-18  
**Execution window (UTC):** 2026-09-18T16:58:31Z … 2026-09-18T16:59:12Z (rolling restart + cross-workstream gates); EXP-021 natural-tick observation extended through ~17:06Z  

## Summary

| Field | Value |
|-------|-------|
| **RFRF_F10_4_2_STAGE2_EXECUTION** | PASS |
| **STAGE_2_EXECUTION_ACCEPTED** | YES |
| **STAGE_3_START_AUTHORIZED** | NO |
| **STAGE_3_EXECUTED** | NO |
| **REAL_RAW_RISE_OBSERVED_UNDER_STAGE2** | NOT_PROVEN |

Authorized Stage **1 → 2** Production mutation completed. Only **`RAW_FUEL_REFUEL_FALLBACK_ENABLED=true`** was added. Persist, convergence, promotion, and G2 handoff authorities remained **OFF**. **`RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`** unchanged at `2026-09-18T10:25:41.000Z`. Rolling restart replica A then B at unchanged runtime SHA. No application deploy, no release symlink change, no migrations.

**Maturity:** PROVEN_IN_PRODUCTION for Stage-2 rollout authority, transaction safety, cross-workstream survival, and master-only boundary — **not** for observing a real raw-fuel rise event in Production.

## Tooling vs Production runtime (intentional split)

| Role | SHA / path |
|------|------------|
| **TOOLING_SHA_USED** | `b73d5cb2a81c7920691b8ab544909ab3a3666d70` (merged main #1688) |
| **TOOLING_EXECUTION_ROOT** | `/tmp/rfrf-f1042-tooling` (isolated ops bundle on VPS; **not** deployed into `/opt/synqdrive/current`) |
| **TOOLING_BUNDLE_DESTINATION** | `/tmp/rfrf-f1042-tooling/backend/scripts/ops/` |
| **PRODUCTION_RUNTIME_SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **PRODUCTION_RELEASE** | `20260918085306_v4994` |
| **PRODUCTION_CURRENT_LINK** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260918085306_v4994` |

Stage 2 executed:

```bash
sudo env SYNQDRIVE_CURRENT_LINK=/opt/synqdrive/current \
  RFRF_REQUIRED_GIT_SHA=ca7bad8826871376a58efaa874f12992b88c4a04 \
  RFRF_STAGE=2 RFRF_ROLLOUT_ACK=YES \
  bash /tmp/rfrf-f1042-tooling/backend/scripts/ops/rfrf-production-enable-stage.sh
```

Preflight and enable-stage **read** Production via `SYNQDRIVE_CURRENT_LINK`; **mutated** only `/opt/synqdrive/shared/backend.env` + PM2 rolling restart at the **existing** release tree.

### Tooling provenance hygiene (F10.4.3 read-only inspection)

| Field | Value |
|-------|-------|
| **PRODUCTION_RELEASE_SYMLINK_CHANGED_BY_STAGE2** | NO |
| **APPLICATION_DEPLOY_PERFORMED** | NO |
| **PRODUCTION_RUNTIME_SHA_CHANGED** | NO |

**Production release git worktree** (`git -C /opt/synqdrive/current status --porcelain --untracked-files=all`, 2026-09-18 post-Stage-2):

| Path | Classification |
|------|----------------|
| `?? backend/scripts/ops/_exp021-counts-tmp.cjs` | Ad-hoc ops/read-only helper (tooling); **not** Stage-2 enable bundle |
| `?? backend/scripts/ops/tesla-phase-a-zero-baseline-readonly.cjs` | Read-only ops script (tooling) |
| `?? backend/scripts/ops/tesla-premium-phase-a-pre-t0-readonly.cjs` | Read-only ops script (tooling) |
| `?? backend/uploads/` | Runtime upload directory (untracked tree) |

| Field | Value |
|-------|-------|
| **PRODUCTION_RUNTIME_WORKTREE_CLEAN** | NO (untracked paths present) |
| **Stage-2 rsync target** | `/tmp/rfrf-f1042-tooling` only — **did not** write merged F10 ops into the release checkout |

Do **not** claim “Production runtime worktree pristine”; claim **Stage 2 did not promote a new release SHA or modify tracked application source for RFRF tooling**.

## Prior gates (reference)

| Workstream | Result |
|------------|--------|
| **F10.4.1** Stage-2 authorization read-only gate | PASS → `READY_FOR_STAGE2_EXECUTION=YES` |
| **F10.4.1A** VDC epoch metric reconciliation | PASS — reported `72` blockers was all-time count mislabel; canonical post-T0 pilot blockers **67** |

## Stage and authority matrix

| Field | PRE (Stage 1) | POST (Stage 2) |
|-------|---------------|----------------|
| **RFRF stage** | 1 | 2 |
| **`RAW_FUEL_REFUEL_FALLBACK_ENABLED`** | false/absent | **true** |
| **`RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED`** | false/absent | false/absent |
| **`RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED`** | false/absent | false/absent |
| **`RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED`** | false/absent | false/absent |
| **`RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED`** | false/absent | false/absent |
| **`RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`** | `2026-09-18T10:25:41.000Z` | **unchanged** |

| Field | Value |
|-------|-------|
| **STAGE2_CUTOVER_UNCHANGED** | YES |

### Stage-2 semantic boundary (master-only)

| Reachability | Answer |
|--------------|--------|
| Raw detector / dark execution authority | YES (`RAW_FUEL_REFUEL_FALLBACK_ENABLED=true`) |
| Candidate persistence | NO |
| Fallback VEE creation | NO |
| Convergence | NO |
| Promotion | NO |
| G2 handoff | NO |

**Epistemic rule:** Stage 2 proves **detector execution authority is ON** and downstream flags remain OFF. It does **not** prove a real raw-fuel rise was detected or processed in Production unless independently evidenced (none in this execution).

## Transaction, backup, recovery

| Field | Value |
|-------|-------|
| **STAGE2_ENABLE_EXIT_CODE** | 0 |
| **GENERIC_STAGE_TRANSACTION** | YES |
| **PRE_STAGE** | 1 |
| **TARGET_STAGE** | 2 |
| **RECOVERY_ARMED_BEFORE_FIRST_MUTATION** | YES |
| **BACKUP_CHECKSUM_VERIFIED** | YES |
| **STAGE2_TRANSACTION_COMMITTED** | YES |
| **TX_COMMITTED** | YES |
| **RFRF_STAGED_ENABLEMENT** | PASS |
| **AUTOMATIC_RECOVERY_INVOKED** | NO |
| **RECOVERY_FAILED** | NO |

Rolling restart at **`ca7bad…`**; post-restart scheduler **3001=FOLLOWER**, **3002=LEADER**, **leaders=1**. Post live preflight: **`CURRENT_STAGE=2`**, `RFRF_FLAG_MASTER=true`.

## Business counts (non-activation of persist / VEE)

| Metric | PRE | POST |
|--------|-----|------|
| **RAW_REFUEL_CANDIDATE_COUNT** | 0 | 0 |
| **FALLBACK_VEE_COUNT** (`SYNQDRIVE_RAW_FUEL_FALLBACK`) | 0 | 0 |

| Field | Value |
|-------|-------|
| **DATABASE_SCHEMA_CHANGED** | NO |
| **MIGRATIONS_RUN** | NO |

## EXP-021 cross-workstream

| Field | Value |
|-------|-------|
| **EXP021_IMMEDIATE_SURVIVAL_GATE** | PASS (PRE/POST 23-field snapshot; config + business counts unchanged) |
| **EXP021_CONFIG_CHANGED_BY_STAGE2** | NO |
| **EXP021_BUSINESS_DATA_CHANGED_BY_STAGE2** | NO |
| **EXP021_AUTO_EXECUTION_UNEXPECTED** | NO |

### Post-restart coordinator ticks (timing nuance)

| Observation | Value |
|-------------|-------|
| **In-orchestrator first poll** | `EXP021_POST_RESTART_4_TICK_SURVIVAL_GATE=OBSERVE_INCOMPLETE` (grep heuristic too early / noisy) |
| **Final evidence** | Leader replica (`synqdrive-b`) log analysis: **`EXP021_FLEET_DRY_RUN_OBSERVATION`** lines ≥ **10** after restart (≥4 required) |
| **EXP021_POST_RESTART_4_TICK_SURVIVAL_GATE (final)** | PASS |

The audit narrative **preserves** the initial OBSERVE_INCOMPLETE result; final PASS is from **later natural-tick log evidence**, not by rewriting the first poll.

## VDC cross-workstream (structural survival — not scientific PASS)

| Field | PRE | POST |
|-------|-----|------|
| **Authority** | LEGACY | LEGACY |
| **Pilot scope count** | 4 | 4 |
| **Operational pilot T0** | `2026-09-18T09:33:25.000Z` | unchanged |
| **Total shadow observations** | 73 | 73 |
| **Canonical epoch observations** (`observed_at >= T0`, 4 pilot scopes) | 67 | 67 |
| **Canonical epoch correctness blockers** | 67 | 67 |

| Field | Value |
|-------|-------|
| **VDC_EPOCH_RESET** | NO |
| **VDC_ROWS_DELETED** | NO |
| **RFRF_STAGE2_RESTART_RESET_OR_WORSENED_VDC_STRUCTURE** | NO |

### F10.4.1A caveat (pre-existing scientific condition)

All **67** canonical post-T0 pilot comparisons are **`UNEXPLAINED_OLD_REJECT_NEW_ACCEPT`** with **`correctness_blocking=true`**. This predates Stage 2 (F10.4.1A reconciliation). Stage 2 **did not** create, reset, hide, or repair this condition.

| Claim | Allowed |
|-------|---------|
| VDC seven-day operational completion | **NO** |
| VDC scientific correctness PASS | **NO** |
| VDC structural / epoch / scope preservation across Stage 2 restart | **YES** |

## Stage 3 boundary

Stage **3** (candidate persistence) is **not** authorized by this evidence. Next planned workstream: **F10.5** Stage-3 candidate-persistence readiness / authorization.

## Artifacts

| Artifact | Location |
|----------|----------|
| Execution transcript | `/opt/cursor/artifacts/rfrf-f1042-stage2-execution-transcript.log` (Cloud Agent) |
| Final execution report | `/opt/cursor/artifacts/rfrf-f1042-stage2-final-report.txt` |
| F10.4.1 authorization | `/opt/cursor/artifacts/rfrf-f1041-stage2-final-auth-gate-report.txt` |
| F10.4.1A VDC reconciliation | `/opt/cursor/artifacts/rfrf-f1041a-vdc-epoch-reconciliation-report.txt` |

## Related evidence

- **EED-EV-0067** — Stage-2 transaction / recovery tooling (not Production execution)  
- **EED-EV-0066** — Stage-1 Production execution  
- **VDC-EVID** — P2.5 pilot; seven-day clock still running  
