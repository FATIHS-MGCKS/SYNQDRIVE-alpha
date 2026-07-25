# Workflow Condition Engine (Phase 6 Prompt 25)

Strictly typed condition evaluation replacing implicit type coercion.

## Field types

| Type | Example fields | Allowed operators |
|------|----------------|-------------------|
| `boolean` | `customer.contact.whatsappAllowed` | equals, notEquals, is_true, is_false, exists |
| `integer` | `booking.pickupDelayMinutes` | equals, notEquals, in, notIn, gt, gte, lt, lte, exists |
| `decimal` | `invoice.amountDue` | equals, notEquals, in, notIn, gt, gte, lt, lte, exists |
| `datetime` | `booking.pickupAt`, `vehicle.telemetry.lastSignalAt` | equals, notEquals, gt, gte, lt, lte, exists |
| `enum` | `booking.status`, `task.status`, `vehicle.health.severity` | equals, notEquals, in, notIn, exists |
| `string` | `payload.bookingId` | equals, notEquals, contains, startsWith, in, notIn, exists |
| `array` | (array fields) | contains, in, notIn, exists |

## Error codes

| Code | When |
|------|------|
| `CONDITION_FIELD_UNSUPPORTED` | Field not in registry allowlist |
| `CONDITION_INPUT_INVALID` | Invalid type, NaN, null where disallowed |
| `CONDITION_OPERATOR_INCOMPATIBLE` | Operator not allowed for field type |
| `CONDITION_SENSITIVE_FIELD_DENIED` | PII field without required permission |
| `CONDITION_TENANT_VIOLATION` | Payload organizationId mismatch |

## Rules

- No `eval`, no dynamic property access outside registry
- No silent `Number()` coercion — strict parsers per type
- NaN rejected explicitly
- null/undefined handled per operator (`exists` vs comparison)
- ISO-8601 datetimes only (locale-independent)
- Decimal comparison via BigInt scaling (no float drift)
- PII fields redacted in dry-run explain (`[boolean]`, `[string:N]`)
- Evaluation is pure — no side effects

## Removed unsafe patterns

- `Number(actual) > Number(expected)` silent coercion
- `` `payload.${field}` `` unbounded fallback paths
- Strict `===` without type normalization layer
- Prisma operator strings without normalization (`EQUALS` → `equals`)

## API

```typescript
workflowConditionEngine.evaluate(conditions, {
  organizationId,
  payload,
  permissions,
  dryRun,
});

workflowConditionEngine.explain(conditions, context); // dry-run with safe explain
workflowConditionEngine.listFields(); // registry metadata
```

Legacy `evaluateWorkflowConditions()` delegates to typed engine.

## Tests

`workflow-condition-engine.spec.ts` — 22 tests covering all types, edge cases, PII, tenant.
