# Task-Management — Read-only-Inventur (Ist-Stand)

| Feld | Wert |
|------|------|
| Status | **Audit** (keine Implementierung) |
| Datum | 2026-07-15 |
| Repository | SynqDrive (`/workspace`) |
| Basis-Dokumentation | `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/architecture/task-domain-v2.md` |
| Kanonische Engine | `OrgTask` + `TasksService` (eine Schicht, keine zweite Engine) |

---

## 0. Methodik und Suchbefehle

Alle Aussagen in diesem Dokument stammen aus **gelesenem Quellcode** und **ausgeführten Repository-Suchen** (Stand 2026-07-15). Nicht verifizierte Vermutungen sind als **Offene Frage** markiert.

### Ausgeführte Suchbefehle (Auszug)

```bash
# Direkte Prisma-Zugriffe auf OrgTask
rg 'prisma\.orgTask\.(create|update|upsert|findMany|findFirst|delete)' backend --glob '*.ts'

# TasksService-API und Auto-Close
rg 'upsertByDedup|closeStale|completeTask|cancelTask|changeStatus|assignTask|startTask|moveTaskToWaiting' backend --glob '*.ts'

# dedupKey / generatedKey
rg 'dedupKey|dedupeKey|generatedKey' backend frontend --glob '*.{ts,tsx}' | head -200

# Frontend Task-API
rg 'api\.tasks\.' frontend --glob '*.{ts,tsx}'

# Direkte Status-Updates
rg "status:\s*['\"]DONE['\"]|status:\s*['\"]CANCELLED['\"]" backend/src --glob '*.ts'

# Task-Erzeuger (Service-Aufrufe)
rg 'ensureBookingLifecycleTasks|createManualTask|upsertByDedup|createUnpaidTask|materialize' backend/src --glob '*.ts'
```

### Gelesene Kernpfade

- `backend/prisma/schema.prisma` — `OrgTask`, `TaskEvent`, `TaskChecklistItem`, `ServiceCase`, Enums
- `backend/src/modules/tasks/**` — Controller, Service, DTOs, Automation, Templates, Cleaning
- `backend/src/modules/business-insights/insight-task-bridge.service.ts`
- `backend/src/modules/invoices/invoices.service.ts`
- `backend/src/modules/bookings/bookings.service.ts`
- `backend/src/modules/documents/booking-document-bundle.service.ts`
- `backend/src/modules/workflows/workflow-action-executor.service.ts`
- `frontend/src/lib/api.ts` — `api.tasks`
- `frontend/src/rental/components/TasksView.tsx`, `frontend/src/operator/**`

---

## 1. Datei- und Callsite-Matrix

### 1.1 Datenmodell (Prisma)

| Datei | Rolle |
|-------|-------|
| `backend/prisma/schema.prisma` | `OrgTask`, `TaskStatus`, `TaskType`, `TaskSource`, `TaskPriority`; Kindtabellen; `@@unique([organizationId, dedupKey])`; `ServiceCase` + `serviceCaseId` auf `OrgTask` |
| `backend/prisma/migrations/20260608000000_service_compliance_auto_tasks` | `source`, `dedupKey` |
| `backend/prisma/migrations/20260614000100_task_action_layer` | Enums, Link-Spalten, Kindtabellen, Indizes |

### 1.2 Backend — kanonische Task-Schicht

| Datei | Operationen |
|-------|-------------|
| `backend/src/modules/tasks/tasks.controller.ts` | REST: list, summary, get, create, update, assign, start, waiting, complete, cancel, comments, checklist, attachments; Convenience: vehicle/booking/vendor/customer tasks |
| `backend/src/modules/tasks/tasks.service.ts` | **Zentrale Schreib-/Leselogik**: `createManualTask`, `upsertByDedup`, `updateTask`, `changeStatus`, `assignTask`, `startTask`, `moveTaskToWaiting`, `completeTask`, `cancelTask`, `closeStaleInsightTasks`, `closeStaleBookingLifecycleTasks`, `listTasks`, `getDashboardSummary`, `recordEvent` |
| `backend/src/modules/tasks/dto/task.dto.ts` | Validierung aller Controller-Bodies/Queries |
| `backend/src/modules/tasks/task-automation.service.ts` | Booking-Lifecycle, Document-Tasks, `ensureRepairTask` (definiert, siehe §2) |
| `backend/src/modules/tasks/task-templates.ts` | Checklist-Templates pro `TaskType` |
| `backend/src/modules/tasks/task-priority.util.ts` | Legacy-Priority-Normalisierung (`MEDIUM`/`URGENT`) |
| `backend/src/modules/tasks/vehicle-cleaning-task.service.ts` | Cleaning-Task materialisieren/abschließen |
| `backend/src/modules/tasks/tasks.module.ts` | Exportiert `TasksService`, `TaskAutomationService`, `VehicleCleaningTaskService` |

### 1.3 Backend — Task-Erzeuger / Mutatoren (außerhalb `tasks/`)

