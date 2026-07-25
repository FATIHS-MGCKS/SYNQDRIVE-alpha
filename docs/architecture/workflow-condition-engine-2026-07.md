# Workflow Condition Engine (Phase 6 Prompts 25–27)

Strictly typed condition evaluation with nested logical groups and a full operator matrix.

## Operator matrix

| Operator | Allowed types | Example | Error cases |
|----------|---------------|---------|-------------|
| `equals` | boolean, integer, decimal, datetime, enum, string | `booking.status equals CONFIRMED` | Type mismatch, invalid enum, null actual |
| `notEquals` | boolean, integer, decimal, datetime, enum, string | `booking.status notEquals CANCELLED` | Type mismatch |
| `greaterThan` | integer, decimal, datetime | `booking.pickupDelayMinutes greaterThan 30` | Wrong type, invalid number/datetime |
| `greaterThanOrEqual` | integer, decimal, datetime | `invoice.amountDue greaterThanOrEqual 10.00` | Wrong type |
| `lessThan` | integer, decimal, datetime | `booking.pickupDelayMinutes lessThan 60` | Wrong type |
| `lessThanOrEqual` | integer, decimal, datetime | `booking.pickupDelayMinutes lessThanOrEqual 45` | Wrong type |
| `in` | integer, decimal, enum, string | `booking.status in [CONFIRMED, READY_FOR_PICKUP]` | Not array; empty array → false |
| `notIn` | integer, decimal, enum, string | `booking.status notIn [CANCELLED]` | Not array; empty array → true |
| `exists` | all types | `payload.bookingId exists` | — |
| `notExists` | all types | `booking.cancelled notExists` | — |
| `contains` | string, array | string substring or array membership | Wrong type; case-sensitive |
| `startsWith` | string | `payload.bookingId startsWith BK-` | Non-string; case-sensitive |
| `endsWith` | string | `payload.bookingId endsWith -EU` | Non-string; case-sensitive |
| `before` | datetime | `booking.pickupAt before 2026-07-25T10:00:00Z` | Non-datetime; invalid ISO |
| `after` | datetime | `booking.pickupAt after 2026-07-25T08:00:00Z` | Non-datetime; invalid ISO |
| `between` | datetime, integer, decimal | `{ from, to }` inclusive UTC/numeric bounds | `from > to`, invalid bounds |
| `changedFrom` | boolean, integer, decimal, datetime, enum, string | `booking.status changedFrom PENDING` | Missing `context.previous` |
| `changedTo` | boolean, integer, decimal, datetime, enum, string | `booking.status changedTo CONFIRMED` | Missing `context.previous` |
| `durationExceeded` | datetime | `{ minutes: 30 }` vs `context.evaluatedAtUtc` | Invalid duration spec |
| `withinTimeWindow` | datetime | `{ start: "09:00", end: "17:00" }` + `context.timezone` | Missing timezone; invalid HH:mm |
| `is_true` / `is_false` | boolean (legacy shortcuts) | `customer.contact.whatsappAllowed is_true` | Non-boolean actual |

**Aliases:** `gt`→`greaterThan`, `gte`→`greaterThanOrEqual`, `lt`→`lessThan`, `lte`→`lessThanOrEqual`, Prisma `GT`/`GTE`/etc.

**Intentionally unsupported:** `regex`, `matches`, `customScript` → `CONDITION_REGEX_NOT_ALLOWED`

## Context extensions (Prompt 27)

```typescript
interface WorkflowConditionEvaluationContext {
  organizationId: string;
  payload: Record<string, unknown>;
  timezone?: string;           // required for withinTimeWindow (IANA)
  previous?: Record<string, unknown>; // field path → previous value
  evaluatedAtUtc?: string;     // anchor for durationExceeded (UTC ISO)
}
```

Previous values may also be supplied via `payload._workflowContext.previous`.

## Temporal rules

- All datetime comparisons use **UTC** (`Date.parse` on ISO-8601 with `Z` or offset)
- `withinTimeWindow` converts UTC → local via `Intl` + explicit `context.timezone` (DST-safe)
- `durationExceeded` = `evaluatedAtUtc - actual > duration`
- Decimal ordering uses BigInt scaling (no float drift)
- String matching is **case-sensitive**; no free-text regex

## Field types

See `workflow-condition-operator-matrix.ts` (`WORKFLOW_CONDITION_OPERATOR_MATRIX`) for machine-readable matrix.

## Condition tree (Prompt 26)

Nested `ALL` / `ANY` / `NOT` groups — see prior sections in git history. Limits unchanged.

## Error codes (additional)

| Code | When |
|------|------|
| `CONDITION_CHANGE_CONTEXT_MISSING` | changedFrom/changedTo without previous |
| `CONDITION_TIMEZONE_REQUIRED` | withinTimeWindow without timezone |
| `CONDITION_REGEX_NOT_ALLOWED` | regex/matches operator rejected |

## Tests

- `workflow-condition-engine.spec.ts` — core typed evaluation
- `workflow-condition-tree.spec.ts` — nested groups
- `workflow-condition-operators.spec.ts` — full operator matrix, DST, UTC, decimal, null, boundaries

## API

```typescript
workflowConditionEngine.evaluate(conditions, {
  organizationId,
  payload,
  timezone,
  previous,
  evaluatedAtUtc,
  dryRun,
});
```

Source of truth: `backend/src/modules/workflows/conditions/workflow-condition-operators.ts`
