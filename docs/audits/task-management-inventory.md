# Task Management — Read-only Inventory Audit

**Date:** 2026-07-15  
**Scope:** SynqDrive repository — backend, frontend (rental, operator, master), tests, architecture references  
**Mode:** Read-only. No schema, business-logic, or UI changes were made.

---

## Methodology

Documents and rules read:

| Source | Relevance |
|--------|-----------|
| `AGENTS.md` | Repo layout, architecture rules (multi-tenant, no hardcoded IDs) |
| `.cursor/rules/projektregel.mdc` | Preserve `TasksService` as canonical path; no parallel task architectures |
| `.cursor/rules/Architectur-Updates.mdc` | (Not updated — audit only) |
| `frontend/src/master/components/ArchitekturView.tsx` | Tasks module, insight bridge, operator, service center |
| `frontend/src/master/components/ChangesView.tsx` | Historical task-related releases (V4.7.59–V4.9.18) |
| `docs/booking-document-lifecycle.md` | Document bundle context (indirect task trigger) |

Repository searches executed (representative):

```bash
# Backend writes / reads
rg 'orgTask\.(create|update|updateMany|upsert)' backend --glob '*.{ts,tsx}'
rg 'OrgTask|TasksService|TaskAutomation|upsertByDedup|dedupKey|sourceType|TaskEvent' backend --glob '*.{ts,tsx}'
rg 'ensureBookingLifecycleTasks|closeLinkedTasks|closeStale|materializeCompliance|convertToTask' backend
rg 'orgTask|TasksService' backend/src/workers

# Frontend surfaces
rg 'api\.tasks\.|materializeComplianceTask|convertToTask' frontend --glob '*.{ts,tsx}'
glob '**/*task*' (backend + frontend)
```

---

## 0. Data model summary (`backend/prisma/schema.prisma`)

### Enums (lines 3651–3697)

| Enum | Values |
|------|--------|
| `TaskStatus` | `OPEN`, `IN_PROGRESS`, `WAITING`, `DONE`, `CANCELLED` |
| `TaskPriority` | `LOW`, `NORMAL`, `HIGH`, `CRITICAL` |
| `TaskType` | `VEHICLE_SERVICE`, `VEHICLE_INSPECTION`, `TIRE_CHECK`, `BRAKE_CHECK`, `BATTERY_CHECK`, `VEHICLE_CLEANING`, `BOOKING_PREPARATION`, `BOOKING_PICKUP`, `BOOKING_RETURN`, `DOCUMENT_REVIEW`, `INVOICE_REQUIRED`, `CUSTOMER_FOLLOWUP`, `REPAIR`, `CUSTOM` |
| `TaskSource` (`sourceType` column) | `MANUAL`, `SYSTEM`, `ALERT`, `HEALTH`, `BOOKING`, `DOCUMENT`, `VENDOR` |

### `OrgTask` (lines 3699–3780)

Key fields: `title`, `description`, `category`, `type`, `status`, `priority`, link IDs (`vehicleId`, `bookingId`, `customerId`, `vendorId`, `alertId`, `documentId`, `fineId`, `invoiceId`, `serviceCaseId`), lifecycle (`assignedUserId`, `dueDate`, `startedAt`, `completedAt`, `cancelledAt`), costs (`estimatedCostCents`, `actualCostCents`), `resolutionNote`, `blocksVehicleAvailability`, `metadata`, audit (`createdByUserId`, `updatedByUserId`), provenance (`source` string, `sourceType`, `dedupKey`).

- **Unique constraint:** `(organizationId, dedupKey)` — `org_tasks_org_dedup_key`
- **Relations (Prisma):** `fine`, `invoice`, `serviceCase`, `checklistItems`, `comments`, `attachments`, `events`, `vehicleDamages`
- **No Prisma FK** to `Vehicle`, `Booking`, `Customer`, `Vendor`, `DashboardInsight` — org ownership validated in `TasksService.assertLinksBelongToOrg`

### `TaskEvent` (lines 3835–3848)

Immutable timeline: `type` (free string), `actorUserId`, `oldValue`, `newValue`, `metadata`, `createdAt`. Cascade delete with task.

### Migrations (task-related)

| Migration | Purpose |
|-----------|---------|
| `20260608000000_service_compliance_auto_tasks` | `source`, `dedupKey` on `OrgTask` |
| `20260614000000_task_status_waiting` | `WAITING` status value |
| `20260614000100_task_action_layer` | TaskType, TaskSource, child tables, indexes |
| `20260616160000` (referenced in Architektur) | TaskPriority canonicalization |
| `20260619120000_task_blocks_vehicle_availability` | `blocksVehicleAvailability` |

---

## 1. File and callsite matrix

### 1.1 Backend — core module

