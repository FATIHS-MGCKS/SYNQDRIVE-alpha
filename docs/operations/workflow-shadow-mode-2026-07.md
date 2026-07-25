# Workflow Runtime — Shadow Mode Operations Guide

**Version V4.9.860** · **Phase 11 Prompt 50** · **2026-07-25**

Shadow mode lets the **new Workflow Runtime** evaluate real production domain events and produce **planned actions** without executing side effects. Legacy Task Automation continues to materialize tasks when `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow`.

## Goals

| Shadow does | Shadow does not |
|-------------|-----------------|
| Consume real domain events | Call external providers (email/SMS/WhatsApp/voice) |
| Match workflows by trigger | Create tasks or mutate vehicle/booking status |
| Evaluate scope + conditions | Increment `triggerCount` / live success metrics |
| Build planned actions + policy blockers | Create `OrgWorkflowRun` LIVE rows |
| Surface expected approvals | Silently promote workflows to LIVE |

## Activation (no silent promotion)

Shadow requires **explicit enablement** at multiple layers:

| Layer | Control | Promotion path |
|-------|---------|----------------|
| Global | `WORKFLOW_SHADOW_GLOBALLY_ENABLED=true` (optional) | Ops-only |
| Runtime bridge | `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow` | Env + deploy |
| Organization | `PATCH .../workflows/shadow/settings` `{ "enabled": true }` | ORG_ADMIN |
| Workflow | `PATCH .../workflows/shadow/workflows/:id` `{ "shadowEnabled": true }` | ORG_ADMIN |
| Live cutover | `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=cutover` + workflow `enabled` + `shadowEnabled=false` | Env + admin |

**Promotion to LIVE is never automatic.** Cutover requires env flag change and disabling `shadowEnabled` on pilot workflows.

## Environment variables

```bash
# Task automation bridge (legacy continues + workflow preview)
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow   # legacy | shadow | cutover

# Optional global shadow pilot (still requires per-org enable unless runtime=shadow)
WORKFLOW_SHADOW_GLOBALLY_ENABLED=false

# Retention default (per-org override via API)
WORKFLOW_SHADOW_RETENTION_DAYS=30

# Safety cap per domain event
WORKFLOW_SHADOW_MAX_EVALS_PER_EVENT=20
```

## Data model

### `org_workflow_shadow_settings`

Per-organization pilot toggle and retention.

| Column | Purpose |
|--------|---------|
| `enabled` | Org participates in shadow evaluations |
| `legacy_compare_enabled` | Compare legacy task output vs workflow plan |
| `retention_days` | TTL for shadow rows (`expires_at`) |

### `org_workflow_shadow_runs`

Persisted shadow execution plans (separate from `org_workflow_runs`).

| Column | Purpose |
|--------|---------|
| `event_idempotency_key` | Dedup across retries/restarts |
| `execution_plan` | Sanitized `WorkflowExecutionPlan` (PII masked) |
| `would_trigger` | Scope + conditions + actions satisfied |
| `would_create_approvals` | Maker-checker would pause |
| `status` | `PLANNED`, `SKIPPED_SCOPE`, `SKIPPED_CONDITIONS`, `POLICY_BLOCKED`, `ERROR` |
| `expires_at` | Retention enforcement |

### `org_workflow_shadow_comparisons`

Legacy vs workflow deviation records (when legacy still runs).

| Column | Purpose |
|--------|---------|
| `has_deviation` | Filter for audit dashboards |
| `deviation_reasons` | e.g. `priority_mismatch`, `workflow_would_trigger_but_legacy_did_not` |
| `comparison` | Field-level `{ legacy, workflow }` diff |
| `trigger_at_delta_ms` / `due_at_delta_ms` | Timing drift |

### `org_workflows.shadow_enabled`

When `true`, workflow is **shadow-only** — engine will plan and persist but **not** execute LIVE even if `enabled=true`.

## API (tenant-scoped, ORG_ADMIN)

```
GET    /organizations/:orgId/workflows/shadow/settings
PATCH  /organizations/:orgId/workflows/shadow/settings
GET    /organizations/:orgId/workflows/shadow/summary
GET    /organizations/:orgId/workflows/shadow/deviations
GET    /organizations/:orgId/workflows/shadow/runs
GET    /organizations/:orgId/workflows/shadow/runs/:runId
PATCH  /organizations/:orgId/workflows/shadow/workflows/:workflowId
```

## Comparison metrics

When `legacy_compare_enabled`:

| Metric | Source |
|--------|--------|
| Would new workflow trigger? | `workflow_would_trigger` |
| Legacy executed? | `legacy_did_execute` |
| Trigger timing delta | `trigger_at_delta_ms` (activatesAt) |
| Due timing delta | `due_at_delta_ms` |
| Task type / priority / dedup | `comparison` JSON |
| Recipients (masked) | planned action `resolvedRecipients` |
| Deviation reason codes | `deviation_reasons[]` |

## Architecture flow

```
Domain event
  ├─ WorkflowEventService.emitEvent
  │    └─ WorkflowEngineService.processEvent
  │         ├─ LIVE path → OrgWorkflowRun (unchanged, gated)
  │         └─ SHADOW path → WorkflowShadowService (async, persisted)
  │
  └─ TaskAutomationService.safeUpsert (bridge)
       └─ ExecutionRouter (mode=shadow)
            ├─ legacyExecute() → real task (legacy)
            └─ DryRun plan → shadow run + comparison row
```

## PII minimization

- Execution plans use `sanitizePreviewRecord` (emails/phones masked, secret keys stripped).
- Comparison stores structural fields only — no raw customer message bodies.
- Audit API returns stored sanitized JSON.

## Retention

- Each shadow run gets `expires_at = now + retention_days`.
- `WorkflowShadowRetentionService.runRetentionSweep()` deletes expired rows (comparisons cascade).
- Recommended: daily cron in ops (not auto-started in app bootstrap).

## Performance

- Shadow evaluations are **scheduled async** (`scheduleShadowEvaluation`) — do not block primary transactions.
- Per-event cap: 20 shadow evaluations (configurable).
- Org settings cached 30s in `WorkflowShadowGateService`.

## Recommended rollout

1. Run migration backfill (`workflow-migration`) for system templates.
2. Enable org shadow settings for pilot tenant.
3. Set `shadowEnabled=true` on selected workflows.
4. Set `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow`.
5. Monitor `GET .../shadow/deviations` until deviation rate acceptable.
6. Promote individual workflows: `shadowEnabled=false`, `enabled=true`.
7. Org cutover: `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=cutover` (requires change control).

## Tests

```bash
cd backend && npm test -- workflow-shadow workflow-engine.production task-automation-workflow-migration
```

Coverage: no side effects, legacy continues, deviation detection, tenant isolation, idempotent persistence, feature-flag gate.

## Related docs

- `docs/migrations/task-automation-to-workflow-runtime-2026-07.md`
- `docs/testing/workflow-automation-production-test-matrix-2026-07.md`
