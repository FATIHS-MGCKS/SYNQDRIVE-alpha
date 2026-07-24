# Evaluations Recommendation Integrations (Prompt 38/54)

**Version:** V4.9.835  
**Domain:** `OrgRecommendation` → canonical SynqDrive modules  
**API:** `GET/POST /organizations/:orgId/evaluations/recommendations/:id/integrations`

## Overview

Links evaluations recommendations and risks to existing operational modules without parallel task/workflow systems. Reuses `TasksService.upsertByDedup`, `ServiceCasesService`, `WorkflowEventService`, and frontend `RentalEntityNavigation`.

## Supported actions

| Action | Mode | Backend module | Example |
|--------|------|----------------|---------|
| `CREATE_TASK` | execute | `TasksService.upsertByDedup` | Maintenance risk → org task |
| `CREATE_REMINDER` | execute | Tasks (follow-up dedup key) | Overdue receivable → reminder task |
| `OPEN_SERVICE_CASE` | execute | `ServiceCasesService.create` | Wartungsrisiko → HEALTH service case |
| `START_WORKFLOW` | execute | `WorkflowEventService.emitEvent` | Underutilization → `utilization_review` workflow |
| `ASSIGN_OWNER` | execute | `OrgRecommendationsRepository` | Owner assignment with audit event |
| `OPEN_VEHICLE` | navigate | `RentalEntityNavigation` | Vehicle detail |
| `OPEN_BOOKING` | navigate | `RentalEntityNavigation` | Booking detail |
| `OPEN_CUSTOMER` | navigate | `RentalEntityNavigation` | Customer detail |
| `OPEN_INVOICE` | navigate | `RentalEntityNavigation` | Invoice detail |
| `OPEN_SETTINGS_INTEGRATIONS` | navigate | Settings `data-authorization` tab | Data quality / integration issues |

## Reused modules (no parallel systems)

- **Tasks:** `evaluations:recommendation:{id}:task` dedup key, metadata `recommendationId`, link columns (`vehicleId`, `bookingId`, `customerId`, `invoiceId`)
- **Service cases:** `source: HEALTH`, metadata back-link `recommendationId`
- **Workflows:** event type `evaluations.recommendation.action`, idempotency `evaluations:recommendation:{id}:workflow`
- **Navigation:** `executeRecommendationIntegrationNavigation` + existing rental router callbacks

## Security

- `OrgScopingGuard` + tenant check `assertSameOrganization`
- Entity validation per type (`RecommendationEntityValidationService`) — cross-tenant IDs → `404`
- Mutations: `PermissionsGuard` + `tasks.write`
- List integrations: role-based `FORBIDDEN` state for execute actions

## Duplicate handling

- **Tasks:** `findActiveByDedup` → UI state `DUPLICATE`, execute returns `409 RECOMMENDATION_TASK_DUPLICATE`
- **Service cases:** open case with `metadata.recommendationId` → `DUPLICATE` / `409`
- **Workflows:** idempotency key on event; empty `workflowRunIds` = cancelled/no matching workflow (recorded in audit)

## Audit / back-link

`OrgRecommendationEvent` types: `TASK_LINKED`, `REMINDER_LINKED`, `SERVICE_CASE_LINKED`, `WORKFLOW_STARTED`, `OWNER_ASSIGNED`

Task/service metadata includes full source context (`recommendationSourceType`, `recommendationSourceId`, title, rationale).

## Files

| Path | Role |
|------|------|
| `shared/evaluations-insights/evaluations-recommendation-integrations.ts` | Action catalog, dedup keys, metadata |
| `backend/.../recommendation-integrations.service.ts` | Execute + list |
| `backend/.../recommendation-entity-validation.service.ts` | Tenant-safe entity checks |
| `frontend/.../EvaluationsRecommendationIntegrations.tsx` | Drawer integration panel |
| `frontend/.../useEvaluationsRecommendationIntegrations.ts` | API hook |

## Tests

| Test | Coverage |
|------|----------|
| `evaluations-recommendation-integrations.shared.spec.ts` | Catalog, dedup keys, workflow mapping |
| `recommendation-integrations.service.spec.ts` | Task create, duplicate, tenant, service case, workflow, forbidden |
| `evaluations-recommendation-integrations-navigation.test.ts` | Vehicle + settings navigation |
| `evaluations-action-center.spec.ts` (E2E) | Integrations panel visible in drawer |

## Remaining gaps

- No auto-bridge from insight detectors → recommendations (producer deferred)
- Workflow matching depends on org-configured `evaluations.recommendation.action` triggers
- Invoice entity not yet in Prisma recommendation producer paths — supported when present in `affectedEntities`
- Task deep-link by ID from evaluations (navigates to tasks list only)
- Station/driver entity navigation not exposed (entities validated, no dedicated surface)