| File | Role | Task operations |
|------|------|-----------------|
| `backend/src/modules/tasks/tasks.module.ts` | Nest module | Exports `TasksService`, `TaskAutomationService`, `VehicleCleaningTaskService` |
| `backend/src/modules/tasks/tasks.controller.ts` | REST `organizations/:orgId/tasks/*` | List, summary, CRUD-ish, assign/start/waiting/complete/cancel, comments/checklist/attachments, per-entity list routes |
| `backend/src/modules/tasks/tasks.service.ts` | **Canonical write/read service** | `createManualTask`, `upsertByDedup`, `updateTask`, `changeStatus`, `assignTask`, child resources, `closeStaleInsightTasks`, `closeStaleBookingLifecycleTasks`, `getDashboardSummary` |
| `backend/src/modules/tasks/task-automation.service.ts` | Booking/document/vendor automation | `ensureBookingLifecycleTasks`, `ensureDocumentTask`, `ensureRepairTask` (no callers) |
| `backend/src/modules/tasks/vehicle-cleaning-task.service.ts` | Cleaning status hook | `ensureCleaningTask`, `completeOpenCleaningTasks` |
| `backend/src/modules/tasks/task-templates.ts` | Checklist seeds by `TaskType` | Read-only templates |
| `backend/src/modules/tasks/task-priority.util.ts` | Legacy `MEDIUM`/`URGENT` → canonical | Used by workflow executor |
| `backend/src/modules/tasks/dto/task.dto.ts` | Validation DTOs | `CreateTaskDto`, `UpdateTaskDto`, `ListTasksQueryDto`, etc. |

### 1.2 Backend — producers (by domain)

| File | Method(s) | Mechanism |
|------|-----------|-----------|
| `tasks.controller.ts` | All mutation routes | → `TasksService` |
| `task-automation.service.ts` | `ensureBookingLifecycleTasks`, `ensureDocumentTask` | → `TasksService.upsertByDedup` |
| `insight-task-bridge.service.ts` | `materialize` | → `upsertByDedup` + `closeStaleInsightTasks` |
| `compliance-task-materialize.service.ts` | `materializeSignal`, `upsertFromSignal` | → `upsertByDedup` |
| `booking-document-bundle.service.ts` | `syncMissingDocumentTasks` | → `taskAutomation.ensureDocumentTask` |
| `bookings.service.ts` | `create`, `update` (status change) | → `taskAutomation.ensureBookingLifecycleTasks` (fire-and-forget) |
| `invoices.service.ts` | `create`, `issue` → `createUnpaidTask`; `recordPayment` → `closeLinkedTasks` | upsert + **direct Prisma close** |
| `fines.service.ts` | `create` | → `upsertByDedup` |
| `vehicle-cleaning-task.service.ts` | `ensureCleaningTask`, `completeOpenCleaningTasks` | upsert + `completeTask` |
| `vehicles.controller.ts` | `PATCH .../vehicles/:id/status` (`cleaningStatus`) | → cleaning service |
| `vehicles.service.ts` | `createVehicleComplaint` | **direct `prisma.orgTask.create`** |
| `workflow-action-executor.service.ts` | `execTaskCreate`, `execAlertCreate`, `execNotificationPrepare`, `execAiSuggest` | → `upsertByDedup` |
| `technical-observations.service.ts` | `convertToTask` | → `createManualTask` |
| `whatsapp-quick-actions.service.ts` | `createTaskFromConversation` | → `createManualTask` |
| `whatsapp-ai-tools.service.ts` | `createHumanReviewTask` | → `tasks.create` → `createManualTask` |
| `vehicle-intelligence.controller.ts` | `POST .../compliance-task-signals/:key/materialize` | → compliance materialize |

### 1.3 Backend — readers (no writes)

| File | Usage |
|------|-------|
| `bookings.service.ts` | `getBookingDetail`: `prisma.orgTask.findMany` + embedded `tasks` counts in DTO |
| `service-cases.service.ts` | Includes linked tasks in case detail (read only) |
| `invoice-list-item.mapper.ts` | `openTasks` enrichment for invoice list |
| `scripts/ops/cleanup-invalid-invoices.ts` | `orgTask.updateMany` — unlinks `invoiceId` only |

### 1.4 Backend — schedulers / workers

| Component | File | Task interaction |
|-----------|------|------------------|
| Business insights cron | `business-insights-scheduler.service.ts` | Cron `2,32 * * * *` → `NotificationEvaluationService` → `BusinessInsightsService.runForOrganization` → `InsightTaskBridgeService.materialize` |
| Notification evaluation | `notification-evaluation.service.ts` | Indirect — triggers insights run |
| Invoice overdue cron | `invoice-overdue-scheduler.service.ts` | Invoice status only — **no OrgTask** |
| Workers (`backend/src/workers/**`) | — | **No** `OrgTask` / `TasksService` usage found |

### 1.5 Frontend — API client

| File | Surface |
|------|---------|
| `frontend/src/lib/api.ts` (`api.tasks`) | `list`, `summary`, `get`, `create`, `update`, `assign`, `start`, `waiting`, `complete`, `cancel`, `addComment`, `addChecklistItem`, `updateChecklistItem`, `addAttachment`, `forVehicle`, `forBooking`, `forVendor`, `forCustomer` |
| `frontend/src/lib/api.ts` | `api.vehicleIntelligence.materializeComplianceTask` — separate from `api.tasks.create` |
| `frontend/src/lib/api.ts` | `api.vehicles.technicalObservations.convertToTask` |
| `frontend/src/lib/api.ts` | `api.serviceCases.*` — defined, **not used** by service-center task UI |

### 1.6 Frontend — UI surfaces

