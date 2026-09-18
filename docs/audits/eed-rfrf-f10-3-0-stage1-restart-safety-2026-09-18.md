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
