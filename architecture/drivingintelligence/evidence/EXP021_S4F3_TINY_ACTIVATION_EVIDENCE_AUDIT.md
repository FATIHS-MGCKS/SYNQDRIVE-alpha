# EXP-021 S4F-3 — Tiny Activation evidence audit (non-operator gates)

**Audit date:** 2026-09-30  
**Starting main:** `34c18c601d8a23dad7b258385658ffdb1e87b314` (includes merged PR #1855 S4F-2)  
**Scope:** Read-only evidence for frozen Tiny Activation gates — no S4 activation, no deploy, no operator authorization.

## Evidence model: config file vs active runtime (S4F-3 hardening)

Production backend loads `/opt/synqdrive/shared/backend.env` via Nest `ConfigModule.forRoot()` at **process bootstrap**. Two PM2 fork replicas (`synqdrive` / `synqdrive-b` per `vps-production-replica-topology.config.sh`).

| Layer | Symbol | Meaning |
|-------|--------|---------|
| Deployment config source | `GLOBAL_BUDGET_CONFIG_FILE_STATE` | `EXPLICIT_ENABLED` \| `EXPLICIT_DISABLED` \| `MISSING` \| `MALFORMED` \| `UNREADABLE` |
| Active runtime | `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE` | `CONFIRMED_ENABLED` \| `CONFIRMED_DISABLED` \| `UNVERIFIED` |

The read-only file audit (`di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh`) proves **config-file state only**:

- `EVIDENCE_SCOPE=CONFIG_FILE_ONLY`
- `ACTIVE_RUNTIME_CONFIRMATION=NOT_PERFORMED`
- `FILE_AUDIT_CAN_ALONE_SATISFY_TINY_GATE=NO`

Frozen evaluator input remains `providerGlobalBudgetEnabled = ENABLED | DISABLED | UNKNOWN`. Supply **`ENABLED` only when both**:

1. `GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT_ENABLED` (recognized TRUE in authoritative env file); **and**
2. `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED` (both replicas restarted/booted after that config became authoritative and loaded enabled budget config).

Resolver: `resolveTinyActivationProviderGlobalBudgetEvidence` in `di-v0-s4f-global-budget-evidence-semantics.ts`.

Pure value classifier `classifyDiV0S4fTinyActivationGlobalBudgetEnv` classifies a **supplied raw string** only — not live replica state.

### Effective default vs Tiny explicit evidence

| Concept | Current Production (2026-09-30 audit) |
|---------|----------------------------------------|
| `EFFECTIVE_RUNTIME_DEFAULT_BEHAVIOR` | `ENABLED_BY_DEFAULT` (Nest `DimoProviderBudgetConfig` defaults missing `DIMO_GLOBAL_BUDGET_ENABLED` to `true`) |
| `TINY_ACTIVATION_EXPLICIT_CONFIG_EVIDENCE` | `UNKNOWN` (env line missing; runtime not post-mutation proven) |

This is an **evidentiary** gap, not a claim that current functional budget behavior is unsafe.

## Frozen gate inventory (code + contract parity)

Source: `di-v0-s4f-activation-evidence.ts` (`frozenTinyActivationGateKeys()`).

| # | Evaluator key | Contract `activationGates.TINY_ACTIVATION` |
|---|---------------|---------------------------------------------|
| 1 | `replayDeserializerGate` | `DI-GAP-S4-REPLAY-DESERIALIZER-001:CLOSED` |
| 2 | `snapshotRehashGate` | `SNAPSHOT_REHASH_VERIFICATION:IMPLEMENTED` |
| 3 | `providerBackpressureGate` | `DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED` |
| 4 | `providerGlobalBudgetEnabledGate` | `tinyActivationGlobalBudgetRequirement` (`DIMO_GLOBAL_BUDGET_ENABLED` explicit + runtime proof) |
| 5 | `locationRetentionGovernanceGate` | `DI-GAP-S4-LOCATION-RETENTION-001:GOVERNANCE_NOTE` |
| 6 | `explicitOperatorAuthorizationGate` | `EXPLICIT_OPERATOR_AUTHORIZATION` (human) |

**Not a frozen Tiny gate:** `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` — absent from `activationGates.TINY_ACTIVATION` and `frozenTinyActivationGateKeys()`.

## Gate audit results

### Replay deserializer — SATISFIED

### Snapshot rehash — SATISFIED

### Provider backpressure — SATISFIED (S4F-2 / PR #1855)

### Location retention governance (Tiny gate only) — SATISFIED

- `LOCATION_RETENTION_GOVERNANCE_ARTIFACT_PRESENT=YES`
- `PURGE_AUTOMATION_IMPLEMENTED=NO`
- `SCALE_UP_PRIVACY_REVIEW_REQUIRED=YES`
- Broader retention/privacy gap **not** fully closed — only `GOVERNANCE_NOTE` for Tiny.

### Provider global budget — NOT_SATISFIED (current)

**Config file (read-only SSH 2026-09-30):**

| Field | Value |
|-------|--------|
| Path | `/opt/synqdrive/shared/backend.env` |
| `GLOBAL_BUDGET_CONFIG_FILE_STATE` | **MISSING** |
| `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE` | **UNVERIFIED** (no post-mutation restart proof in this audit) |

**PROVIDER_GLOBAL_BUDGET_ENABLED_GATE=NOT_SATISFIED**

### Operator authorization — UNKNOWN → NOT_SATISFIED

Env edits, deploys, and this audit do **not** grant operator authorization.

## Readiness evaluation (current explicit evidence)

```ts
evaluateDiV0S4fTinyActivationReadiness({
  replayDeserializerGap: 'CLOSED',
  snapshotRehashVerification: 'IMPLEMENTED',
  providerBackpressureGap: 'CLOSED',
  providerGlobalBudgetEnabled: 'UNKNOWN',
  locationRetentionGovernanceNote: 'PRESENT',
  explicitOperatorAuthorization: 'UNKNOWN',
});
```

**finalState = NOT_READY**

## Production ops authority (readiness vs execution)

SynqDrive has **canonical same-SHA rolling-restart primitives** and **proven transactional rollout patterns**, but **no dedicated DIMO global-budget config-only rollout wrapper** today. A **separate authorized Production-ops slice** is required before any `backend.env` mutation or restart for `DIMO_GLOBAL_BUDGET_ENABLED`.

This is an **operational execution prerequisite**, not a seventh frozen Tiny Activation gate.

| Classification | Value |
|----------------|--------|
| `DEDICATED_DIMO_CONFIG_ONLY_ROLLOUT_PATH_FOUND` | **NO** |
| `SAFE_REUSABLE_ROLLING_RESTART_PRIMITIVES_FOUND` | **YES** |
| `RFRF_STAGE_SCRIPT_DIRECTLY_REUSABLE_FOR_DIMO` | **NO** |
| `RFRF_STAGE_SCRIPT_PATTERN_REFERENCE_ONLY` | **YES** |
| `NEW_DIMO_CONFIG_ONLY_OPS_WRAPPER_REQUIRED_BEFORE_PRODUCTION_MUTATION` | **YES** |

**Reusable restart authority:** `backend/scripts/ops/lib/vps-production-replica.lib.sh` — e.g. `vps_replica_restart_one` (PM2 `--update-env`), `vps_replica_wait_healthy`, `vps_replica_verify_no_mixed_sha`, `vps_replica_wait_scheduler_leader_convergence`, `vps_replica_verify_scheduler_leaders`, `vps_replica_nginx_dual_upstream_ok`, `vps_replica_verify_post_deploy`.

**Reusable topology authority:** `backend/scripts/ops/vps-production-replica-topology.config.sh` (two-replica PM2 names/ports).

**Full-release lifecycle authority:** `backend/scripts/ops/vps-deploy-release.sh` (code deploy + rolling multi-replica restart — heavier than a config-only change).

**`rfrf-production-enable-stage.sh`:** **not** the executable DIMO rollout authority. It implements the **RFRF staged rollout state machine** (stage transitions, cutover metadata, RFRF boolean authorities, pre/post validation, recovery). It must **not** be invoked merely to set `DIMO_GLOBAL_BUDGET_ENABLED=true`. It may be cited only as a **design/pattern reference** for: env backup before mutation; atomic env mutation; recovery restore; same-SHA rolling restart; post-restart verification.

PR #1861 remains **evidence/readiness only** — do **not** add a production-mutating DIMO wrapper in this slice unless repository convention explicitly requires it (it does not).

## Authorized future ops sequence (conceptual — separate Production-ops slice)

Do **not** treat “edit env file + rerun file audit” as sufficient. Do **not** ad-hoc `pm2 restart all`.

1. Exact running SHA + replica health preflight.
2. Backup `/opt/synqdrive/shared/backend.env`.
3. Prove `DIMO_GLOBAL_BUDGET_ENABLED` currently absent (config-file audit).
4. Atomically add exactly `DIMO_GLOBAL_BUDGET_ENABLED=true` (no unrelated env mutations).
5. Config-file audit → `GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT_ENABLED`.
6. Run a **dedicated DIMO config-only wrapper** (future slice) built from `vps-production-replica.lib.sh` + `vps-production-replica-topology.config.sh` — not `rfrf-production-enable-stage.sh`.
7. Rolling restart replica A (`vps_replica_restart_one` + `--update-env`).
8. Health + expected SHA proof.
9. Rolling restart replica B.
10. Health + expected SHA proof.
11. Scheduler leader convergence → exactly one leader.
12. No mixed SHA (`vps_replica_verify_no_mixed_sha`).
13. Both process start/restart timestamps **after** env mutation.
14. Runtime provider-budget evidence = enabled (startup log corroboration; not file audit alone).
15. All S4 activation flags remain OFF.
16. No S4 provider calls / writes / shadow activation.
17. **Failure after mutation:** restore env backup; rolling restart both replicas; verify prior state restored; fail closed.

Only then: `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED` and `resolveTinyActivationProviderGlobalBudgetEvidence` → `providerGlobalBudgetEnabled=ENABLED` for the frozen evaluator.

## Boundaries

No Production env mutation, restart, deploy, S4 activation, or operator grant in this PR.