| Entry / route | Component(s) | Primary API |
|---------------|--------------|-------------|
| Rental `currentView: tasks` | `TasksView.tsx`, `GlobalTaskDetailPanel.tsx` | `list`, `summary`, `get`, `create`, mutations |
| Rental `currentView: vehicle-tasks` | `VehicleTasksView.tsx`, `VehicleTaskDetailDrawer.tsx` | `forVehicle`, `get`, mutations |
| Rental fleet → Zustand & Service | `FleetHealthServiceTasksPanel` → `ServiceTasksPanel.tsx` | `list`, `summary` via `useServiceCenterData` |
| Service overview | `ServiceOverviewPanel.tsx` | Props + direct `complete`/`waiting` |
| Vehicle overview | `VehicleServiceContextPanel.tsx` | `forVehicle`, `ServiceTaskCreateModal` |
| Health | `HealthServiceActions.tsx`, `ComplianceTaskActions.tsx`, `TechnicalObservationsHealthModule.tsx` | `forVehicle`, `materializeComplianceTask`, `convertToTask` |
| Damages | `CreateRepairTaskDialog.tsx`, `useVehicleDamageActions.ts` | `api.tasks.create` |
| Booking detail tab | `BookingTasksTimelineTab.tsx` → `EntityTasksSection.tsx` | `forBooking` (read-only) |
| Vendor detail | `VendorOperationalTasks.tsx` | `forVendor` (read-only) |
| Notifications | `notification-task-bridge.ts` → `ServiceTaskCreateModal` | `create` with health prefill |
| Operator `/operator` (today) | `OperatorTodayView.tsx`, `OperatorBookingTaskGroupCard.tsx` | Tasks from `OperatorDataContext` |
| Operator `/operator?tab=tasks` | `OperatorTasksView.tsx`, `OperatorTaskSheet.tsx` | `list` (+ filtered), `summary` |
| Master support | `SupportOpsWorkspace.tsx` | `api.tasks.create` (follow-up) |
| Voice assistant | `VoiceConversationsPanel.tsx` | `api.tasks.create` |
| TopBar search | `TopBar.tsx` | `api.tasks.list` |

### 1.7 Tests

| File | Coverage |
|------|----------|
| `backend/src/modules/tasks/tasks.service.spec.ts` | Create, dedup, assign, status machine, resolution notes, overdue, dashboard, tenant scoping (22 tests) |
| `backend/src/modules/tasks/vehicle-cleaning-task.service.spec.ts` | Cleaning materialize/complete (3 tests) |
| `backend/src/modules/tasks/task-priority.util.spec.ts` | Priority normalization |
| `backend/src/modules/vehicle-intelligence/service-compliance/compliance-task-materialize.service.spec.ts` | Dedup reuse, `suggestionOnly` metadata |
| `backend/src/modules/technical-observations/technical-observations.service.spec.ts` | `convertToTask` |
| `backend/src/modules/whatsapp/whatsapp-domain-integration.spec.ts` | WhatsApp task create |
| `backend/src/modules/invoices/invoices.pipeline.integration.spec.ts` | Cases incl. unpaid task create (04), payment closes task (35), PAID without `recordPayment` leaves task open (51) |
| `backend/src/modules/documents/documents.service.spec.ts` | Bundle with mocked `taskAutomation` |
| `frontend/src/rental/lib/task-*.test.ts` | Display mapping, list utils, operator utils, damage-repair payload |
| `frontend/src/operator/tasks/operatorTodayTasks.test.ts` | Today tab grouping |
| `frontend/e2e/` | **No** dedicated task E2E specs found |

---

## 2. Task producers (complete registry)

| # | Producer | Trigger | TaskType | `source` | `sourceType` | `dedupKey` | Entity links |
|---|----------|---------|----------|----------|--------------|------------|--------------|
| P1 | `TasksController.create` | `POST .../tasks` | From DTO (default `CUSTOM`) | `sourceKey` or null | DTO `source` (default `MANUAL`) | none | Optional links + `serviceCaseId` |
| P2 | `TaskAutomationService.ensureBookingLifecycleTasks` | Booking `create`; booking `update` when status changes | See booking table below | `BOOKING` | `BOOKING` | `booking:*` | `vehicleId`, `bookingId`, `customerId` |
| P3 | `TaskAutomationService.ensureDocumentTask` | `BookingDocumentBundleService.syncMissingDocumentTasks` | `DOCUMENT_REVIEW` or `INVOICE_REQUIRED` | `DOCUMENT` | `DOCUMENT` | `document:{kind}:{ref}` | `documentId?`, `bookingId?`, `vehicleId?` |
| P4 | `TaskAutomationService.ensureRepairTask` | **No call sites in repo** | `REPAIR` | `VENDOR` | `VENDOR` | `vendor:repair:{vehicleId}:{vendorId\|none}:{reason}` | `vehicleId`, `vendorId?` |
| P5 | `InsightTaskBridgeService.materialize` | After `BusinessInsightsService.runForOrganization` | Per insight type (see §2.1) | `INSIGHT_*` | `ALERT` | Candidate `dedupeKey` | `vehicleId`, `alertId?` |
| P6 | `ComplianceTaskMaterializeService.upsertFromSignal` | `POST .../compliance-task-signals/:key/materialize` | From signal | `INSIGHT_SERVICE` / `INSIGHT_COMPLIANCE` | `ALERT` | `{dedupeBase}:{vehicleId}` | `vehicleId` |
| P7 | `InvoicesService.createUnpaidTask` | Incoming create (reviewable statuses); outgoing `issue` | `INVOICE_REQUIRED` | `INVOICE` | `SYSTEM` | `invoice:unpaid:{invoiceId}` | `invoiceId` |
| P8 | `FinesService.create` | Fine create | `CUSTOMER_FOLLOWUP` | `FINE` | `SYSTEM` | `fine:{fineId}` | `vehicleId`, `customerId?`, `fineId` |
| P9 | `VehicleCleaningTaskService.ensureCleaningTask` | `PATCH` vehicle status `cleaningStatus=NEEDS_CLEANING` | `VEHICLE_CLEANING` | `VEHICLE_CLEANING` | `SYSTEM` | `vehicle:cleaning:{vehicleId}` | `vehicleId` |
| P10 | `WorkflowActionExecutor` (4 actions) | Workflow run | `CUSTOM` | `WORKFLOW_*` | `SYSTEM` | `{idempotencyKey}:action:{index}:{suffix}` | `vehicleId?`, `bookingId?` |
| P11 | `TechnicalObservationsService.convertToTask` | API convert | `CUSTOM` | `TECHNICAL_OBSERVATION` | `HEALTH` | none | `vehicleId`, `bookingId?`, `customerId?` |
| P12 | `WhatsAppQuickActionsService.createTaskFromConversation` | WhatsApp ops | Mapped from category | `WHATSAPP` | `SYSTEM` | none | `customerId?`, `bookingId?`, `vehicleId?` |
| P13 | `WhatsAppAiToolsService.createHumanReviewTask` | AI router | `CUSTOMER_FOLLOWUP` | `WHATSAPP_AI_ROUTER` | `SYSTEM` | none | `customerId?`, `bookingId?`, `vehicleId?` |
| P14 | `VehiclesService.createVehicleComplaint` | `POST` vehicle complaint | **Not set** (defaults `CUSTOM`) | **Not set** | **Not set** (DB default `MANUAL`) | none | `vehicleId` only |
| P15 | Frontend manual creates | Various UI | User-selected | `sourceKey` in some flows | Usually `MANUAL` / `HEALTH` | none | Per form |