| Datei | Callsite | Methode |
|-------|----------|---------|
| `insight-task-bridge.service.ts` | `materialize()` | `tasks.upsertByDedup`, `tasks.closeStaleInsightTasks` |
| `compliance-task-materialize.service.ts` | `upsertFromSignal()` | `tasks.upsertByDedup` |
| `task-automation.service.ts` | `ensureBookingLifecycleTasks`, `ensureDocumentTask`, `ensureRepairTask` | `tasks.upsertByDedup` |
| `booking-document-bundle.service.ts` | `syncMissingDocumentTasks()` | `taskAutomation.ensureDocumentTask` |
| `bookings.service.ts` | `create()`, `update()` (Statuswechsel) | `taskAutomation.ensureBookingLifecycleTasks` |
| `invoices.service.ts` | `create()`, `issue()`, `recordPayment()` | `tasks.upsertByDedup` (`createUnpaidTask`), `prisma.orgTask.update` (`closeLinkedTasks`) |
| `fines.service.ts` | `create()` | `tasksService.upsertByDedup` |
| `workflow-action-executor.service.ts` | `execTaskCreate`, `execAlertCreate`, `execNotificationPrepare`, `execAiSuggest` | `tasksService.upsertByDedup` |
| `vehicle-cleaning-task.service.ts` | `ensureCleaningTask`, `completeOpenCleaningTasks` | `tasks.upsertByDedup`, `tasks.completeTask`, **`prisma.orgTask.update`** (dedupKey backfill) |
| `vehicles.controller.ts` | `PATCH .../vehicles/:id/status` (`cleaningStatus`) | `vehicleCleaningTasks.ensureCleaningTask` / `completeOpenCleaningTasks` |
| `vehicles.service.ts` | `createComplaint()` | **`prisma.orgTask.create`** (Bypass) |
| `technical-observations.service.ts` | `convertToTask()` | `tasks.createManualTask` |
| `whatsapp-quick-actions.service.ts` | Quick action | `tasks.createManualTask` |
| `whatsapp-ai-tools.service.ts` | AI tool | `tasks.create()` → `createManualTask` |
| `business-insights.service.ts` | `runForOrganization()` | `bridge.materialize()` (indirekt) |
| `notification-evaluation.service.ts` | BullMQ-Job | `insightsService.runForOrganization()` (indirekt) |

### 1.4 Backend — Lesen / Zählen (keine Mutation)

| Datei | Verwendung |
|-------|------------|
| `bookings.service.ts` | `findDetail`: `prisma.orgTask.findMany` für Buchungsdetail |
| `customer-eligibility.service.ts` | `prisma.orgTask.count` (kritische offene Tasks) |
| `stations.service.ts` | `prisma.orgTask.count` (Station-KPI `openTasks`) |
| `damages.service.ts` | `prisma.orgTask.findFirst` (Validierung `taskId`-Link) |
| `technical-observations.service.ts` | `prisma.orgTask.findFirst` (Link-Validierung) |
| `service-cases.service.ts` | `assertCaseAccessible` (von `TasksService` bei `serviceCaseId`) |

### 1.5 Backend — Ops-Skripte (nicht produktiv)

| Datei | Operation |
|-------|-----------|
| `backend/scripts/ops/cleanup-invalid-invoices.ts` | `prisma.orgTask.updateMany` |
| `backend/scripts/ops/cleanup-fs-mobility-demo-data.ts` | `findFirst`, `deleteMany`, `findMany` |
| `backend/scripts/ops/audit-fs-mobility-invoices.ts` | `findMany` |

### 1.6 Frontend — API und UI

| Pfad | Rolle |
|------|-------|
| `frontend/src/lib/api.ts` | `api.tasks.*` — einziger typisierter REST-Client |
| `frontend/src/rental/components/TasksView.tsx` | Globale Task-Management-Page (Rental) |
| `frontend/src/rental/components/NewTaskModal.tsx` | Manueller Task |
| `frontend/src/rental/components/VehicleTasksView.tsx` | Fahrzeug-Taskliste |
| `frontend/src/rental/components/tasks/*` | Detail-Drawer, Cards, Create-Dialog |
| `frontend/src/rental/components/service-center/*` | Service Center (Task-basiert) |
| `frontend/src/rental/components/EntityTasksSection.tsx` | Wiederverwendbare Task-Sektion |
| `frontend/src/rental/components/booking-detail/BookingTasksTimelineTab.tsx` | Buchungs-Tasks |
| `frontend/src/rental/hooks/useVehicleDamageActions.ts` | Repair-Task aus Schaden |
| `frontend/src/operator/views/OperatorTodayView.tsx` | Heute — Tasks + Gruppierung |
| `frontend/src/operator/views/OperatorTasksView.tsx` | Operator-Aufgaben-Tab |
| `frontend/src/operator/tasks/*` | Cards, Detail, Actions, Utils |
| `frontend/src/operator/context/OperatorDataContext.tsx` | Task-Liste + Summary für Operator |
| `frontend/src/rental/lib/task-list.utils.ts` | Status/Priority-Mapping (UI-eigen) |
| `frontend/src/rental/lib/task-detail.utils.ts` | `RESOLUTION_REQUIRED_TASK_TYPES` (Spiegel Backend) |
| `frontend/src/rental/lib/damage-repair-task.ts` | Repair-Payload-Builder |
| `frontend/src/master/components/support-ops/SupportOpsWorkspace.tsx` | Follow-up-Task aus Support |

