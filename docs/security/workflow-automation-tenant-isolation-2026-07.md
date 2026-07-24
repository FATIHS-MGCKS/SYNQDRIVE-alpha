# Workflow Automation — Tenant Isolation & Scope Enforcement

**Status:** Accepted (2026-07)  
**Related:** `docs/architecture/WORKFLOW_DRY_RUN_2026-07.md`, `docs/architecture/ADR-WORKFLOW-AUTOMATION-RUNTIME-2026-07.md`

## Objective

Workflow automation must be **fail-closed** for organization boundaries, scope configuration, and referenced entities. No silent cross-tenant resolution, no empty scope lists meaning “all entities”, and no error messages leaking foreign IDs or PII.

## Enforcement layers

| Layer | Component | Behavior |
|-------|-----------|----------|
| Definition save | `validateWorkflowDefinition` + `WorkflowTenantGuardService.validateScopeDefinition` | Reject unknown/reserved scope types; reject empty scoped ID lists; verify scope IDs belong to org |
| Event ingress | `WorkflowEventService` + `WorkflowTenantGuardService.assertEventOrganization` | Require `organizationId`; reject org mismatch |
| LIVE execution | `WorkflowEngineService.processEvent` | Validate event entity refs before any workflow runs |
| Scope match | `evaluateWorkflowScope` | Fail-closed for unknown types and empty lists; booking/customer scopes supported |
| Action LIVE | `WorkflowActionExecutorService` | `validateEntityRefs` before side effects |
| Action preview | `WorkflowActionPreviewService` + dry-run | `tryValidateEntityRefs` — errors in plan, no throws for UX |
| Reads / mutations | `WorkflowsService` | All queries include `organizationId`; mutations use `updateMany`/`deleteMany` with org filter |

## Supported scope types

| Type | Runtime | Save-time ID field | Empty list |
|------|---------|-------------------|------------|
| `organization` | Always matches org-wide | — | N/A |
| `vehicle` | `vehicleId` in `vehicleIds` | `vehicleIds` | Rejected |
| `station` | `stationId` in `stationIds` | `stationIds` | Rejected |
| `booking` | `bookingId` in `bookingIds` | `bookingIds` | Rejected |
| `customer` | `customerId` in `customerIds` | `customerIds` | Rejected |
| `territory`, `fleet` | — | — | **Rejected at save** (not implemented) |
| Unknown | Fail-closed | Rejected | Rejected |

## Entity validation rules

Referenced entities must:

1. Belong to the workflow `organizationId` (DB query includes org filter — never post-filter in memory)
2. Not be archived when applicable:
   - **Station:** `archivedAt IS NULL`, `status = ACTIVE`
   - **Customer:** `archivedAt IS NULL`
   - **Booking:** status not `CANCELLED` or `NO_SHOW`
   - **Vehicle:** must exist in org (no archive column)

Generic error text only: e.g. `Referenced vehicle is not available in this organization` — **no foreign IDs in messages**.

## Master admin

`MASTER_ADMIN` may access any org route via `OrgScopingGuard`, but all workflow DB operations still scope by the **route `orgId`**. There is no workflow code path that reads by ID alone without `organizationId`.

## API surfaces covered

- CRUD + toggle + duplicate + delete
- Stats, list runs, get run
- Dry-run / test simulation
- Approve / reject action runs
- Domain event processing (`WorkflowEventService.emitEvent`)

## Tests

- `workflow-tenant-guard.service.spec.ts` — entity + scope definition guards
- `workflow-scope.evaluator.spec.ts` — scope matching fail-closed cases
- `workflows-tenant-isolation.service.spec.ts` — foreign workflow/run/approval reads
- `workflow-dry-run.service.spec.ts` — foreign entity dry-run skips actions
- `workflows.service.spec.ts` — empty/unknown/reserved scope at definition

## Remaining risks

- **Approval resume** still does not re-execute actions after approve (functional gap, not tenant)
- **Territory / fleet scopes** blocked at save until product design + backend implementation
- **Condition evaluator** trusts payload fields after entity refs are validated at ingress; malicious payload fields unrelated to entity refs are still inert unless conditions reference them
- **Task automation** (`task-automation` module) is a separate system with its own tenant rules
