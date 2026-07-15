# Task Domain V2 — Backend Test Coverage

Stand: 2026-07-15  
Scope: Backend-Tests für Task Domain V2 (keine neuen Produktfunktionen außer durch Tests belegte Fehler).

## Ausführung

```bash
cd backend

# Task-Domain-Suite (535 Tests in 47 Suites, Stand 2026-07-15)
npm test -- --testPathPattern="tasks/|task-domain|task-transition|task-bucket|task-checklist|task-linked|booking-task|vehicle-cleaning-task|invoice-payment-task|booking-document-task|service-overdue-task|task-automation"

# Domain-V2-Paket isoliert (12 Suites)
npm test -- --testPathPattern="task-domain-v2|tasks.controller.spec"

# Prisma + TypeScript
npm run prisma:validate
npx tsc --noEmit

# Build
npm run build
```

**Letzter Lauf:** alle obigen Schritte grün (535/535 Tests, Build OK).

---

## Abdeckungsmatrix A–J

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **A. Statusmaschine** | ✅ Voll | `task-transition.policy.spec.ts`, `task-domain-v2/status-machine.spec.ts`, `tasks.service.spec.ts` |
| **B. Audit** | ✅ Voll | `task-domain-v2/audit.spec.ts`, `tasks.service.spec.ts` |
| **C. Abschlussarten** | ✅ Voll | `task-domain-v2/completion-modes.spec.ts`, `task-domain-v2/resolution-policy.spec.ts`, `tasks.service.spec.ts` |
| **D. Checklisten** | ✅ Voll | `task-domain-v2/checklists.spec.ts`, `task-checklist-*.spec.ts`, `tasks.service.spec.ts` |
| **E. Aktivierung & Buckets** | ✅ Voll | `task-bucket.util.spec.ts`, `task-domain-v2/buckets-where.spec.ts`, `tasks.service.spec.ts` |
| **F. Linked Objects** | ✅ Voll | `task-linked-object-resolver.service.spec.ts`, `task-domain-v2/linked-objects.spec.ts` |
| **G. Automationen** | ✅ Weitgehend | `task-domain-v2/automation-matrix.spec.ts`, `booking-task.pipeline.integration.spec.ts`, `booking-document-task.sync.spec.ts`, `invoice-payment-task.integration.spec.ts`, `vehicle-cleaning-task.integration.spec.ts`, `service-overdue-task.integration.spec.ts`, `task-automation.service.spec.ts` |
| **H. Dedup & Races** | ✅ Weitgehend | `task-domain-v2/dedup-race.spec.ts`, `tasks.service.spec.ts`, `outbox/task-automation-outbox.spec.ts` |
| **I. Rechte** | ✅ Voll | `task-domain-v2/permissions.spec.ts`, `task-checklist-override.policy.spec.ts`, `tasks.controller.spec.ts` |
| **J. Migration & Legacy** | ✅ Voll | `task-domain-v2/legacy-migration.spec.ts`, `diagnostic/task-data-*.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## A. Statusmaschine

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Alle erlaubten Übergänge (10 Paare) | Policy + Service | `task-transition.policy.spec.ts`, `status-machine.spec.ts` |
| Alle verbotenen Übergänge (10 Paare) | Policy + Service | `task-transition.policy.spec.ts`, `status-machine.spec.ts` |
| Terminalstatus (DONE/CANCELLED) | assign/update blockiert | `status-machine.spec.ts`, `tasks.service.spec.ts` |
| Idempotenz start/waiting/complete/cancel | Service-Layer | `status-machine.spec.ts`, `tasks.service.spec.ts` |

---

## B. Audit

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Status + Event atomar (`$transaction`) | ✅ | `audit.spec.ts`, `tasks.service.spec.ts` |
| Eventfehler → Rollback | ✅ | `audit.spec.ts` |
| Actor (`actorUserId`) | ✅ | `audit.spec.ts` |
| Metadata MANUAL / AUTO_RESOLVED / SUPERSEDED | ✅ | `audit.spec.ts` |
| Checklisten-Override-Event | ✅ | `checklists.spec.ts`, `tasks.service.spec.ts` |

---

## C. Abschlussarten

| Modus | Abdeckung | Datei |
|-------|-----------|-------|
| MANUAL | `completeTask` setzt `completionMode` | `completion-modes.spec.ts` |
| AUTO_RESOLVED | System-Close + Event | `completion-modes.spec.ts`, `tasks.service.spec.ts` |
| SUPERSEDED | Obsoleszenz + Nachfolger | `completion-modes.spec.ts`, `tasks.service.spec.ts` |
| Keine Umklassifizierung | Idempotenz / Reject auf Terminal | `completion-modes.spec.ts` |
| Resolution-Pflicht (6 Typen) | `RESOLUTION_REQUIRED_TYPES` | `resolution-policy.spec.ts` |

---

## D. Checklisten

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Erforderliche Punkte blockieren | ✅ | `checklists.spec.ts`, `task-checklist-completion.policy.spec.ts` |
| Optionale Punkte erlauben Abschluss | ✅ | `checklists.spec.ts` |
| Fortschritt / Progress | ✅ | `checklist-progress.util.spec.ts`, `tasks.service.spec.ts` |
| Abschlussblockade | ✅ | `checklists.spec.ts` |
| Manager-Override | ✅ | `checklists.spec.ts`, `permissions.spec.ts` |
| Read-only nach Abschluss | ✅ | `checklists.spec.ts` |

---

## E. Aktivierung & Buckets

| Bucket | Abdeckung | Datei |
|--------|-----------|-------|
| NOW | Critical / Overdue / blocksVehicle | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| TODAY | Org-Timezone | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| UPCOMING | 72h-Horizont | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| PLANNED | Future `activatesAt` | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| OVERDUE | Past `dueDate` | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| UNASSIGNED | Null `assignedUserId` | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| DST Europe/Berlin | Frühling/Herbst | `task-bucket.util.spec.ts`, `buckets-where.spec.ts` |
| `buildTaskBucketWhere` | Prisma-Where je Bucket | `buckets-where.spec.ts` |

---

## F. Linked Objects

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Alle unterstützten Typen | VEHICLE, BOOKING, CUSTOMER, INVOICE, DOCUMENT, ALERT, SERVICE_CASE, FINE, VENDOR | `task-linked-object-resolver.service.spec.ts`, `linked-objects.spec.ts` |
| Gelöschtes Objekt | `isAvailable: false` | `linked-objects.spec.ts` |
| Tenant-Trennung | `organizationId` in Queries + `assertLinksBelongToOrg` | `linked-objects.spec.ts`, `tasks.service.spec.ts` |

---

## G. Automationen

| Domäne | Abdeckung | Datei |
|--------|-----------|-------|
| Booking Preparation | CONFIRMED-Materialisierung | `automation-matrix.spec.ts`, `booking-task.pipeline.integration.spec.ts` |
| Pickup | CONFIRMED + ACTIVE | `automation-matrix.spec.ts`, `booking-task.pipeline.integration.spec.ts` |
| Return | ACTIVE-Phase, Timing | `booking-task.pipeline.integration.spec.ts` (Szenario 5) |
| Documents | Sync bei Bundle | `booking-document-task.sync.spec.ts` |
| Invoice | Payment-Check | `invoice-payment-task.integration.spec.ts` |
| Cleaning | Standalone + Booking | `vehicle-cleaning-task.integration.spec.ts` |
| Service / Insights | Overdue-Service | `service-overdue-task.integration.spec.ts` |
| Regelkatalog / Outbox | Enqueue + Retry | `task-automation.service.spec.ts`, `outbox/task-automation-outbox.spec.ts` |

---

## H. Dedup & Race Conditions

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Wiederholte Events (Escalation) | Active dedup → update | `dedup-race.spec.ts`, `tasks.service.spec.ts` |
| Closed-Key-Parking `{key}:closed:{id}` | ✅ | `dedup-race.spec.ts` |
| Konkurrierende terminal calls | Parallel complete/autoResolve idempotent | `dedup-race.spec.ts` |
| Outbox-Retry / Claim-Idempotenz | ✅ | `outbox/task-automation-outbox.spec.ts` |

---

## I. Rechte

| Rolle | Abdeckung | Datei |
|-------|-----------|-------|
| ORG_ADMIN | Override erlaubt | `permissions.spec.ts` |
| SUB_ADMIN mit `tasks.manage` | Override erlaubt | `permissions.spec.ts` |
| SUB_ADMIN ohne `tasks.manage` | Forbidden | `permissions.spec.ts` |
| WORKER | Override verboten | `permissions.spec.ts` |
| Fremde Organisation | assign/get blockiert | `permissions.spec.ts`, `linked-objects.spec.ts` |
| Controller Guards | OrgScoping + RolesGuard | `tasks.controller.spec.ts` |

---

## J. Migration & Legacy

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| `completionMode: null` auf DONE | Serialisierung + Diagnose | `legacy-migration.spec.ts`, `task-data-diagnostic.service.spec.ts` |
| Tasks ohne `activatesAt` | Bucket-Listing | `legacy-migration.spec.ts` |
| Legacy-DONE mit offener Checkliste | Detail ohne Blocker + Diagnose/Repair | `legacy-migration.spec.ts`, `task-data-repair.service.spec.ts` |
| Backfill / Repair dry-run | ✅ | `task-data-repair.service.spec.ts` |

---

## Neues Testpaket `task-domain-v2/`

Zentrale Ergänzungen (2026-07-15):

```
backend/src/modules/tasks/
├── __fixtures__/tasks-service.fixtures.ts   # Shared harness + mockTaskTransition
├── task-domain-v2/
│   ├── status-machine.spec.ts      # A
│   ├── audit.spec.ts               # B
│   ├── completion-modes.spec.ts    # C
│   ├── resolution-policy.spec.ts   # C (6 resolution types)
│   ├── checklists.spec.ts          # D
│   ├── buckets-where.spec.ts       # E
│   ├── linked-objects.spec.ts      # F
│   ├── automation-matrix.spec.ts   # G (smoke + Verweise)
│   ├── dedup-race.spec.ts          # H
│   ├── permissions.spec.ts         # I
│   └── legacy-migration.spec.ts    # J
└── tasks.controller.spec.ts        # REST-Delegation + Guards
```

---

## Verbleibende Lücken

| # | Lücke | Risiko | Empfehlung |
|---|-------|--------|------------|
| 1 | **Payment-Reconciliation → Invoice-Task-Close** | Mittel | Explizit in `invoice-payment-task.integration.spec.ts` ergänzen (in Pipeline-Kommentar als Gap #51 vermerkt) |
| 2 | **E2E mit echter Postgres-DB** | Niedrig | Projekt nutzt bewusst In-Memory-Pipeline-Harness; optional separates `@e2e`-Paket |
| 3 | **Summary ↔ Bucket Konsistenz** | Niedrig | `getDashboardSummary` gegen `classifyPrimaryTaskBucket` für Stichproben testen |
| 4 | **InsightTaskBridge dediziert** | Niedrig | Eigene Spec wenn Bridge-Logik wächst; derzeit über Service-Overdue-Integration abgedeckt |
| 5 | **Concurrent `upsertByDedup` (echte Parallelität)** | Niedrig | DB-Level-Unique-Constraint-Test mit Postgres |
| 6 | **Vollständiger Controller-Contract** | Niedrig | Alle Routen einzeln — aktuell repräsentative Delegation + Guards |

---

## Fixtures & Harness

- **`tasks-service.fixtures.ts`**: `baseTask()`, `makeTasksPrismaMock()`, `createTasksServiceHarness()`, `mockTaskTransition()`
- **`booking-task-pipeline.harness.ts`**: In-Memory-Store für Lifecycle-Integration
- **`task-automation-outbox-test.util.ts`**: Noop-Outbox für Integrations-Tests

---

## Änderungshistorie

| Datum | Änderung |
|-------|----------|
| 2026-07-15 | Initiales Domain-V2-Testpaket + Coverage-Dokumentation |
