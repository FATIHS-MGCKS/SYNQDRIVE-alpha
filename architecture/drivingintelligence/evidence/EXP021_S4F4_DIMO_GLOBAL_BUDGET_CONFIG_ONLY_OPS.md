# EXP-021 S4F-4 — DIMO global budget config-only Production ops wrapper

**Status:** Engineering complete (wrapper + tests). **Production execution NOT performed** in this slice.

## Purpose

Provide a dedicated, transactional, fail-closed Production operations wrapper that sets exactly one shared env key:

- `DIMO_GLOBAL_BUDGET_ENABLED=true`

This enables explicit config-file evidence for Tiny Activation gate `providerGlobalBudgetEnabled` when combined with per-replica runtime proof. It does **not** deploy code, activate S4, make DIMO provider calls, or grant Tiny Shadow operator authorization.

## Executable authority

| Concern | Authority |
|--------|-----------|
| Replica restart / health / SHA / scheduler / nginx | `backend/scripts/ops/lib/vps-production-replica.lib.sh` |
| Topology | `backend/scripts/ops/vps-production-replica-topology.config.sh` |
| Full release lifecycle (reference only) | `backend/scripts/ops/vps-deploy-release.sh` |
| Config-file evidence audit | `backend/scripts/ops/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh` |
| Mutation + S4 preflight pure logic | `backend/scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib.ts` |

**Not** executable authority: `rfrf-production-enable-stage.sh` (pattern reference only).

## Wrapper entrypoint

`backend/scripts/ops/di-v0-s4f-enable-global-budget-production.sh`

### Operator gates (Production)

- `DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK=YES` — authorizes **only** this global-budget rollout (not Tiny Shadow).
- `DI_S4_REQUIRED_GIT_SHA=<full SHA>` — must match `/opt/synqdrive/current` before any mutation.

### Transaction states

`PRE_MUTATION` → `RECOVERY_ARMED` → (mutate + rolling restart + proof) → `COMMITTED`  
On failure after arm: restore backup → recovery rolling restart A→B → scheduler convergence → fail closed.

**SIGKILL:** cannot be trapped; documented limitation — recovery may be incomplete if the process is killed uncleanly.

### Mutation scope

- Single key only; no arbitrary env setter.
- Atomic write via CLI; `UNRELATED_ENV_DELTA_COUNT=0` required.
- Post-mutation config audit must report `GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT_ENABLED`.

### Runtime proof semantics (hardened)

- File state **cannot** confirm active runtime (`FILE_STATE_ALONE_CAN_CONFIRM_RUNTIME=NO`).
- **Authority:** live Prometheus gauge `synqdrive_dimo_global_budget_enabled` scraped per replica from `http://127.0.0.1:<port>/api/v1/metrics` (Bearer `METRICS_BEARER_TOKEN` from env; never logged).
- PM2 historical logs are **corroboration only** (`STARTUP_LOG_CORROBORATION_ONLY=YES`); stale log lines cannot satisfy the gate.
- After restart paths: PM2 PID/uptime must change before metrics are accepted (`REPLICA_*_POST_RESTART_IDENTITY_PROVEN=YES`).
- Both replicas must independently report gauge `1` before `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED`.

### S4 safety

Pre- and post-mutation: all `DI_V0_S4_*` control-plane flags must remain off (`assertS4ControlFlagsSafe`). Post-check: `app.module.ts` must not register S4B–S4E runtime. Expected markers: `S4_RUNTIME_ACTIVE=NO`, `SHADOW_ACTIVATION_OCCURRED=NO`.

### Idempotency

When config is `EXPLICIT_ENABLED` and both replicas runtime-proven `ENABLED`: `IDEMPOTENT_ALREADY_CONVERGED=YES`, no env write, no restart.

When file enabled but runtime unverified: `RESTART_FOR_RUNTIME_PROOF` path (ACK still required).

### Dry-run / fixture

`DRY_RUN=1` + `DI_S4F4_FIXTURE_MODE=1`: emits `DRY_RUN_ZERO_MUTATION=PASS` and full plan; no backup on Production paths, no PM2 restart.

## Tiny Activation interaction

Successful future Production execution may satisfy:

- `GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT_ENABLED`
- `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED`
- `resolveTinyActivationProviderGlobalBudgetEvidence(...) = ENABLED`

`explicitOperatorAuthorization` remains **UNKNOWN**; `TINY_ACTIVATION_READY=NO` until separate operator grant.

## Production execution in S4F-4 slice

**NOT performed.** No mutation of `/opt/synqdrive/shared/backend.env`, no Production restart, no deploy.