### 1.7 Tests (Auswahl)

| Datei | Abdeckung |
|-------|-----------|
| `backend/src/modules/tasks/tasks.service.spec.ts` | State machine, dedup, assign, complete |
| `backend/src/modules/tasks/vehicle-cleaning-task.service.spec.ts` | Cleaning materialize/complete |
| `backend/src/modules/tasks/task-priority.util.spec.ts` | Priority mapping |
| `backend/src/modules/vehicle-intelligence/service-compliance/compliance-task-materialize.service.spec.ts` | Dedup bei Materialize |
| `frontend/src/operator/tasks/operatorTodayTasks.test.ts` | Booking-Gruppierung |
| `frontend/src/rental/lib/task-list.utils.test.ts` | UI-Mapping |
| `frontend/src/rental/lib/task-operator.utils.test.ts` | Operator-Hilfen |

**Kein dediziertes Backend-E2E** für Tasks gefunden (`backend/test/` enthält `document-extraction.e2e-spec.ts`, `pricing-deposit-e2e-flow.spec.ts` — keine Task-E2E).

---

## 2. Alle Task-Erzeuger

### 2.1 Übersichtstabelle

| # | Trigger | Service / Datei | TaskType | source | sourceType | dedupKey-Muster | Verknüpfungen |
|---|---------|-----------------|----------|--------|------------|-----------------|---------------|
| 1 | `POST /tasks` (manuell) | `TasksController` → `createManualTask` | DTO `type` | `sourceKey` oder null | DTO / `MANUAL` | **keiner** | optional alle Link-Spalten + `metadata.stationId` |
| 2 | Buchung `create` / Statuswechsel | `TaskAutomationService.ensureBookingLifecycleTasks` | siehe unten | `BOOKING` | `BOOKING` | `booking:{step}:{bookingId}` | `vehicleId`, `bookingId`, `customerId` |
| 3 | Bundle-Regenerierung / Sync | `BookingDocumentBundleService.syncMissingDocumentTasks` | `DOCUMENT_REVIEW` / `INVOICE_REQUIRED` | `DOCUMENT` | `DOCUMENT` | `document:{kind}:{ref}` | `bookingId`, `vehicleId`, optional `documentId` |
| 4 | Insight-Run (Cron/Event) | `InsightTaskBridgeService.materialize` | pro Insight-Typ | `INSIGHT_*` | `ALERT` | Insight-`dedupeKey` | `vehicleId`, `alertId` (wenn Insight existiert) |
| 5 | Manueller Compliance-Materialize | `ComplianceTaskMaterializeService` | aus Signal | `INSIGHT_SERVICE` / `INSIGHT_COMPLIANCE` | `ALERT` | Signal-`dedupeKey` | `vehicleId` |
| 6 | Rechnung unbezahlt | `InvoicesService.createUnpaidTask` | `INVOICE_REQUIRED` | `INVOICE` | `SYSTEM` | `invoice:unpaid:{invoiceId}` | `invoiceId` |
| 7 | Bußgeld angelegt | `FinesService.create` | `CUSTOMER_FOLLOWUP` | `FINE` | `SYSTEM` | `fine:{fineId}` | `fineId`, `vehicleId`, `customerId` |
| 8 | Workflow `task.create` | `WorkflowActionExecutorService` | `CUSTOM` | `WORKFLOW_AUTOMATION` | `SYSTEM` | `{idempotencyKey}:action:{n}:task` | optional `vehicleId`, `bookingId` |
| 9 | Workflow `alert.create` | `WorkflowActionExecutorService` | `CUSTOM` | `WORKFLOW_ALERT` | `SYSTEM` | `{idempotencyKey}:action:{n}:alert` | optional Links (**benennt sich Alert, erzeugt OrgTask**) |
| 10 | Workflow `notification.prepare` | `WorkflowActionExecutorService` | `CUSTOM` | `WORKFLOW_NOTIFICATION_PREPARE` | `SYSTEM` | `{idempotencyKey}:action:{n}:notification` | optional Links |
| 11 | Workflow `ai.suggest_action` | `WorkflowActionExecutorService` | `CUSTOM` | `WORKFLOW_AI_SUGGEST` | `SYSTEM` | `{idempotencyKey}:action:{n}:ai_suggest` | optional Links |
| 12 | `cleaningStatus=NEEDS_CLEANING` | `VehicleCleaningTaskService` | `VEHICLE_CLEANING` | `VEHICLE_CLEANING` | `SYSTEM` | `vehicle:cleaning:{vehicleId}` | `vehicleId`, `blocksVehicleAvailability: true` |
| 13 | Technische Beobachtung → Task | `TechnicalObservationsService.convertToTask` | `CUSTOM` | `TECHNICAL_OBSERVATION` | `HEALTH` | **keiner** | `vehicleId`, optional `bookingId`, `customerId` |
| 14 | Fahrzeug-Beschwerde (Legacy) | `VehiclesService.createComplaint` | default `CUSTOM` | **nicht gesetzt** | default `MANUAL` | **keiner** | `vehicleId` nur |
| 15 | WhatsApp Quick Action | `WhatsappQuickActionsService` | variabel | `WHATSAPP` | `SYSTEM` | **keiner** | kontextabhängig |
| 16 | WhatsApp AI Tool | `WhatsappAiToolsService` | variabel | `WHATSAPP_AI_ROUTER` | `SYSTEM` | **keiner** | kontextabhängig |
| 17 | Schaden → Repair Task (UI) | Frontend `api.tasks.create` | `REPAIR` | `MANUAL` (Payload) | `MANUAL` | **keiner** | `vehicleId`, `vendorId`, `metadata.damageId` |
| 18 | `ensureRepairTask` | `TaskAutomationService` | `REPAIR` | `VENDOR` | `VENDOR` | `vendor:repair:{vehicleId}:{vendorId\|none}:{reason}` | `vehicleId`, `vendorId` — **kein Caller in `backend/src` gefunden** |