### 2.1 Booking lifecycle dedup keys (`TaskAutomationService`)

| Booking status | dedupKey | TaskType | Title (DE) |
|----------------|----------|----------|------------|
| `CONFIRMED` | `booking:prep:{id}` | `BOOKING_PREPARATION` | Buchung vorbereiten |
| `CONFIRMED` | `booking:clean:{id}` | `VEHICLE_CLEANING` | Fahrzeug reinigen |
| `CONFIRMED` | `booking:document:{id}` | `DOCUMENT_REVIEW` | Buchungsdokumente prüfen |
| `ACTIVE` | `booking:pickup:{id}` | `BOOKING_PICKUP` | Fahrzeugübergabe (Pickup) |
| `COMPLETED` | `booking:return:{id}` | `BOOKING_RETURN` | Fahrzeugrücknahme (Return) |
| `COMPLETED` | `booking:invoice:{id}` | `INVOICE_REQUIRED` | Schlussrechnung erstellen/prüfen |

**Not triggered:** `bookings.service.cancel` (lines 1740–1771) does **not** call `ensureBookingLifecycleTasks` or any task closer. `markNoShow` also has no task automation call (verified: no `taskAutomation` in cancel/no-show paths).

### 2.2 Insight bridge mapping (`insight-task-bridge.service.ts` lines 29–36)

| InsightType | source | taskType |
|-------------|--------|----------|
| `SERVICE_OVERDUE` | `INSIGHT_SERVICE` | `VEHICLE_SERVICE` |
| `TUV_OVERDUE` | `INSIGHT_COMPLIANCE` | `VEHICLE_INSPECTION` |
| `BOKRAFT_OVERDUE` | `INSIGHT_COMPLIANCE` | `VEHICLE_INSPECTION` |
| `TIRE_CRITICAL` | `INSIGHT_HEALTH` | `TIRE_CHECK` |
| `BRAKE_CRITICAL` | `INSIGHT_HEALTH` | `BRAKE_CHECK` |
| `BATTERY_CRITICAL` | `INSIGHT_HEALTH` | `BATTERY_CHECK` |

Bridge filters: `entityScope === VEHICLE`, exactly one `entityId`, type in `TASK_TYPE_CONFIG`.

### 2.3 All `dedupKey` / `dedupeKey` formats observed

**Production task writers:**

| Pattern | Producer |
|---------|----------|
| `booking:prep:{bookingId}` | TaskAutomation |
| `booking:clean:{bookingId}` | TaskAutomation |
| `booking:document:{bookingId}` | TaskAutomation |
| `booking:pickup:{bookingId}` | TaskAutomation |
| `booking:return:{bookingId}` | TaskAutomation |
| `booking:invoice:{bookingId}` | TaskAutomation |
| `document:{kind}:{ref}` | TaskAutomation `ensureDocumentTask` (`ref` = documentId ?? bookingId ?? vehicleId ?? `unknown`) |
| `vendor:repair:{vehicleId}:{vendorId\|none}:{reason}` | TaskAutomation (unused) |
| `invoice:unpaid:{invoiceId}` | InvoicesService |
| `fine:{fineId}` | FinesService |
| `vehicle:cleaning:{vehicleId}` | VehicleCleaningTaskService |
| `service_overdue:{vehicleId}` | Compliance signals + insight candidates |
| `tuv_overdue:{vehicleId}` | Compliance signals + insight candidates |
| `bokraft_overdue:{vehicleId}` | Compliance signals + insight candidates |
| `hm_no_tracking:{vehicleId}` | Compliance insight candidates only — **not** in insight-task bridge `TASK_TYPE_CONFIG` |
| `tire_critical:{vehicleId}` | Insight detector → bridge |
| `brake_critical:{vehicleId}` | Insight detector → bridge |
| `battery_critical:{vehicleId}` | Insight detector → bridge |
| `{idempotencyKey}:action:{index}:task\|alert\|notification\|ai_suggest` | WorkflowActionExecutor |
| `{dedupKey}:closed:{existingTaskId}` | `TasksService.upsertByDedup` when recycling a closed row |

