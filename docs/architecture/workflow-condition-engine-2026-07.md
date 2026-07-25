# Workflow Condition Engine (Phase 6 Prompts 25–26)

Strictly typed condition evaluation with nested logical groups.

## Field types

| Type | Example fields | Allowed operators |
|------|----------------|-------------------|
| `boolean` | `customer.contact.whatsappAllowed`, `booking.cancelled` | equals, notEquals, is_true, is_false, exists |
| `integer` | `booking.pickupDelayMinutes` | equals, notEquals, in, notIn, gt, gte, lt, lte, exists |
| `decimal` | `invoice.amountDue` | equals, notEquals, in, notIn, gt, gte, lt, lte, exists |
| `datetime` | `booking.pickupAt`, `vehicle.telemetry.lastSignalAt` | equals, notEquals, gt, gte, lt, lte, exists |
| `enum` | `booking.status`, `task.status`, `vehicle.health.severity` | equals, notEquals, in, notIn, exists |
| `string` | `payload.bookingId` | equals, notEquals, contains, startsWith, in, notIn, exists |
| `array` | (array fields) | contains, in, notIn, exists |

## Condition tree structure

```typescript
type WorkflowConditionLogic = 'ALL' | 'ANY' | 'NOT';

interface WorkflowConditionClauseNode {
  kind: 'clause';
  fieldPath: string;
  operator: string;
  value?: unknown;
  sortOrder?: number;
}

interface WorkflowConditionGroupNode {
  kind: 'group';
  logic: WorkflowConditionLogic;
  children: Array<WorkflowConditionClauseNode | WorkflowConditionGroupNode>;
  sortOrder?: number;
}
```

Prisma `WorkflowConditionLogicOperator` maps: `AND` → `ALL`, `OR` → `ANY`, `NOT` → `NOT`.

### Example

```
ALL:
  - booking.pickupDelayMinutes >= 30
  - booking.status in CONFIRMED, READY_FOR_PICKUP
  - ANY:
      - customer.contact.whatsappAllowed = true
      - customer.contact.phoneAllowed = true
  - NOT:
      - booking.cancelled = true
```

## Limits

| Limit | Default | Env override |
|-------|---------|--------------|
| Max tree depth | 5 | `WORKFLOW_CONDITION_MAX_TREE_DEPTH` |
| Max clauses per workflow | 50 | `WORKFLOW_CONDITION_MAX_CLAUSE_COUNT` |
| Max total nodes | 100 | `WORKFLOW_CONDITION_MAX_NODE_COUNT` |
| Max payload bytes | 65536 | `WORKFLOW_CONDITION_MAX_PAYLOAD_BYTES` |

## Error codes

| Code | When |
|------|------|
| `CONDITION_FIELD_UNSUPPORTED` | Field not in registry allowlist |
| `CONDITION_INPUT_INVALID` | Invalid type, NaN, null where disallowed |
| `CONDITION_OPERATOR_INCOMPATIBLE` | Operator not allowed for field type |
| `CONDITION_SENSITIVE_FIELD_DENIED` | PII field without required permission |
| `CONDITION_TENANT_VIOLATION` | Payload organizationId mismatch |
| `CONDITION_GROUP_EMPTY` | ALL/ANY group has no children |
| `CONDITION_TREE_DEPTH_EXCEEDED` | Nesting exceeds max depth |
| `CONDITION_CLAUSE_COUNT_EXCEEDED` | Too many leaf clauses |
| `CONDITION_NODE_COUNT_EXCEEDED` | Too many total nodes |
| `CONDITION_PAYLOAD_TOO_LARGE` | Serialized tree exceeds byte limit |
| `CONDITION_STRUCTURE_INVALID` | Malformed tree node |
| `CONDITION_NOT_CHILD_COUNT` | NOT group must have exactly one child |

## Evaluation rules

- Deterministic child ordering by `sortOrder`
- Full result tree built for dry-run explainability (no short-circuit that drops partial results)
- Each clause result includes: `fieldPath`, `operator`, `maskedActual`, `expectedValue`, `passed`, `errorCode`
- PII fields redacted (`[boolean]`, `[string:N]`, etc.)
- No `eval`, no unbounded payload paths, no silent coercion
- Evaluation is pure — no side effects

## Legacy migration

- Flat `conditions[]` DTO/API lists → implicit `ALL` root group via `migrateLegacyConditionList()`
- Multiple top-level Prisma groups → wrapped in `ALL` root via `wrapTopLevelGroups()`
- Flat orchestrator `flatMap` removed — `evaluatePrismaConditionGroups()` builds nested tree from `parentGroupId`

## API

```typescript
workflowConditionTreeEngine.evaluateTree(rootGroup, context);
workflowConditionTreeEngine.explainTree(rootGroup, context); // dry-run with result tree

workflowConditionEngine.evaluate(flatConditions, context); // legacy ALL wrapper
evaluatePrismaConditionGroups(prismaGroups, context); // runtime path
validateConditionTree(root); // server-side structure validation
```

## DTO / OpenAPI

- `WorkflowConditionGroupDto` — nested `conditions` + `groups` with `logic: ALL|ANY|NOT|AND|OR`
- `CreateWorkflowDto` / `UpdateWorkflowDto` — optional `conditionTree` and `conditionGroups`

## UI types (prepared)

`frontend/src/types/workflow-conditions.ts` — mirror types for future condition builder UI.

## Tests

- `workflow-condition-engine.spec.ts` — typed clause evaluation
- `workflow-condition-tree.spec.ts` — ALL/ANY/NOT, nesting, limits, legacy migration, masking, determinism
