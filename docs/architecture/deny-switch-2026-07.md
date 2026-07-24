# Fail-Closed Deny Switch (Prompt 25)

## Overview

`DenySwitchService` provides an immediate, fail-closed deny layer for data-authorization scopes. It activates synchronously on revoke/suspend, blocks new decisions before distributed propagation completes, and uses the database as the source of truth.

## Scopes

| Scope | Entity key |
|-------|------------|
| `ORGANIZATION` | `organizationId` |
| `PROCESSING_ACTIVITY` | `processingActivityId` |
| `ENFORCEMENT_POLICY` | `enforcementPolicyId` |
| `CONSENT` | `consentId` |
| `PROVIDER_GRANT` | `providerGrantId` |
| `RESOURCE` | `resourceType` + `resourceId` (e.g. `VEHICLE`) |

## Propagation Mechanism

1. **Synchronous local apply** — `activateSync()` writes DB row, updates in-memory `DenySwitchLocalStore`, invalidates auth decision cache
2. **Redis Pub/Sub** — channel `synqdrive:data-auth:deny-switch` notifies other API/worker instances
3. **Monotonic sequence** — per-organization `sequence` (BigInt); stale events with lower sequence are ignored
4. **Startup hydration** — `DenySwitchStartupService` loads all active switches from DB
5. **Reconciliation** — every 60s DB → local store (safety net for missed pub/sub)

## Target Latency

- **Local deny:** immediate (same request, before HTTP response)
- **Cross-instance propagation target:** ≤ 2s (`DENY_SWITCH.targetPropagationLatencyMs`)
- Metrics: `DenySwitchMetricsService.snapshot().propagationLatencyMs` (p50/p95/max)

## Source of Truth

- Table: `data_authorization_deny_switches`
- In-memory store is a performance cache; DB wins on hydration/reconciliation
- Idempotency key per activation prevents duplicate audit rows

## Fail-Closed Behavior

| Condition | Behavior |
|-----------|----------|
| Deny switch active for scope | `AuthorizationDecisionService` returns `DENY` before resolver |
| Store not ready after startup grace (5s) | `DENY_SWITCH_NOT_READY` |
| Redis publish failure | Local instance still denies; other instances rely on hydration/reconcile |
| Redis subscribe failure | Local + DB hydration; reconciliation catches up |
| Stale pub/sub event (sequence < local) | Ignored — no reactivation |

## Integration Points

- `AuthorizationDecisionService.decide()` — deny check before cache/resolver
- `RevocationOrchestratorSteps.executeDenySwitch()` — `activateForRevocation()`
- `ProcessingActivityLifecycleService.suspend()` / `EnforcementPolicyLifecycleService.suspend()`
- `DenySwitchService.isQueueEnqueueDenied()` — queue producer guard

## Permissions

| Permission | Level |
|------------|-------|
| `data_processing.deny_switch_view` | read |
| `data_processing.deny_switch_manage` | manage |

API: `GET .../deny-switch`, `GET .../deny-switch/metrics`

## Test Results

```
npm run test:data-auth:deny-switch → 14 passed
```

Scenarios: immediate local lock, distributed propagation, Redis publish failure, restart hydration, fail-closed not-ready, stale event, queue block, org/resource scope, idempotent activation, revocation multi-scope.

## Files

- `backend/src/modules/data-authorizations/deny-switch/`
- Migration: `20260724060000_data_authorization_deny_switch`