**Insight detectors (candidates — only health/compliance subset bridged to tasks):**

`low_utilization:{id}`, `station_shortage:{id}`, `driving_assessment_device_quality:{vehicleId}`, `return_inspection:{bookingId}`, `pickup_overdue:{bookingId}`, `service_window:{vehicleId}`, `service_before_booking:{vehicleId}:{bookingId}`, `tight_handover:{vehicleId}:{currentId}:{nextId}`, `grouped:{groupKey}`, `{kind.key}:{vehicle.id}` (compliance insights builder)

### 2.4 All `source` string values on `OrgTask.source`

| Value | Set by |
|-------|--------|
| `BOOKING` | TaskAutomation lifecycle |
| `DOCUMENT` | TaskAutomation documents |
| `VENDOR` | TaskAutomation repair (unused) |
| `INSIGHT_SERVICE` | Insight bridge, compliance materialize |
| `INSIGHT_COMPLIANCE` | Insight bridge, compliance materialize |
| `INSIGHT_HEALTH` | Insight bridge |
| `INVOICE` | InvoicesService |
| `FINE` | FinesService |
| `VEHICLE_CLEANING` | VehicleCleaningTaskService |
| `TECHNICAL_OBSERVATION` | TechnicalObservationsService |
| `WHATSAPP` | WhatsApp quick actions |
| `WHATSAPP_AI_ROUTER` | WhatsApp AI tools |
| `WORKFLOW_AUTOMATION` | Workflow executor |
| `WORKFLOW_ALERT` | Workflow executor |
| `WORKFLOW_NOTIFICATION_PREPARE` | Workflow executor |
| `WORKFLOW_AI_SUGGEST` | Workflow executor |
| `null` | Manual tasks without `sourceKey` |

### 2.5 All `sourceType` (`TaskSource` enum) usages

| Value | Set by |
|-------|--------|
| `MANUAL` | `createManualTask` default; controller; vehicle complaint (implicit default) |
| `SYSTEM` | Invoices, fines, workflows, WhatsApp, vehicle cleaning |
| `ALERT` | Insight bridge, compliance materialize |
| `HEALTH` | Technical observation convert |
| `BOOKING` | TaskAutomation lifecycle |
| `DOCUMENT` | TaskAutomation documents |
| `VENDOR` | TaskAutomation repair (unused) |

---

## 3. Status change paths

### 3.1 Canonical path (`TasksService.changeStatus`)

| API / method | Transition | TaskEvent |
|--------------|------------|-----------|
| `startTask` | → `IN_PROGRESS` (sets `startedAt` if empty) | `STATUS_CHANGED` |
| `moveTaskToWaiting` | → `WAITING` | `STATUS_CHANGED` |
| `completeTask` | → `DONE` (resolution note required for `RESOLUTION_REQUIRED_TYPES`) | `STATUS_CHANGED` |
| `cancelTask` | → `CANCELLED` (sets `cancelledAt`) | `STATUS_CHANGED` |
| Legacy `update(status)` | Validated transition | `STATUS_CHANGED` |
| `assignTask` | No status change | `ASSIGNED` |
| `updateTask` | Field updates only | `UPDATED` |
| `createManualTask` | Creates `OPEN` | `CREATED` |
| `upsertByDedup` (new row) | Creates `OPEN` | `CREATED` (metadata `{ auto: true }`) |
| `upsertByDedup` (escalate) | Status unchanged | No status event |
| `addComment` / checklist / attachment | — | `COMMENT_ADDED`, etc. |

**State machine** (`tasks.service.ts` lines 16–22): terminal `DONE` and `CANCELLED` have no outbound transitions.

**Resolution required types** (lines 25–32): `REPAIR`, `BRAKE_CHECK`, `TIRE_CHECK`, `BATTERY_CHECK`, `VEHICLE_SERVICE`, `VEHICLE_INSPECTION`.

### 3.2 Status changes outside `TasksService.changeStatus`

| File | Method | Transition | TaskEvent? |
|------|--------|------------|------------|
| `invoices.service.ts:818–820` | `closeLinkedTasks` | any non-`DONE` → `DONE` | **No** |
| `tasks.service.ts:951` | `closeStaleInsightTasks` | active → `DONE` | **No** |
| `tasks.service.ts:982` | `closeStaleBookingLifecycleTasks` | active → `DONE` | **No** |
| `vehicle-cleaning-task.service.ts:50–53` | `ensureCleaningTask` | `dedupKey` backfill only | **No** (not status) |

### 3.3 Indirect completes (via `TasksService.completeTask` — **with** TaskEvent)

| File | Method | Notes |
|------|--------|-------|
| `vehicle-cleaning-task.service.ts` | `completeOpenCleaningTasks` | Resolution note: `"Vehicle marked as clean"` |

