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

## Authorized future ops sequence (not PR #1861 — separate human decision)

Do **not** treat “edit env file + rerun file audit” as sufficient.

1. **Pre-change evidence:** deployed SHA; both PM2 replicas healthy (`synqdrive` :3001, `synqdrive-b` :3002); replica PIDs/uptime/restart counters; all S4 flags OFF; config-file audit baseline.
2. **Backup** `/opt/synqdrive/shared/backend.env`.
3. **Atomic add** `DIMO_GLOBAL_BUDGET_ENABLED=true` only if absent (no unrelated env mutations).
4. **Config-file audit** → expect `GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT_ENABLED`.
5. **Controlled restart** so both replicas bootstrap after the mutation.

**Canonical multi-replica lifecycle (repository):**

- Full release: `backend/scripts/ops/vps-deploy-release.sh` → `vps_replica_rolling_deploy` / `vps_replica_verify_post_deploy` (`lib/vps-production-replica.lib.sh`, `vps-production-replica-topology.config.sh`).
- **Config-only, same SHA:** `rfrf-production-enable-stage.sh` performs rolling restart of both replicas at the **same** runtime SHA after `backend.env` mutation (pattern used for production flag stage enablement). Requires explicit operator ACK / stage contract — **not** executed in S4F-3.

There is **no** dedicated one-liner “env-only DIMO global budget rolling restart” script; use the existing stage/deploy runbook authority above or a **separate** authorized deployment/restart decision. Do **not** ad-hoc `pm2 restart all`.

6. **Post-restart runtime proof:** both replicas on expected SHA; boot times **after** env mutation; health/readiness OK; scheduler leader invariant; startup log line `DIMO global provider budget enabled` on both replicas; no `DIMO_GLOBAL_BUDGET_ENABLED=false` warning; S4 flags still OFF; zero S4 provider/shadow activation.
7. Only then: `activeRuntimeState=CONFIRMED_ENABLED` + `resolveTinyActivationProviderGlobalBudgetEvidence` → supply `providerGlobalBudgetEnabled=ENABLED` to the evaluator.

## Boundaries

No Production env mutation, restart, deploy, S4 activation, or operator grant in this PR.