### 2.2 Booking-Lifecycle-Detail (`ensureBookingLifecycleTasks`)

| Buchungsstatus | dedupKey | TaskType | Checkliste (Template) |
|----------------|----------|----------|----------------------|
| `CONFIRMED` | `booking:prep:{id}` | `BOOKING_PREPARATION` | ja |
| `CONFIRMED` | `booking:clean:{id}` | `VEHICLE_CLEANING` | ja |
| `CONFIRMED` | `booking:document:{id}` | `DOCUMENT_REVIEW` | nein |
| `ACTIVE` | `booking:pickup:{id}` | `BOOKING_PICKUP` | ja |
| `COMPLETED` | `booking:return:{id}` | `BOOKING_RETURN` | ja |
| `COMPLETED` | `booking:invoice:{id}` | `INVOICE_REQUIRED` | nein |

Nach jedem Lauf: `closeStaleBookingLifecycleTasks` schließt Tasks mit `source=BOOKING`, deren `dedupKey` nicht mehr in der aktiven Liste ist.

### 2.3 Insight-Bridge-Detail (`InsightTaskBridgeService`)

Materialisiert nur Kandidaten mit:

- `InsightType` ∈ `TASK_TYPE_CONFIG` (6 Typen: `SERVICE_OVERDUE`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `TIRE_CRITICAL`, `BRAKE_CRITICAL`, `BATTERY_CRITICAL`)
- `entityScope === VEHICLE`, genau eine `entityId`
- `dedupeKey` aus Detector/Compliance-Signals

| InsightType | TaskType | source | dedupKey (typisch) |
|-------------|----------|--------|-------------------|
| `SERVICE_OVERDUE` | `VEHICLE_SERVICE` | `INSIGHT_SERVICE` | `service_overdue:{vehicleId}` |
| `TUV_OVERDUE` | `VEHICLE_INSPECTION` | `INSIGHT_COMPLIANCE` | `tuv_overdue:{vehicleId}` |
| `BOKRAFT_OVERDUE` | `VEHICLE_INSPECTION` | `INSIGHT_COMPLIANCE` | `bokraft_overdue:{vehicleId}` |
| `TIRE_CRITICAL` | `TIRE_CHECK` | `INSIGHT_HEALTH` | `tire_critical:{vehicleId}` |
| `BRAKE_CRITICAL` | `BRAKE_CHECK` | `INSIGHT_HEALTH` | `brake_critical:{vehicleId}` |
| `BATTERY_CRITICAL` | `BATTERY_CHECK` | `INSIGHT_HEALTH` | `battery_critical:{vehicleId}` |

`closeStaleInsightTasks` whitelist: `source IN ('INSIGHT_SERVICE','INSIGHT_COMPLIANCE','INSIGHT_HEALTH')`.

### 2.4 Vollständige dedupKey-Konventionen (gefunden)

| Muster | Produzent |
|--------|-----------|
| `booking:prep:{bookingId}` | TaskAutomation |
| `booking:clean:{bookingId}` | TaskAutomation |
| `booking:document:{bookingId}` | TaskAutomation |
| `booking:pickup:{bookingId}` | TaskAutomation |
| `booking:return:{bookingId}` | TaskAutomation |
| `booking:invoice:{bookingId}` | TaskAutomation |
| `document:{kind}:{documentId\|bookingId\|vehicleId}` | TaskAutomation / Bundle |
| `invoice:unpaid:{invoiceId}` | InvoicesService |
| `fine:{fineId}` | FinesService |
| `vehicle:cleaning:{vehicleId}` | VehicleCleaningTaskService |
| `service_overdue:{vehicleId}` | Insight-Bridge, Compliance-Materialize |
| `tuv_overdue:{vehicleId}` | Insight-Bridge, Compliance-Materialize |
| `bokraft_overdue:{vehicleId}` | Insight-Bridge, Compliance-Materialize |
| `tire_critical:{vehicleId}` | Insight-Bridge |
| `brake_critical:{vehicleId}` | Insight-Bridge |
| `battery_critical:{vehicleId}` | Insight-Bridge |
| `hm_no_tracking:{vehicleId}` | Compliance-Signals (**Insight/Notification**, Bridge materialisiert laut Config **nicht** automatisch) |
| `vendor:repair:{vehicleId}:{vendorId}:{reason}` | `ensureRepairTask` (ungenutzt) |
| `{idempotencyKey}:action:{index}:task\|alert\|notification\|ai_suggest` | Workflow |
| `{dedupKey}:closed:{taskId}` | `upsertByDedup` beim Parken terminierter Keys |

