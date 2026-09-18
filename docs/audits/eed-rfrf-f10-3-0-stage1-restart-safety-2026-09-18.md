# RFRF F10.3.0 — Stage-1 restart safety micro-closure

**Date:** 2026-09-18  
**Branch:** `cursor/rfrf-f10-3-0-stage1-restart-safety-f21f`  
**Base main:** `09a64cab25ea971f9d299ecd9dfa0da039eca5c2` (F10.2 evidence #1681 merged)  
**Production runtime (unchanged):** `3a2707b2966a4059478c1ac78f88451b9a50205d`

## Context

F10.2 final closure **PASS** (EED-EV-0064). Stage 1 planning may begin, but **Stage 1 has not been executed** in this workstream.

Stage 1 semantics:

- set `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` (operator-supplied UTC ISO only)
- keep **all** RFRF boolean authorities OFF
- rolling restart both Production replicas at the **same** runtime SHA (no code deploy)

## Failure window discovered (before fix)

Audit of `rfrf-production-enable-stage.sh` + `vps-production-replica.lib.sh`:

| Finding | Before fix |
|---------|------------|
| `CUTOVER_FILE_MUTATED_BEFORE_RESTART` | **YES** — backup then mutate env, then restart |
| `AUTO_RESTORE_BACKEND_ENV_ON_FAILURE` | **NO** |
| `AUTO_RESTART_BOTH_AFTER_ENV_RESTORE` | **NO** |
| `PARTIAL_PROCESS_ENV_STATE_POSSIBLE` | **YES** — shared env at Stage 1 while replica A restarted with new env and replica B still on old process env if B restart fails |

Preflight before mutation used `--check` only (not `--live-required`).

## Fix (operational tooling only)

| Change | Detail |
|--------|--------|
| Verified backup | `BACKEND_ENV_SHA256_BEFORE` + `BACKUP_SHA256` equality before mutation |
| Automatic recovery | On any post-mutation failure: restore backup (checksum verified), chmod 600, rolling-restart **both** replicas at same SHA, verify Stage 0, exit non-zero |
| Live preflight | Production enable requires `rfrf-production-preflight.sh --check --live-required` |
| Runtime SHA gate | `CURRENT_PRODUCTION_SHA` must equal `RFRF_REQUIRED_GIT_SHA` before mutation |
| Stage 1 contracts | Explicit cutover required; `STAGE1_BUSINESS_PROCESSING_ENABLED=NO`; EXP-021/VDC post-restart survival contracts documented |
| DRY_RUN | Zero mutation/restart; prints cutover, SHA, transition, restart + rollback plans |
| Fixture tests | `rfrf-f10-stage1-restart-safety-tests.sh` — 10 failure-injection cases |

### Recovery outputs (fail-closed)

- `STAGE_MUTATION_ROLLBACK_ATTEMPTED=YES|NO`
- `BACKEND_ENV_RESTORED=YES|NO`
- `REPLICA_ENV_CONVERGENCE_RESTORED=YES|NO`
- `STAGE1_FINAL_STATE=STAGE0|STAGE1|UNKNOWN`
- `STAGE1_RECOVERY_FAILED=YES` when automatic recovery itself fails

Never converts failed Stage-1 attempt into PASS.

## Cross-workstream restart safety

Pre/post snapshot hooks (`rfrf_capture_cross_workstream_snapshot`) capture EXP-021 + VDC env/DB invariants before Stage-1 mutation (execution-time observation contract documented; **not executed** in F10.3.0).

## Operator notes

- Stage 1 is **not** a deploy — operate only on `/opt/synqdrive/current` @ approved Production SHA.
- Use `sudo` with explicit env vars for production preflight/enable; avoid `sudo -E` (PM2_HOME false-negative).
- Do **not** set cutover implicitly inside the script — operator must supply `RFRF_CUTOVER_AT` immediately before invocation.

## Classification

| Field | Value |
|-------|-------|
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRISMA_SCHEMA_CHANGED | NO |
| PRODUCTION_MUTATED | NO |
| STAGE_1_EXECUTED | NO |
| STAGE_1_START_AUTHORIZED | NO |
| F10_2_COMPLETE | YES (unchanged) |

## Post-merge authorization gate (not yet satisfied)

After this PR merges, Stage 1 still requires:

1. Final operator authorization (explicit ACK + cutover timestamp)
2. Successful live preflight `--live-required` at execution time
3. Post-restart EXP-021 tick observation (4 ticks) + VDC survival checks per documented contracts

`READY_FOR_STAGE1_FINAL_AUTHORIZATION_AFTER_MERGE=YES` (tooling readiness only)

---

## F10.3.0.1 transaction / recovery micro-closure (2026-09-18)

Independent review blocking gaps corrected (ops tooling only):

| Finding | Fix |
|---------|-----|
| Recovery armed too late | `RECOVERY_ARMED=1` before first mutation; transaction states `PRE_MUTATION` → `RECOVERY_ARMED` → `MUTATED` → … → `COMMITTED`; idempotent single recovery handler |
| Non-atomic restore | Same-directory temp + `mv` promotion for upsert and restore; `BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES` |
| Snapshots not gates | Normalized PRE/POST state files; `rfrf_cross_workstream_immediate_gate` enforces EXP-021 config/data equality + VDC immutable/monotonic invariants before COMMIT |

### Signal / untrappable limits

- ERR, TERM, INT, HUP routed through single idempotent recovery path after recovery armed
- SIGKILL and host power loss documented as untrappable (`SIGKILL_LIMITATION_DOCUMENTED=YES`)
- Atomic same-filesystem rename minimizes partial-write exposure even on untrappable interruption

### Canonical VDC authority keys (Production #1679 / RB-019 P2.5)

**Enforced:** `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED`, `CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED`, `CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED`, `CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED`, `CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED`, `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON`, `CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS`, `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID`

**Obsolete (not enforced):** `DEVICE_CONNECTION_PHYSICAL_AUTHORITY_MODE`, `DEVICE_CONNECTION_PHYSICAL_SHADOW_COMPARE_ENABLED`, `DEVICE_CONNECTION_PHYSICAL_PILOT_ENABLED`

DB invariants: authority mode + pilot epoch fingerprint exact match; shadow observation count monotonic (POST ≥ PRE).

### Gate distinction

| Gate | When |
|------|------|
| `IMMEDIATE_RESTART_SURVIVAL_GATE` | Synchronous PRE vs POST during Stage-1 controller (blocking before COMMIT) |
| `POST_EXECUTION_4_TICK_SURVIVAL_GATE` | After commit — observe ≥4 coordinator ticks; not blocking controller |

### New fixture tests

`MUTATION_SUCCEEDS_CHMOD_FAILS_TEST`, `POST_MUTATION_UNEXPECTED_COMMAND_FAIL_TEST`, signal recovery tests, EXP-021/VDC drift tests, `RECOVERY_HANDLER_EXACTLY_ONCE_TEST`, `SUCCESS_PATH_ZERO_RECOVERY_TEST`, `ATOMIC_RESTORE_EXACT_CHECKSUM_TEST`

| Field | Value |
|-------|-------|
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRODUCTION_MUTATED | NO |
| STAGE_1_EXECUTED | NO |
| STAGE_1_START_AUTHORIZED | NO |

---

## F10.3.0.2 cross-workstream evidence completeness fail-closed (2026-09-18)

Blocking review finding: immediate EXP-021/VDC gate could **fail open** when evidence was incomplete (`"" == ""`, `ERROR == ERROR`, `SKIPPED`, omitted keys).

| Requirement | Implementation |
|-------------|----------------|
| Required evidence contract | All `RFRF_EXP021_IMMEDIATE_CONFIG_KEYS` + data keys and `RFRF_VDC_IMMEDIATE_CONFIG_KEYS` + data keys must be explicitly captured PRE/POST; config absence represented as `<absent>` |
| DB snapshot failure blocks | Production-simulation path: missing `DATABASE_URL`, missing `psql`, query failure, empty/non-numeric → `CROSS_WORKSTREAM_DB_SNAPSHOT_PRE\|POST=FAIL`; no `SKIPPED` |
| PRE hard gate | `rfrf_capture_cross_workstream_snapshot PRE` + `rfrf_validate_cross_workstream_snapshot PRE` before backup/recovery arm/mutation; `PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES` required |
| POST hard gate | POST capture + validate before comparison; incomplete POST → `rfrf_enable_stage_fail_closed cross_workstream_post_evidence_incomplete` |
| Sentinel rejection | `""`, `ERROR`, `SKIPPED`, `UNKNOWN`, `UNAVAILABLE`, `NULL`, `null`, `N/A` invalid for required data; numeric fields require `^[0-9]+$` |
| Comparison only after completeness | `MISSING_EQUALS_MISSING_CAN_PASS=NO`, `ERROR_EQUALS_ERROR_CAN_PASS=NO`; VDC shadow POST ≥ PRE; physical states exact equality |
| Fixture vs production | `FIXTURE_MODE_CAN_SYNTHESIZE_EVIDENCE=YES` when `RFRF_STAGE_TEST_MODE=1` without `RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1`; production simulation never downgrades to SKIPPED |

### New fixture tests (12)

`PRE_DATABASE_URL_MISSING_TEST`, `PRE_PSQL_UNAVAILABLE_TEST`, `PRE_REQUIRED_QUERY_ERROR_TEST`, `PRE_REQUIRED_FIELD_MISSING_TEST`, `POST_REQUIRED_QUERY_ERROR_TEST`, `POST_REQUIRED_FIELD_MISSING_TEST`, `PRE_AND_POST_ERROR_EQUALITY_FAILS_TEST`, `PRE_AND_POST_MISSING_EQUALITY_FAILS_TEST`, `LEGITIMATE_CONFIG_ABSENT_EQUALITY_TEST`, `NUMERIC_VALIDATION_TEST`, `VDC_SHADOW_MONOTONIC_INCREASE_TEST`, `VDC_SHADOW_DECREASE_TEST`

| Field | Value |
|-------|-------|
| RFRF_F10_3_0_2_EVIDENCE_COMPLETENESS | PASS (tooling) |
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRODUCTION_MUTATED | NO |
| STAGE_1_START_AUTHORIZED | NO |

---

## F10.3.0.2 cross-workstream evidence completeness fail-closed (2026-09-18)

Blocking review finding: immediate EXP-021/VDC gate could **fail open** when evidence was incomplete (`"" == ""`, `ERROR == ERROR`, `SKIPPED`, omitted keys).

| Requirement | Implementation |
|-------------|----------------|
| Required evidence contract | All `RFRF_EXP021_IMMEDIATE_CONFIG_KEYS` + data keys and `RFRF_VDC_IMMEDIATE_CONFIG_KEYS` + data keys must be explicitly captured PRE/POST; config absence represented as `<absent>` |
| DB snapshot failure blocks | Production-simulation path: missing `DATABASE_URL`, missing `psql`, query failure, empty/non-numeric → `CROSS_WORKSTREAM_DB_SNAPSHOT_PRE\|POST=FAIL`; no `SKIPPED` |
| PRE hard gate | `rfrf_capture_cross_workstream_snapshot PRE` + `rfrf_validate_cross_workstream_snapshot PRE` before backup/recovery arm/mutation; `PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES` required |
| POST hard gate | POST capture + validate before comparison; incomplete POST → `rfrf_enable_stage_fail_closed cross_workstream_post_evidence_incomplete` |
| Sentinel rejection | `""`, `ERROR`, `SKIPPED`, `UNKNOWN`, `UNAVAILABLE`, `NULL`, `null`, `N/A` invalid for required data; numeric fields require `^[0-9]+$` |
| Comparison only after completeness | `MISSING_EQUALS_MISSING_CAN_PASS=NO`, `ERROR_EQUALS_ERROR_CAN_PASS=NO`; VDC shadow POST ≥ PRE; physical states exact equality |
| Fixture vs production | `FIXTURE_MODE_CAN_SYNTHESIZE_EVIDENCE=YES` when `RFRF_STAGE_TEST_MODE=1` without `RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1`; production simulation never downgrades to SKIPPED |

### New fixture tests (12)

`PRE_DATABASE_URL_MISSING_TEST`, `PRE_PSQL_UNAVAILABLE_TEST`, `PRE_REQUIRED_QUERY_ERROR_TEST`, `PRE_REQUIRED_FIELD_MISSING_TEST`, `POST_REQUIRED_QUERY_ERROR_TEST`, `POST_REQUIRED_FIELD_MISSING_TEST`, `PRE_AND_POST_ERROR_EQUALITY_FAILS_TEST`, `PRE_AND_POST_MISSING_EQUALITY_FAILS_TEST`, `LEGITIMATE_CONFIG_ABSENT_EQUALITY_TEST`, `NUMERIC_VALIDATION_TEST`, `VDC_SHADOW_MONOTONIC_INCREASE_TEST`, `VDC_SHADOW_DECREASE_TEST`

| Field | Value |
|-------|-------|
| RFRF_F10_3_0_2_EVIDENCE_COMPLETENESS | PASS (tooling) |
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRODUCTION_MUTATED | NO |
| STAGE_1_START_AUTHORIZED | NO |
