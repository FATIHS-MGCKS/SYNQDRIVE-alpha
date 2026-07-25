# Workflow Action Technical Policies (V4.9.842)

Phase 7 Prompt 32 — binding server-side technical policies for workflow actions.

## Policy fields (per action)

| Field | Description |
|-------|-------------|
| `riskClass` | LOW / MEDIUM / HIGH / CRITICAL — server-side, no client downgrade |
| `requiredPermission` | RBAC permission gate |
| `approvalRule` | NONE / OPTIONAL / REQUIRED / GATE_ONLY |
| `allowedTriggers` | Canonical event types or `*` |
| `allowedEntityTypes` | Entity types or `*` |
| `allowedScopes` | organization / vehicle / station |
| `timeout` | defaultMs + maxMs |
| `retry` | maxAttempts + backoff |
| `maxAttempts` | Hard cap per action run |
| `fallbackCapable` | Whether fallback path exists |
| `dataCategories` | OPERATIONAL, PII, FINANCIAL, HEALTH, COMMUNICATION, VEHICLE_TELEMETRY |
| `auditLevel` | MINIMAL → FORENSIC |
| `retentionClass` | SHORT → COMPLIANCE |
| `dryRunAvailable` | Preview allowed |
| `compensationPossible` | Handler compensation supported |
| `highRiskSafeguards` | Additional HIGH/CRITICAL protections |

## Enforcement

1. `WorkflowActionPolicyService.evaluate()` — before preview **and** execute
2. `WorkflowActionSafetyBlockService` — real-time blocks override frozen snapshots
3. Policy snapshot stored on `org_workflow_action_runs.policy_snapshot`
4. Approved runs honor frozen snapshot (non-retroactive policy changes)
5. Safety blocks always apply (incident response, unverified diagnosis guard)

## Module layout

```
backend/src/modules/workflows/policies/
  workflow-action-policy.types.ts
  workflow-action-policy.matrix.ts      # canonical matrix
  workflow-action-policy.snapshot.ts
  workflow-action-policy.service.ts
  workflow-action-safety-block.service.ts
  workflow-action-policy.spec.ts
```

## Risk examples (matrix)

| Action | Risk | Status |
|--------|------|--------|
| `notification.in_app.send` | MEDIUM | ENABLED |
| `task.create` | MEDIUM | ENABLED |
| `customer.contact.email` | MEDIUM | DISABLED |
| `customer.contact.whatsapp` | HIGH | DISABLED |
| `voice.call` | HIGH | DISABLED |
| `vehicle.status.update` | HIGH | ENABLED |
| `booking.cancel` | CRITICAL | DISABLED |
| `invoice.charge` | CRITICAL | DISABLED |
| `ai.suggest_action` | CRITICAL | ENABLED (approval required) |

## Diagnostic guardrail

On `vehicle.health.critical` / `vehicle.dtc.critical`, customer-facing communication actions require `verifiedDiagnosis: true` in action config — blocks unverified technical diagnosis outbound.

## Tests

40 passing across `workflow-action-policy.spec.ts`, adapter + registry specs.