Weitere **Insight-dedupeKeys ohne Task-Bridge** (nur Dashboard/Notification): `tight_handover:…`, `station_shortage:…`, `pickup_overdue:…`, `return_inspection:…`, `low_utilization:…`, `service_window:…`, `service_before_booking:…`, `driving_assessment_device_quality:…`.

### 2.5 source- und sourceType-Werte (OrgTask, produktiv gesetzt)

**`source` (freier String, Auszug):**  
`BOOKING`, `DOCUMENT`, `INVOICE`, `FINE`, `INSIGHT_SERVICE`, `INSIGHT_COMPLIANCE`, `INSIGHT_HEALTH`, `VEHICLE_CLEANING`, `TECHNICAL_OBSERVATION`, `WHATSAPP`, `WHATSAPP_AI_ROUTER`, `WORKFLOW_AUTOMATION`, `WORKFLOW_ALERT`, `WORKFLOW_NOTIFICATION_PREPARE`, `WORKFLOW_AI_SUGGEST`, `VENDOR` (nur `ensureRepairTask`), `HEALTH_UI` / diverse manuelle Keys, `null` bei manuellen Tasks ohne `sourceKey`.

**`sourceType` (Enum):** `MANUAL`, `SYSTEM`, `ALERT`, `HEALTH`, `BOOKING`, `DOCUMENT`, `VENDOR`.

---

## 3. Alle Statusänderungspfade

### 3.1 Über `TasksService.changeStatus` (mit `TaskEvent` `STATUS_CHANGED`)

| Einstieg | Methode | Zielstatus |
|----------|---------|------------|
| `PATCH .../start` | `startTask` | `IN_PROGRESS` |
| `PATCH .../waiting` | `moveTaskToWaiting` | `WAITING` |
| `PATCH .../complete` | `completeTask` | `DONE` |
| `PATCH .../cancel` | `cancelTask` | `CANCELLED` |
| Legacy `tasks.update(id, { status })` | `update` → `changeStatus` | beliebig erlaubt | 

**Übergangsmatrix** (`tasks.service.ts` `STATUS_TRANSITIONS`):

- `OPEN` → `IN_PROGRESS`, `WAITING`, `DONE`, `CANCELLED`
- `IN_PROGRESS` → `WAITING`, `DONE`, `CANCELLED`
- `WAITING` → `IN_PROGRESS`, `DONE`, `CANCELLED`
- `DONE`, `CANCELLED` → **terminal** (kein Übergang)

**Idempotenz:** `from === to` → No-op, kein Event.

**Nebenwirkungen:** `startedAt` bei erstem `IN_PROGRESS`; `completedAt` bei `DONE`; `cancelledAt` bei `CANCELLED`; `resolutionNote` Pflicht für `RESOLUTION_REQUIRED_TYPES`.

### 3.2 Über `TasksService.updateTask` (Event `UPDATED`, kein Status)

`PATCH .../tasks/:id` — Felder: title, description, category, priority, dueDate, assignedUserId, costs, blocksVehicleAvailability. **Kein Status-Feld im DTO.**

### 3.3 Über `TasksService.assignTask` (Event `ASSIGNED`)

`PATCH .../assign` — auch bei gleicher Zuweisung wird **immer** ein Event geschrieben (Ist).

### 3.4 Direkte `prisma.orgTask.update` — **Bypass der State Machine**

| Datei | Funktion | Setzt | TaskEvent? |
|-------|----------|-------|------------|
| `tasks.service.ts` | `closeStaleInsightTasks` | `status=DONE`, `completedAt` | **Nein** |
| `tasks.service.ts` | `closeStaleBookingLifecycleTasks` | `status=DONE`, `completedAt` | **Nein** |
| `invoices.service.ts` | `closeLinkedTasks` | `status=DONE`, `completedAt` | **Nein** |
| `vehicle-cleaning-task.service.ts` | dedupKey-Backfill | nur `dedupKey` | Nein |

### 3.5 Über `TasksService.completeTask` (indirekt changeStatus)

| Datei | Trigger |
|-------|---------|
| `vehicle-cleaning-task.service.ts` | `cleaningStatus=CLEAN` |

### 3.6 Kein Status-Update

- `updateChecklistItem` — ändert `isDone`, **kein** `TaskEvent` (Ist)
- `upsertByDedup` (Eskalation) — aktualisiert Metadaten, **nicht** Status

---

## 4. Alle Auto-Close-Pfade

| Pfad | Auslöser | Scope | Mechanismus | TaskEvent |
|------|----------|-------|-------------|-----------|
| Insight stale close | `BusinessInsightsService.runForOrganization` → Bridge | Org-weit, `source IN INSIGHT_*` | `closeStaleInsightTasks` — `dedupKey NOT IN activeKeys` | **Nein** |
| Booking phase advance | `ensureBookingLifecycleTasks` nach Statuswechsel | Ein Booking, `source=BOOKING` | `closeStaleBookingLifecycleTasks` | **Nein** |
| Rechnung bezahlt | `InvoicesService.recordPayment` / `markPaid` wenn `outstanding=0` | `invoiceId` | `closeLinkedTasks` — alle nicht-`DONE` | **Nein** |
| Fahrzeug sauber | `vehicles.controller` `cleaningStatus=CLEAN` | `VEHICLE_CLEANING` aktiv | `completeTask` (korrekt) | **Ja** (`STATUS_CHANGED`) |