---

## 4. Auto-close paths

| Path | Trigger | Scope | Mechanism | TaskEvent? |
|------|---------|-------|-----------|------------|
| Insight stale close | Each insights run after bridge upserts | `source IN (INSIGHT_SERVICE, INSIGHT_COMPLIANCE, INSIGHT_HEALTH)` AND active status AND `dedupKey NOT IN` current run keys | `closeStaleInsightTasks` → direct `DONE` | No |
| Booking phase supersede | Booking status transition | Same `bookingId`, `source=BOOKING`, active, dedupKey not in active set for new phase | `closeStaleBookingLifecycleTasks` | No |
| Invoice fully paid | `InvoicesService.recordPayment` when `outstanding === 0` | Tasks with `invoiceId` | `closeLinkedTasks` → direct `DONE` | No |
| Vehicle marked clean | `cleaningStatus=CLEAN` | All active `VEHICLE_CLEANING` for vehicle | `completeOpenCleaningTasks` → `completeTask` | **Yes** |

**Gaps (factual):**

- `payment-reconciliation.service.ts` — no `OrgTask` references; invoice PAID via reconciliation does not call `closeLinkedTasks` (documented by integration test case 51, `invoices.pipeline.integration.spec.ts:763–779`).
- Booking `cancel` / `NO_SHOW` — no auto-close of open booking lifecycle tasks.
- Document tasks — no auto-close when missing documents are later generated (only upsert on `syncMissingDocumentTasks`; no stale-close for `source=DOCUMENT`).

---

## 5. UI surfaces (mutations and derivation)

### 5.1 Exposed status transitions in UI

| Transition | API | Rental | Operator | Service center |
|------------|-----|--------|----------|----------------|
| → `IN_PROGRESS` | `PATCH .../start` | Drawers, panel, service panel | Card, detail | Panel, overview (partial) |
| → `WAITING` | `PATCH .../waiting` | Drawers, panel | Detail only | Panel, overview |
| → `DONE` | `PATCH .../complete` | Drawers, panel | Card, detail | Panel; overview **without** resolution-note gate |
| → `CANCELLED` | `PATCH .../cancel` | Drawers, panel | **Not exposed** | **Not exposed** |

### 5.2 UI-derived status / grouping / progress (not persisted)

| Location | Behavior |
|----------|----------|
| `task-list.utils.ts` `mapTaskStatus` | Synthetic `Overdue`; lumps `DONE`+`CANCELLED` → `Completed` |
| `task-display.utils.ts` | Overdue badge; client filter buckets |
| `task-operator.utils.ts` | Six queue groups, next-best-action, operator rank, blocking badges |
| `TasksView.tsx` | All list/KPI chip filters on client-mapped rows |
| `operatorTask.utils.ts` | Client filter + partial server filter via `buildTaskListApiFilters` |
| `OperatorDataContext.tsx` | Drops `DONE`/`CANCELLED` after full list fetch |
| `operatorTodayTasks.ts` | Groups `BOOKING_PREPARATION` / `VEHICLE_CLEANING` / `DOCUMENT_REVIEW` by `bookingId` |
| `service-task-filters.ts` | Client filter/sort on loaded tasks |
| `service-task-semantics.ts` | `checklistProgress` for display |
| `task-responsibility.utils.ts` | Display-only assignee routing |

Server-provided: `ApiTask.isOverdue`, `ApiTask.status`, booking detail embedded `tasks.*` counts.

### 5.3 UI fields collected but not persisted

| Surface | Field | In `CreateTaskPayload`? |
|---------|-------|------------------------|
| `TasksView.tsx` 4-step create | `estimatedDuration` | **No** — list shows `'—'` |
| `TasksView.tsx` 4-step create | `notes` (summary step) | **No** |
| `NewTaskModal.tsx` | All fields | Component wired in `App.tsx` but **never opened** (`setIsNewTaskModalOpen(true)` has no callers) |
| `TasksSectionView.tsx` | — | **Not imported** anywhere |

`stationId` is persisted via `metadata.stationId` from create flows that send it.

### 5.4 Parallel / legacy task APIs

| API | Used by task UI? |
|-----|------------------|
| `api.tasks.*` (`/organizations/:orgId/tasks`) | Primary |
| `api.vehicleIntelligence.materializeComplianceTask` | `ComplianceTaskActions.tsx` |
| `api.vehicles.technicalObservations.convertToTask` | `TechnicalObservationsHealthModule.tsx` |
| `api.serviceCases.*` | Defined; service center remains task-based |
| `BookingDetailDto.tasks` | KPI strip in booking tab; list still from `forBooking` |

---

## 6. Duplicate risks

