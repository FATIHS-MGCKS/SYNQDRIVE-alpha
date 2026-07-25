# Workflow Risk Classification (V4.9.850)

**Phase 9, Prompt 40** — binding server-side risk classification for triggers, conditions, actions, and complete workflows.

## Risk classes

| Class | Rank | Typical use |
|-------|------|-------------|
| `LOW` | 1 | Internal notifications, task creation |
| `MEDIUM` | 2 | Internal flags, customer email, alerts |
| `HIGH` | 3 | SMS, WhatsApp, AI voice, vehicle status |
| `CRITICAL` | 4 | AI customer messages, payments, cancellations, KYC, blocks |

Risk class is **server-side only** — clients cannot downgrade.

## Risk matrix (semantic categories)

| Category | Example actions | Base risk |
|----------|-----------------|-----------|
| Internal notification | `notification.in_app.send` | LOW |
| Task creation | `task.create` | LOW |
| Internal flag change | `booking.flag` | MEDIUM |
| Customer email | `email.send` | MEDIUM |
| Customer WhatsApp | `whatsapp.template.send` | HIGH |
| Customer SMS | `sms.send` | HIGH |
| AI-generated message | `whatsapp.ai_message.send` | CRITICAL |
| AI voice call | `voice.call.start` | HIGH |
| Vehicle status change | `vehicle.status.update` | HIGH |
| Booking modification | `booking.update` (disabled) | HIGH |
| Booking cancellation | `booking.cancel` (disabled) | CRITICAL |
| Customer block | `customer.block` (disabled) | CRITICAL |
| Payment | `invoice.charge` (disabled) | CRITICAL |
| Document release | `document.release` (disabled) | HIGH |
| KYC decision | `kyc.decision` (disabled) | CRITICAL |
| Technical security alert | triggers `vehicle.health.critical`, `vehicle.dtc.critical` | HIGH (trigger) |

## Aggregation rules

1. **Workflow risk ≥ highest action risk**
2. **Trigger risk** and **condition risk** participate in the max
3. **Combination elevation:**
   - Multiple customer contact channels → +1 risk level
   - AI + external customer contact → at least HIGH
   - AI message + AI voice in one workflow → CRITICAL
   - Critical vehicle trigger + customer contact → at least HIGH
   - Payment/KYC/block/cancel semantics → CRITICAL floor
   - Condition fields matching payment/kyc/block → CRITICAL

## Risk class determines

| Binding | LOW | MEDIUM | HIGH | CRITICAL |
|---------|-----|--------|------|----------|
| Permission | `WORKFLOW_EXECUTE` | `WORKFLOW_EXECUTE` | `WORKFLOW_CUSTOMER_CONTACT` | `WORKFLOW_CRITICAL_EXECUTE` |
| Approval | NONE | OPTIONAL | REQUIRED | REQUIRED |
| Maker-checker | No | No | No | **Yes** |
| Dry-run before activate | No | Yes | Yes | Yes |
| Audit level | MINIMAL | STANDARD | DETAILED | FORENSIC |
| Rollout flag | — | — | `WORKFLOW_HIGH_RISK_ACTIONS` | `WORKFLOW_CRITICAL_ACTIONS` |
| Max reach / run | unlimited | 50 | 10 | 1 |

## Architecture

```
backend/src/modules/workflows/risk/
  workflow-risk.registry.ts           # Central risk registry (versioned)
  workflow-risk-calculator.service.ts # Workflow risk calculator
  workflow-risk-combination.rules.ts  # Combination elevation rules
  workflow-risk-policy.bindings.ts    # Risk → permission/approval/audit
  workflow-risk-calculator.spec.ts
```

### Policy linking

- `WorkflowActionPolicyService` validates policy matrix risk ≥ registry floor
- `WorkflowActionSafetyBlockService` can override and block immediately (incident, unverified diagnosis)
- Technical policy matrix (`workflow-action-policy.matrix.ts`) remains execution contract; registry is classification source of truth

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/organizations/:orgId/workflows/risk-registry` | Full registry + policy bindings |
| `POST` | `/organizations/:orgId/workflows/risk/preview` | Assess draft definition |
| `GET` | `/organizations/:orgId/workflows/:id/risk` | Assess saved workflow |
| `GET` | `/organizations/:orgId/workflows/:id` | Includes `riskClass` + `riskAssessment` |
| `POST` | `/organizations/:orgId/workflows/:id/test` | Includes `riskAssessment` in dry-run output |

## CRITICAL actions not generally available

These remain `capabilityGate: DISABLED` or `generallyAvailable: false`:

- `booking.cancel` — booking cancellation
- `invoice.charge` — payment charge
- `customer.block` — customer block
- `kyc.decision` — KYC decision
- `whatsapp.ai_message.send` — enabled with approval but not general self-service activation
- `ai.suggest_action` — suggestion only, never auto-execute

## Versioning

Registry version: `WORKFLOW_RISK_REGISTRY_VERSION` (`2026-07-1`). Changes to classification require version bump and Changes/Architektur update.

## Related docs

- `docs/architecture/workflow-action-policies-2026-07.md`
- `docs/privacy/workflow-communication-policy-2026-07.md`