---

## 5. Alle UI-Flächen

### 5.1 Rental (globale / fahrzeugbezogene Tasks)

| UI | Datei | Datenquelle | Mutationen |
|----|-------|-------------|------------|
| Globale Task-Page | `TasksView.tsx` | `api.tasks.list`, `api.tasks.summary` | start, waiting, complete, cancel, assign, update, checklist, comments |
| Neuer Task | `NewTaskModal.tsx` | — | `api.tasks.create` |
| Fahrzeug-Tasks | `VehicleTasksView.tsx` | `api.tasks.forVehicle` | über Action Center / Drawer |
| Task-Detail | `GlobalTaskDetailPanel.tsx`, `VehicleTaskDetailDrawer.tsx` | `api.tasks.get` | wie TasksView |
| Service Center | `service-center/*` | `api.tasks.list`, `summary` | `ServiceTaskCreateModal` → create |
| Buchung | `BookingTasksTimelineTab.tsx` | `api.tasks.forBooking` | read-only Liste |
| Schaden Repair | `useVehicleDamageActions.ts` | — | `api.tasks.create` + Damage `taskId` PATCH |
| TopBar-Suche | `TopBar.tsx` | `api.tasks.list` (ganze Org) | read |
| Entity-Sections | `EntityTasksSection.tsx` | injizierter Fetcher | read |

### 5.2 Operator

| UI | Datei | Datenquelle | Besonderheiten |
|----|-------|-------------|----------------|
| Heute | `OperatorTodayView.tsx` | `OperatorDataContext.tasks` (gefiltert OPEN/IN_PROGRESS/WAITING) | Gruppierung `buildOperatorTodayTaskEntries`; Quick-complete |
| Aufgaben | `OperatorTasksView.tsx` | Snapshot **oder** `api.tasks.list(apiFilters)` | Filter: today, overdue, vehicle, booking, priority, scope |
| Task-Detail Sheet | `OperatorTaskDetail.tsx` | `api.tasks.get` | `useOperatorTaskActions` |
| Task anlegen | `OperatorTaskCreateForm.tsx` | — | `api.tasks.create` |
| Booking-Task-Gruppe | `OperatorBookingTaskGroupCard.tsx` | — | Navigation zu Aufgaben-Tab |

### 5.3 UI-eigene Ableitungen (nicht persistiert)

| Ableitung | Ort | Semantik |
|-----------|-----|----------|
| `isOverdue` | Backend `TasksService.format()` | `dueDate < now` ∧ aktiver Status — **kanonisch in API** |
| `mapTaskStatus` → `"Overdue"` | `task-list.utils.ts` | UI-Status separat von `OPEN`; gilt auch wenn Backend-Status `OPEN` bleibt |
| `sortOperatorTasks` | `operatorTask.utils.ts` | overdue → priority → dueDate (client) |
| `buildOperatorTodayTaskEntries` | `operatorTodayTasks.ts` | Booking-Lifecycle-Gruppierung (client) |
| `RESOLUTION_REQUIRED_TASK_TYPES` | `task-detail.utils.ts` | Spiegel Backend — **Drift-Risiko** |
| `stationId` | `CreateTaskDto` → `metadata` | **Nicht** als `OrgTask`-Spalte; serverseitiger Filter nach Station **nicht** vorhanden |
| Operator Task-Snapshot | `OperatorDataContext` | Client-Filter nur aktive Status; DONE ausgeblendet |

### 5.4 Pflichtfelder UI vs. Persistenz

| UI-Verhalten | Persistiert? |
|--------------|--------------|
| `resolutionNote` bei complete (REPAIR, BRAKE_CHECK, …) | Ja — Backend erzwingt |
| `resolutionCode` | **Nein** — nicht im Schema |
| `activatesAt` / Operator-Buckets (Geplant, Jetzt) | **Nein** — nicht im Schema |
| `stationId` im Create-Formular | Nur `metadata.stationId` |
| Checklist `isRequired` | **Nein** — alle Items gleichwertig in DB |

---

## 6. Alle festgestellten Duplikatrisiken