| Risk | Evidence | Severity |
|------|----------|----------|
| **Dual cleaning tasks per booking** | `booking:clean:{bookingId}` (TaskAutomation) vs `vehicle:cleaning:{vehicleId}` (VehicleCleaningTaskService) — same `TaskType` `VEHICLE_CLEANING`, different dedup keys | High — two open cleaning tasks possible for one rental prep |
| **Dual invoice tasks** | `booking:invoice:{bookingId}` vs `invoice:unpaid:{invoiceId}` — both `INVOICE_REQUIRED` | High — booking completion + invoice issue can both materialize |
| **Document overlap** | `booking:document:{bookingId}` vs `document:{kind}:{bookingId}` from bundle sync | Medium — overlapping DOCUMENT_REVIEW for same booking |
| **Compliance dual path** | Scheduled insight bridge + manual `materializeComplianceTask` share dedup keys like `service_overdue:{vehicleId}` | Low (by design — same dedup should escalate) — but manual path can race with cron bridge |
| **WhatsApp / observation tasks** | No `dedupKey` — repeated actions create duplicate tasks | Medium |
| **Vehicle complaint** | No dedup; raw Prisma create | Medium |
| **Workflow tasks** | Idempotent per workflow run key — safe within run | Low |
| **Insight candidates not bridged** | e.g. `pickup_overdue:{bookingId}`, `return_inspection:{bookingId}` produce insights/notifications but no auto-task | Informational — potential future duplicate if bridge expands |

---

## 7. Unclear or contradictory data flows

| Topic | Observation |
|-------|-------------|
| **Architektur claims vs cancel** | Architektur states booking lifecycle automation; `cancel` does not invoke it — open prep/pickup tasks may remain |
| **Invoice task close paths** | `recordPayment` closes tasks; Stripe/payment-reconciliation path to PAID does not (test 51) |
| **TaskEvent completeness** | Auto-close paths (`closeLinkedTasks`, `closeStale*`) bypass timeline — UI timeline incomplete for system closes |
| **`createVehicleComplaint`** | Bypasses `TasksService` — no `TaskEvent`, no `type`/`sourceType`/`dedupKey` alignment with task architecture |
| **`ensureRepairTask`** | Implemented and exported but zero call sites — dead automation hook |
| **Service case vs task** | `ServiceCase` groups tasks optionally; UI still task-primary; `api.serviceCases` unused in service center |
| **Booking detail `tasks.overdue`** | Embedded DTO uses `t.overdue` on raw Prisma rows — field is computed in `TasksService.format`, not on DB row (verify mapping in `bookings.service.ts` taskItems builder) |
| **Operator task snapshot** | `OperatorDataContext` filters terminal tasks client-side — counts/summary may disagree with full `TasksView` |
| **Resolution note enforcement** | Backend enforces for specific types; `ServiceOverviewPanel` calls `complete` without note — backend may reject for e.g. `BRAKE_CHECK` |
| **Document task lifecycle** | Tasks created when docs missing; no documented auto-close when bundle becomes complete |

---

## 8. Prioritization (P0 / P1 / P2)

### P0 — Correctness / architecture integrity

1. **`vehicles.service.createVehicleComplaint`** — direct `prisma.orgTask.create` bypasses `TasksService`, dedup, and `TaskEvent` (`vehicles.service.ts:2117–2127`).
2. **`invoices.service.closeLinkedTasks`** — direct status `DONE` without `TaskEvent` (`invoices.service.ts:813–822`).
3. **`closeStaleInsightTasks` / `closeStaleBookingLifecycleTasks`** — system closes without `TaskEvent` (`tasks.service.ts:936–985`).
4. **Booking cancel leaves lifecycle tasks open** — `bookings.service.cancel` has no task hook (`bookings.service.ts:1740–1771`).
5. **Payment reconciliation does not close invoice tasks** — `payment-reconciliation.service.ts` has no task integration; test 51 documents PAID + open task state.

### P1 — Duplicate / consistency risks

1. **Overlapping dedup namespaces** — `booking:clean` vs `vehicle:cleaning`; `booking:invoice` vs `invoice:unpaid`; `booking:document` vs `document:*`.
2. **`ensureRepairTask` dead code** — no callers; vendor repair flow may be incomplete.
3. **No document-task auto-close** when bundle completes.
4. **Operator UI missing cancel** — terminal resolution only via complete (or rental UI).
5. **`ServiceOverviewPanel` complete without resolution gate** — inconsistent with drawer enforcement.
6. **Parallel create APIs** — compliance materialize, observation convert, WhatsApp — no unified dedup story.

### P2 — UX / tech debt

1. **UI-derived `Overdue` / `Completed` buckets** — `task-list.utils.ts` mapping diverges from API enums.
2. **`estimatedDuration` / `notes` not persisted** in `TasksView` create wizard.
3. **Dead UI shells** — `NewTaskModal`, `TasksSectionView`.
4. **`api.serviceCases` unused** — service center task-only despite case model existing.
5. **No task E2E suite** — unlike invoices (V4.9.469).
6. **Client-side-only filtering** in `TasksView` — scale/consistency concern for large orgs.

---

## 9. Files likely changed in later phases

### Backend — core

- `backend/src/modules/tasks/tasks.service.ts` — unify close paths through `changeStatus` / `recordEvent`
- `backend/src/modules/tasks/task-automation.service.ts` — cancel/no-show hooks; document stale-close; dedup alignment
- `backend/src/modules/tasks/vehicle-cleaning-task.service.ts` — dedup key alignment with booking clean
- `backend/src/modules/tasks/tasks.controller.ts` — if new filters or bulk operations needed
- `backend/src/modules/tasks/dto/task.dto.ts`

### Backend — integrators

