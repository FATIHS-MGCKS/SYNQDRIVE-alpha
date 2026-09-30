# EXP-021 S4F-3 — Tiny Activation evidence audit (non-operator gates)

**Audit date:** 2026-09-30  
**Starting main:** `34c18c601d8a23dad7b258385658ffdb1e87b314` (includes merged PR #1855 S4F-2)  
**Scope:** Read-only evidence for frozen Tiny Activation gates — no S4 activation, no deploy, no operator authorization.

## Frozen gate inventory (code + contract parity)

Source: `di-v0-s4f-activation-evidence.ts` (`frozenTinyActivationGateKeys()`).

| # | Evaluator key | Contract `activationGates.TINY_ACTIVATION` |
|---|---------------|---------------------------------------------|
| 1 | `replayDeserializerGate` | `DI-GAP-S4-REPLAY-DESERIALIZER-001:CLOSED` |
| 2 | `snapshotRehashGate` | `SNAPSHOT_REHASH_VERIFICATION:IMPLEMENTED` |
| 3 | `providerBackpressureGate` | `DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED` |
| 4 | `providerGlobalBudgetEnabledGate` | `tinyActivationGlobalBudgetRequirement` (`DIMO_GLOBAL_BUDGET_ENABLED` explicit) |
| 5 | `locationRetentionGovernanceGate` | `DI-GAP-S4-LOCATION-RETENTION-001:GOVERNANCE_NOTE` |
| 6 | `explicitOperatorAuthorizationGate` | `EXPLICIT_OPERATOR_AUTHORIZATION` (human) |

**Not a frozen Tiny gate:** `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` — absent from `activationGates.TINY_ACTIVATION` and from `frozenTinyActivationGateKeys()`; observability / future scale only.

## Gate audit results

### Replay deserializer

- Machine contract: `replay.deserializerImplemented=true`, `replay.deserializerGap.status=CLOSED`.
- Implementation: `parseDiV0S4EvidenceContainer` + S4D `verifyAndParseDiV0PinnedEvidenceSnapshot` (rehash on load).
- **REPLAY_DESERIALIZER_GATE=SATISFIED** (authority CLOSED; stale OPEN prose in older docs not reopened).

### Snapshot rehash

- Contract: `replay.rehashOnLoadRequired=true`; Tiny requires `SNAPSHOT_REHASH_VERIFICATION:IMPLEMENTED`.
- Implementation: `verifyAndParseDiV0PinnedEvidenceSnapshot` recomputes `buildDiV0S4EvidenceSnapshotHash` before parse.
- **SNAPSHOT_REHASH_GATE=SATISFIED**

### Provider backpressure

- Contract: `providerBackpressure.globalCircuitBreaker.gap.status=CLOSED`.
- Evidence: [EXP021_S4F2_PROVIDER_BACKPRESSURE_CLOSURE.md](EXP021_S4F2_PROVIDER_BACKPRESSURE_CLOSURE.md) (PR #1855, Redis 10/10).
- **PROVIDER_BACKPRESSURE_GATE=SATISFIED**

### Location retention governance (Tiny gate only)

- Artifact: [design/s4f/S4F_LOCATION_RETENTION_GOVERNANCE_NOTE.md](../design/s4f/S4F_LOCATION_RETENTION_GOVERNANCE_NOTE.md).
- T05: `di-v0-s4a-work-item.repository.ts` sets `retention_until = clock_timestamp() + 90 days` (`DI_V0_S4_SNAPSHOT_RETENTION_DAYS`).
- Contract requires **GOVERNANCE_NOTE**, not purge automation.
- **TINY_ACTIVATION_GOVERNANCE_NOTE=SATISFIED**
- **SCALE_UP_PRIVACY_REVIEW=REQUIRED**
- **PURGE_AUTOMATION_IMPLEMENTED=NO**
- **LOCATION_RETENTION_TINY_GATE=SATISFIED**

### Provider global budget (Production read-only)

Authoritative deployment env file on Production VPS (read-only SSH audit 2026-09-30):

| Field | Value |
|-------|--------|
| Path | `/opt/synqdrive/shared/backend.env` |
| Runtime symlink | `/opt/synqdrive/current/backend/.env` → same file |
| `DIMO_GLOBAL_BUDGET_ENABLED` explicitly defined | **NO** |
| Normalized Tiny evidence | **UNKNOWN** (missing) |
| Generic `DimoProviderBudgetConfig` default if unset | `true` (runtime behavior only — **not** Tiny Activation evidence) |

**PROVIDER_GLOBAL_BUDGET_ENABLED_GATE=NOT_SATISFIED** until Production explicitly sets `DIMO_GLOBAL_BUDGET_ENABLED=true` (or equivalent recognized token).

Ops helper (read-only): `backend/scripts/ops/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh`

Pure classifier (no runtime env read): `classifyDiV0S4fTinyActivationGlobalBudgetEnv` in `di-v0-s4f-tiny-activation-global-budget-env.ts`.

### Operator authorization

Not inferred from this audit or PR merges.

**EXPLICIT_OPERATOR_AUTHORIZATION_GATE=UNKNOWN** → evaluator **NOT_SATISFIED**.

## Readiness evaluation (explicit evidence)

```ts
evaluateDiV0S4fTinyActivationReadiness({
  replayDeserializerGap: 'CLOSED',
  snapshotRehashVerification: 'IMPLEMENTED',
  providerBackpressureGap: 'CLOSED',
  providerGlobalBudgetEnabled: 'UNKNOWN', // Production: env var missing
  locationRetentionGovernanceNote: 'PRESENT',
  explicitOperatorAuthorization: 'UNKNOWN',
});
```

| Gate | State |
|------|--------|
| Replay | SATISFIED |
| Snapshot rehash | SATISFIED |
| Backpressure | SATISFIED |
| Global budget | NOT_SATISFIED |
| Location governance | SATISFIED |
| Operator auth | NOT_SATISFIED (UNKNOWN) |
| **finalState** | **NOT_READY** |

## Boundaries confirmed

- No Production env mutation, deploy, S4 runtime registration, provider calls, or operator grant.
- `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` — **not** a Tiny Activation gate; no work required in this slice.

## Next action (human / ops)

1. Add explicit `DIMO_GLOBAL_BUDGET_ENABLED=true` to `/opt/synqdrive/shared/backend.env` on Production (separate authorized change — **not** performed in S4F-3).
2. Re-run read-only audit script; supply `providerGlobalBudgetEnabled=ENABLED` in activation evidence.
3. Explicit operator authorization remains a later human gate before any Tiny Shadow activation engineering.