| ID | Risiko | Evidenz |
|----|--------|---------|
| D1 | **Doppelte Service-Compliance-Tasks** | Gleicher `dedupKey` `service_overdue:{vehicleId}` aus Insight-Bridge (Cron) und manuellem `POST .../compliance-task-signals/:key/materialize` — durch `upsertByDedup` abgefedert, aber **zwei Einstiegspfade** |
| D2 | **Buchung Rechnung vs. Bundle** | `booking:invoice:{id}` (Lifecycle) und `document:BOOKING_INVOICE:{bookingId}` (Bundle) können **parallele** INVOICE/DOCUMENT-Tasks erzeugen |
| D3 | **Beschwerde vs. Technical Observation** | `VehiclesService.createComplaint` erzeugt rohen `OrgTask` ohne Dedup; `TechnicalObservationsService` ist separater kanonischer Pfad |
| D4 | **Repair Task ohne Dedup** | UI `damage-repair-task.ts` und ggf. mehrfaches Klicken erzeugen **mehrere** REPAIR-Tasks (`canCreateRepairTaskForDamage` prüft nur `damage.taskId`) |
| D5 | **Workflow alert.create** | Name „Alert“, Datensatz ist `OrgTask` — kollidiert konzeptionell mit `DashboardInsight` |
| D6 | **Insight dedupeKey-Familien** | `tire_critical` (Bridge) vs. Frontend `semanticKey` / Notification `conditionCode` — Mapping nicht zentral erzwungen |
| D7 | **VEHICLE_CLEANING doppelt** | `booking:clean:{id}` (Buchung) und `vehicle:cleaning:{vehicleId}` (Cleaning-Status) für dasselbe Fahrzeug möglich |
| D8 | **Global unique dedupKey** | `@@unique([organizationId, dedupKey])` — parken via `:closed:{id}`; Race bei parallelen Creates **nicht** im Code geprüft (DB-Constraint als letzte Instanz) |

---

## 7. Unklare oder widersprüchliche Datenflüsse

| ID | Thema | Ist | Widerspruch |
|----|-------|-----|-------------|
| W1 | Auto-close ohne Audit | `closeStale*`, `closeLinkedTasks` | Umgehen `changeStatus`; kein `TaskEvent`; kein `completionType` |
| W2 | `alert.create` | Workflow erzeugt `OrgTask` | Fachlich Alert ≠ Task (`task-domain-v2.md`) |
| W3 | Complaint-Task | `prisma.orgTask.create` | Kein `TasksService`, kein `CREATED`-Event garantiert bei Fehler im try/catch |
| W4 | `assignTask` Idempotenz | Gleiche Zuweisung | Schreibt trotzdem `ASSIGNED`-Event |
| W5 | Checklist-Toggle | `updateChecklistItem` | Kein Timeline-Event; Abschlussblocker im Backend **nicht** erzwungen |
| W6 | ServiceCase ↔ Tasks | Case complete | Schließt verknüpfte Tasks **nicht** automatisch |
| W7 | Operator vs. Rental Listen | Operator filtert clientseitig auf aktiv | `TasksView` lädt **alle** Status (kein Default-Filter) |
| W8 | UI-Status „Overdue“ | `mapTaskStatus` | Ersetzt Anzeige-Status; kann von `api.status` abweichen |
| W9 | `ensureRepairTask` | Implementiert | **Kein produktiver Caller** in `backend/src` — unklar ob bewusst oder Lücke |
| W10 | Insight-Run-Kette | `NotificationEvaluationService` → `BusinessInsightsService` → Bridge | Fehler in Bridge isoliert; Task-Zustand kann von Insight-Zustand **temporär divergieren** |
| W11 | `alertId` | Spalte ohne FK | Orphan-`alertId` möglich wenn Insight expired |
| W12 | HM no-tracking | Signal `hm_no_tracking:{vehicleId}` | In Bridge-`TASK_TYPE_CONFIG` **nicht** enthalten — nur Notification/Insight, kein Auto-Task |

---

## 8. Priorisierung (P0 / P1 / P2)

### P0 — Datenintegrität / Audit / Bypass

| ID | Thema | Begründung |
|----|-------|------------|
| P0-1 | Auto-close ohne `TaskEvent` | W1 — Compliance- und Rechnungs-Abschlüsse nicht nachvollziehbar |
| P0-2 | `VehiclesService.createComplaint` Bypass | W3 — umgeht kanonische Schicht komplett |
| P0-3 | `invoices.closeLinkedTasks` Raw-Update | W1 — Zahlungsabschluss ohne State Machine |

### P1 — Duplikate / fachliche Klarheit

| ID | Thema | Begründung |
|----|-------|------------|
| P1-1 | Parallele Invoice-Tasks (D2) | Buchung kann zwei Rechnungs-Tasks haben |
| P1-2 | Cleaning doppelt (D7) | Buchungs-Clean vs. Fahrzeug-Clean |
| P1-3 | Workflow `alert.create` (W2) | Falsche Domänen-Zuordnung |
| P1-4 | Repair-Tasks ohne Dedup (D4) | Mehrfach-REPAIR pro Schaden möglich |
| P1-5 | Zwei Compliance-Materialize-Pfade (D1) | Bridge + manueller Endpoint |

### P2 — UX / Konsistenz / Tech Debt

| ID | Thema | Begründung |
|----|-------|------------|
| P2-1 | Checklist ohne Events/Blocker (W5) | Operator-Fortschritt nicht im Audit |
| P2-2 | UI `Overdue`-Status vs. API (W8) | Verwirrende Filter/Sorts |
| P2-3 | `stationId` nur in metadata (§5.4) | Kein serverseitiger Stationsfilter |
| P2-4 | `ensureRepairTask` ungenutzt (W9) | Toten Code oder fehlende Verdrahtung |
| P2-5 | Kein Task-E2E | Regressionsrisiko bei State Machine |
| P2-6 | Operator vs Rental Listen-Unterschied (W7) | Inkonsistente Default-Sicht |