- `backend/src/modules/bookings/bookings.service.ts` — cancel/no-show task lifecycle
- `backend/src/modules/invoices/invoices.service.ts` — `closeLinkedTasks` → `TasksService`
- `backend/src/modules/payments/payment-reconciliation.service.ts` — invoice task close on full payment
- `backend/src/modules/documents/booking-document-bundle.service.ts` — document task stale-close
- `backend/src/modules/vehicles/vehicles.service.ts` — complaint → `TasksService`
- `backend/src/modules/business-insights/insight-task-bridge.service.ts` — expanded types / close rules
- `backend/src/modules/vehicle-intelligence/service-compliance/compliance-task-materialize.service.ts`
- `backend/src/modules/workflows/workflow-action-executor.service.ts`
- `backend/src/modules/fines/fines.service.ts` — fine paid → task close? (not implemented today)
- `backend/prisma/schema.prisma` — only if new indexes, enums, or FK requirements emerge

### Frontend — rental

- `frontend/src/rental/components/TasksView.tsx`
- `frontend/src/rental/components/tasks/GlobalTaskDetailPanel.tsx`
- `frontend/src/rental/components/tasks/VehicleTaskDetailDrawer.tsx`
- `frontend/src/rental/lib/task-list.utils.ts`
- `frontend/src/rental/lib/task-display.utils.ts`
- `frontend/src/rental/lib/task-operator.utils.ts`
- `frontend/src/rental/components/service-center/ServiceOverviewPanel.tsx`
- `frontend/src/rental/components/ComplianceTaskActions.tsx`
- `frontend/src/lib/api.ts`

### Frontend — operator

- `frontend/src/operator/tasks/operatorTask.utils.ts`
- `frontend/src/operator/tasks/operatorTodayTasks.ts`
- `frontend/src/operator/views/OperatorTasksView.tsx`
- `frontend/src/operator/views/OperatorTodayView.tsx`
- `frontend/src/operator/context/OperatorDataContext.tsx`
- `frontend/src/operator/tasks/useOperatorTaskActions.ts`

### Tests / docs

- `backend/src/modules/tasks/tasks.service.spec.ts`
- `backend/src/modules/invoices/invoices.pipeline.integration.spec.ts`
- New: `frontend/e2e/tasks-*.spec.ts` (recommended)
- `frontend/src/master/components/ArchitekturView.tsx` + `ChangesView.tsx` (per project rules, after implementation)

---

## Appendix A — REST API surface (`TasksController`)

| Method | Route | Service method |
|--------|-------|----------------|
| GET | `organizations/:orgId/tasks` | `listTasks` |
| GET | `organizations/:orgId/tasks/summary` | `getDashboardSummary` |
| GET | `organizations/:orgId/tasks/:id` | `getTaskById` |
| POST | `organizations/:orgId/tasks` | `createManualTask` |
| PATCH | `organizations/:orgId/tasks/:id` | `updateTask` |
| PATCH | `.../assign` | `assignTask` |
| PATCH | `.../start` | `startTask` |
| PATCH | `.../waiting` | `moveTaskToWaiting` |
| PATCH | `.../complete` | `completeTask` |
| PATCH | `.../cancel` | `cancelTask` |
| POST | `.../comments` | `addComment` |
| POST/PATCH | `.../checklist` | checklist CRUD |
| POST | `.../attachments` | `addAttachment` |
| GET | `.../vehicles/:vehicleId/tasks` | `getTasksForVehicle` |
| GET | `.../bookings/:bookingId/tasks` | `getTasksForBooking` |
| GET | `.../vendors/:vendorId/tasks` | `getTasksForVendor` |
| GET | `.../customers/:customerId/tasks` | `getTasksForCustomer` |

---

## Appendix B — Open questions (require product/ops confirmation)

1. Should **booking cancel** auto-`CANCEL` or auto-`DONE` lifecycle tasks, or leave them for manual cleanup?
2. Should **payment reconciliation** (Stripe webhook path) close `invoice:unpaid:*` tasks the same way as `recordPayment`?
3. Should **`booking:clean`** and **`vehicle:cleaning`** converge to a single dedup key per vehicle/booking?
4. Should **`booking:invoice`** be suppressed when `invoice:unpaid:{id}` exists?
5. Should **document tasks** auto-close when `BookingDocumentBundle` reaches `COMPLETE`?
6. Is **`ensureRepairTask`** intentionally unused — should vendor/damage flows call it?
7. Should **vehicle complaints** use `TasksService` with a dedup key per complaint?
8. Should **operator** expose cancel for mis-created tasks?
9. Is **`hm_no_tracking:{vehicleId}`** intentionally insight-only (no task), or an oversight?
10. Should **fine payment/settlement** close `fine:{fineId}` tasks (no close path found today)?

---

## Summary

- **Canonical backend:** `TasksService` + `TasksController` under `organizations/:orgId/tasks`; system producers use `upsertByDedup` except **vehicle complaints** (raw Prisma).
- **15+ automated producers** across bookings, documents, insights, compliance, invoices, fines, cleaning, workflows, WhatsApp, observations.
- **3 auto-close mechanisms** bypass `TaskEvent` (invoice paid, stale insight, stale booking phase); cleaning uses proper `completeTask`.
- **Frontend:** Rental `TasksView` + vehicle/service/operator surfaces; primary API `api.tasks.*`; parallel paths for compliance materialize and observation convert.
- **Highest duplicate risk:** overlapping dedup keys for cleaning and invoice flows.
- **Highest integrity gaps:** complaint create bypass, cancel without task cleanup, reconciliation without task close.

**Changes / Architektur:** Not updated (audit-only task per instructions).