---

## 9. Dateien für spätere Phasen (wahrscheinliche Änderungen)

### Backend (Kern)

- `backend/prisma/schema.prisma` — ggf. `activatesAt`, `completionType`, `resolutionCode`, `TaskChecklistItem.isRequired`
- `backend/src/modules/tasks/tasks.service.ts` — Auto-close über `changeStatus`, Events, Policies
- `backend/src/modules/tasks/tasks.controller.ts` / `dto/task.dto.ts` — neue Felder, Filter
- `backend/src/modules/tasks/task-automation.service.ts`
- `backend/src/modules/tasks/vehicle-cleaning-task.service.ts`
- `backend/src/modules/business-insights/insight-task-bridge.service.ts`
- `backend/src/modules/invoices/invoices.service.ts`
- `backend/src/modules/vehicles/vehicles.service.ts` (Complaint-Bypass)
- `backend/src/modules/workflows/workflow-action-executor.service.ts`
- `backend/src/modules/vehicle-intelligence/service-compliance/compliance-task-materialize.service.ts`
- `backend/src/modules/documents/booking-document-bundle.service.ts`

### Frontend

- `frontend/src/lib/api.ts` — `ApiTask`-Typen
- `frontend/src/rental/components/TasksView.tsx`
- `frontend/src/rental/lib/task-list.utils.ts`
- `frontend/src/rental/lib/task-detail.utils.ts`
- `frontend/src/operator/tasks/operatorTask.utils.ts`
- `frontend/src/operator/context/OperatorDataContext.tsx`
- `frontend/src/operator/views/OperatorTasksView.tsx`
- `frontend/src/operator/views/OperatorTodayView.tsx`
- `frontend/src/rental/hooks/useVehicleDamageActions.ts`

### Tests / Doku

- `backend/src/modules/tasks/tasks.service.spec.ts` (+ neue Specs Auto-close, Dedup-Matrix)
- `docs/architecture/task-domain-v2.md` — Abgleich Ist vs. Soll
- Neues Task-E2E (noch nicht vorhanden)

### Bewusst wahrscheinlich unverändert (nur Leser)

- `bookings.service.ts` (Trigger bleibt, Logik in Automation)
- `customer-eligibility.service.ts`, `stations.service.ts` (nur count)
- `damages.service.ts` (nur Link-Validierung)

---

## 10. Zusammenfassung der Call Sites

### Schreibzugriffe (produktiv)

| Kategorie | Anzahl Call-Sites (ungefähr) | Kanonisch über TasksService? |
|-----------|------------------------------|------------------------------|
| `upsertByDedup` | 8 Services | Ja |
| `createManualTask` / `create` | 4 Services + REST | Ja (außer Complaint-Bypass) |
| `completeTask` / `changeStatus` | REST + Cleaning | Ja |
| Direktes `prisma.orgTask.update` (Status) | 3 Methoden | **Nein** |
| Direktes `prisma.orgTask.create` | 1 (Complaints) | **Nein** |

### Lesen (REST + embedded)

- **REST:** 12+ Endpunkte unter `TasksController`
- **Embedded:** Booking-Detail, Eligibility, Stations-Stats
- **Frontend:** 15+ Komponenten konsumieren `api.tasks`

### Scheduler / Event-Kette (Tasks indirekt)

```
NotificationEvaluationService (BullMQ debounce/scheduled)
  → BusinessInsightsService.runForOrganization
    → InsightTaskBridgeService.materialize (upsert + closeStale)

BookingsService.create/update
  → TaskAutomationService.ensureBookingLifecycleTasks (+ closeStale)

BookingDocumentBundleService (nach Bundle-Update)
  → syncMissingDocumentTasks

InvoicesService.issue / recordPayment
  → createUnpaidTask / closeLinkedTasks

VehiclesController PATCH cleaningStatus
  → VehicleCleaningTaskService
```

---

## 11. Offene Fragen

1. **`ensureRepairTask`:** Soll Vendor-Reparatur künftig über diesen Pfad laufen, oder ist er veraltet? (Kein Caller in `backend/src`.)
2. **Buchung `CANCELLED`:** `ensureBookingLifecycleTasks` setzt `activeDedupKeys=[]` — werden alle Booking-Tasks via `closeStaleBookingLifecycleTasks` auf DONE gesetzt, oder bleiben sie offen? (Code legt nahe: close bei leerer active-Liste — **Verifikation durch Laufzeit-Test ausstehend**.)
3. **Parallele `booking:invoice` vs. `document:FINAL_INVOICE`:** Ist das fachlich gewollt (zwei Rollen) oder Redundanz?
4. **`hm_no_tracking`:** Soll jemals ein OrgTask materialisiert werden, oder bewusst nur Insight/Notification?
5. **ServiceCase-Abschluss:** Soll Task-Cascade kommen oder bleibt bewusste Entkopplung?
6. **Legacy `tasks.service.update(id, …)` ohne Controller:** Gibt es externe/internal Aufrufer außer WhatsApp `tasks.create`?

---

**Ende der Inventur.** Keine produktiven Dateien wurden verändert.
