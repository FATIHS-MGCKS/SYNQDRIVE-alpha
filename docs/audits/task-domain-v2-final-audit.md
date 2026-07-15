# Task Domain V2 — Final Read-Only Audit

**Stand:** 2026-07-15  
**Scope:** Repositoryweites Task-System (Schema, Backend, Frontend Operator/Rental, Workflow-Automation, Zuverlässigkeit, Tests)  
**Modus:** Read-only — keine Produktdateien verändert

---

## Executive Summary

| Bereich | Bewertung | Kritische Lücken |
|---------|-----------|------------------|
| 1. Schema | Weitgehend vollständig | `fineId`/`invoiceId` ohne Migration; V2-DDL ggf. noch nicht deployed |
| 2. Statusintegrität | Stark | Direkter Task-Create in `vehicles.service`; stille Automation-Hooks |
| 3. Checklisten | Vollständig | — |
| 4. Automationen | Korrekt vs. Legacy-Trio | Cleaning/Service ohne Rule-Resolver; Invoice-Timing-Refresh |
| 5. API | Vollständig | `activatesAt > now` blockiert `complete` nicht (Spec CB4) |
| 6. Operator | Funktional | Tote Snapshot-Felder; Label-Inkonsistenzen |
| 7. Rental | Funktional | Toter `NewTaskModal`-Pfad |
| 8. Workflow Management | Funktional | Kein Audit-Log-UI (nur Revisions-Tabelle) |
| 9. Zuverlässigkeit | Vorhanden | PROCESSING-Stuck; Outbox abschaltbar |
| 10. Codequalität | Gut | Wenige tote Komponenten; Doc-Drift |
| 11. Tests/Builds | Grün | Siehe §11 |

**P0-Blocker:** Keiner identifiziert (kein unauditierter Terminal-Status-Write, keine destructive Task-Migration).  
**P1 vor Produktion:** 12 Findings (siehe Matrix unten).  
**P2 Verbesserungen:** 18 Findings.

---

## Klassifikationslegende

| Stufe | Bedeutung |
|-------|-----------|
| **P0** | Datenverlust, Tenant-Leak, unauditierter Abschluss, destructive Migration |
| **P1** | Spec-Abweichung oder Betriebsrisiko vor Produktions-Rollout |
| **P2** | Tech Debt, UX-Inkonsistenz, tote Pfade — kein unmittelbarer Blocker |
| **Kein Problem** | Anforderung erfüllt und durch Tests/Architektur belegt |

---

## 1. Schema

### 1.1 Felder, Enums, Indizes, Migrationen

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| V2-Enums (`TaskCompletionMode`, erweiterte `TaskStatus` mit `WAITING`) | **Kein Problem** | `backend/prisma/schema.prisma` L3673–3727 | Abschlussarten modelliert | — |
| V2-Spalten (`completionMode`, `resolutionCode`, `completedByUserId`, `supersededByTaskId`, `activatesAt`, `estimatedDurationMinutes`) | **Kein Problem** | `schema.prisma` L3776–3781; Migration `20260715150000_org_task_v2_additive_completion_fields` | Additive DDL | Migration auf Staging/Prod ausführen |
| Checklist `isRequired` | **Kein Problem** | Migration `20260715140000_task_checklist_item_is_required` | Pflichtpunkt-Policy | — |
| Task-Automation-Outbox + Rule-Overrides | **Kein Problem** | Migrationen `20260715140000_task_automation_outbox`, `20260715160000_org_task_automation_rule_overrides` | Retry/Audit-Infrastruktur | — |
| Bucket-Index `(organization_id, status, activates_at)` | **Kein Problem** | Migration `20260715150000` | Listen-Performance | — |
| Geplanter Index `(organization_id, assigned_to, status)` fehlt | **P2** | `docs/architecture/task-domain-v2-migration-plan.md` §Index; nur `(org, assigned_to)` in `20260614000100` | Langsamere Assignee+Status-Queries | Index-Migration ergänzen |
| `activatesAt` nullable statt `NOT NULL` + Backfill | **P2** | `schema.prisma` L3776; Plan §D | Semantik über `effectiveActivatesAt()` kompensiert | Optional: NOT NULL + Backfill-Migration |
| Baseline `org_tasks` / initiale Enums nicht in Migrations-Historie | **P1** | Alle Task-Migrationen sind `ALTER TABLE "org_tasks"` | Greenfield-Deploy aus Migrations allein unvollständig | Baseline-Dump oder Squash-Migration dokumentieren/ausführen |
| `OrgTask.fineId` / `OrgTask.invoiceId` in Schema, **keine** `org_tasks`-Migration | **P1** | `schema.prisma` L3748–3749; `20260614000100_task_action_layer` enthält weder `fine_id` noch `invoice_id` | Prisma-Drift; Fresh-DB ≠ Schema | Additive Migration `fine_id`, `invoice_id` (+ ggf. `fines`-Tabelle) |
| `Fine`-Modell ohne `CREATE TABLE` in Migrations | **P1** | `schema.prisma` L3635–3667 | Linked-Object `FINE` nicht deploybar aus Migrations allein | Migration für `fines` |
| Doppelter Migrations-Timestamp `20260715140000` | **P2** | `task_checklist_item_is_required` + `task_automation_outbox` | Deploy-Reihenfolge-Fragilität | Timestamp eines Ordners anpassen |
| Parallele Felder `category`/`type`, `source`/`sourceType` | **P2** (bewusst) | `schema.prisma` L3734–3771; `tasks.service.ts` `inferTypeFromCategory()` | Legacy-Kompatibilität | Langfristig: `category`/`source` deprecaten |
| `resolutionNote` + `resolutionCode` parallel | **Kein Problem** | V2-Spec | Strukturierter + freier Abschluss | — |
| Prisma-Warnung `SetNull` auf required FK | **P2** | `npm run prisma:validate` | Validator-Warnung, kein Task-spezifischer Blocker | FK-`onDelete` prüfen |

### 1.2 Destructive Migrationen

| Prüfpunkt | Klassifikation | Datei | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|-------|------------|----------------------|
| Task-Migrationen: keine `DROP TABLE`/`TRUNCATE` auf Task-Tabellen | **Kein Problem** | `backend/prisma/migrations/20260715150000_*` (explizit additive-only) | Kein Datenverlust | — |
| Dedup-Index-Umbau `DROP INDEX` → org-scoped unique | **Kein Problem** | `20260614120000_task_dedup_org_scoped` | Erwartetes Refactoring | — |
| Enum-Rename `MEDIUM→NORMAL`, `URGENT→CRITICAL` | **Kein Problem** | `20260616160000_task_priority_normal_critical` | In-place relabel | — |
| Child-Tabellen `ON DELETE CASCADE` | **Kein Problem** | `20260614000100_task_action_layer` | Task-Löschung kaskadiert Checklist/Events | — |

### 1.3 Ungenutzte / doppelte Modellierung

| Prüfpunkt | Klassifikation | Datei | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|-------|------------|----------------------|
| `TaskEvent.type` als freier String (kein Enum) | **Kein Problem** | `schema.prisma` L3879; Plan §B | Erweiterbar ohne Migration | — |
| `metadata.resolutionKind` vs. DB `completionMode` | **P2** | `tasks.service.ts` Event-Metadata | Naming-Dualität | Docs/UI auf `completionMode` vereinheitlichen |
| Spec-Doc behauptet `AUTO_RESOLVED`/`SUPERSEDED` „nicht implementiert“ | **P2** | `docs/architecture/task-domain-v2.md` §17 vs. `tasks.service.ts` `autoResolveTask`/`supersedeTask` | Verwirrung bei Onboarding | Architektur-Doc aktualisieren |

---

## 2. Statusintegrität

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Alle `DONE`/`CANCELLED`-Writes über `TasksService` + `$transaction` + Event | **Kein Problem** | `tasks.service.ts` `changeStatus` L1270–1329, `autoResolveTask` L1484–1497, `supersedeTask` L1552–1565 | Atomare Audit-Spur | — |
| Kein `orgTask.updateMany` mit `status` | **Kein Problem** | Grep `backend/src` | Kein Batch-Bypass | — |
| Nicht-Status-Updates (metadata, links) außerhalb Statusmaschine | **Kein Problem** | `task-automation.service.ts`, `vehicle-cleaning-task.service.ts` | Kein Terminal-Bypass | — |
| `MANUAL` → `STATUS_CHANGED` + optional `CHECKLIST_COMPLETION_OVERRIDDEN` | **Kein Problem** | `tasks.service.ts` `recordStatusChangedEvent` | Auditierbar | — |
| `AUTO_RESOLVED` → dediziertes Event | **Kein Problem** | `recordAutoResolvedEvent` | Auditierbar | — |
| `SUPERSEDED` → dediziertes Event + `supersededByTaskId` | **Kein Problem** | `recordSupersededEvent` | Auditierbar | — |
| Idempotenz Terminal-Übergänge | **Kein Problem** | `task-domain-v2/status-machine.spec.ts`, `tasks.service.ts` L1280 | Doppel-Complete sicher | — |
| Direkter `prisma.orgTask.create` (Complaint) | **P1** | `vehicles.service.ts` L2117–2127 | Kein `CREATED`-Event; fehlende `type`/`sourceType`/`dedupKey` | Über `TasksService.createManualTask` oder `upsertByDedup` |
| `completeTask` ohne `actorUserId` möglich | **P1** | `tasks.service.ts` L1303–1306 | `completedByUserId: null` bei MANUAL | Actor für API-Complete erzwingen |
| Fire-and-forget Handover-Automation | **P1** | `bookings-handover.service.ts` (~L314–326) `.catch(() => {})` | AUTO_RESOLVED kann still fehlschlagen | Fehler loggen/metriken; Outbox-Verlass |
| Fire-and-forget Document-Supersede | **P1** | `booking-document-bundle.service.ts` (~L791) | SUPERSEDED läuft evtl. nicht | Wie oben |
| `recordEvent` schluckt Fehler (nicht-terminal) | **P2** | `tasks.service.ts` L397–411 | ASSIGNED/UPDATED ohne Event möglich | Für kritische Events Transaction wie bei Status |
| `CANCELLED` setzt `completionMode: MANUAL` | **P2** | `tasks.service.ts` L1308–1310 | Semantisch ungewöhnlich | Eigenen Modus oder `null` für Cancel prüfen |
| Batch `Promise.all` bei autoResolve/supersede | **P2** | `tasks.service.ts` `autoResolveTasks`/`supersedeTasks` | Partielle Batch-Fehler | Sequentiell oder compensating transaction |
| Spec CB4: `activatesAt > now` blockiert `complete` | **P1** | Spec `task-domain-v2.md` L354; **nicht** in `changeStatus` | Geplante Tasks vorzeitig abschließbar | Guard in `changeStatus` vor `DONE` |
| Repair-Service schreibt kein `status` | **Kein Problem** | `task-data-repair.service.ts` | Backfill nur Metadaten/Events | — |

---

## 3. Checklisten

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Pflichtpunkte (`isRequired`) | **Kein Problem** | Schema + `task-checklist-completion.policy.ts` | Server-seitige Validierung | — |
| Abschlussblockade ohne Override | **Kein Problem** | `assertManualCompletionAllowedByChecklist()`; Code `TASK_REQUIRED_CHECKLIST_INCOMPLETE` | 400 mit offenen Items | — |
| Manager-Override (Permission + Begründung) | **Kein Problem** | `task-checklist-override.policy.ts`; `resolveManualCompletionChecklistGate` | `tasks.manage` / ORG_ADMIN | — |
| Read-only nach `DONE`/`CANCELLED` (API) | **Kein Problem** | `assertChecklistMutable()` L591–597 | PATCH blockiert | — |
| Read-only / documentationOnly (UI) | **Kein Problem** | `taskDetailChecklist.utils.ts` `resolveChecklistDisplayMode` | Legacy-DONE-Hinweis | — |
| Legacy DONE mit offener Checkliste | **Kein Problem** | `LEGACY_DONE_CHECKLIST_HINT`; E2E Test 10 | Nur Dokumentation | — |
| `TaskDetailChecklistOverrideDialog` ungenutzt in Prod | **P2** | Export `lib/tasks/index.ts`; nur Unit-Test | Duplikat zu `TaskDetailCompleteDialog` Override | Komponente entfernen oder in Checklist-Section verdrahten |
| Frontend Override via Checklist-Button + Complete-Dialog | **Kein Problem** | `GlobalTaskDetailPanel.tsx` `onChecklistOverride` → `openCompleteDialog` | Zwei Wege, konsistent | — |

---

## 4. Automationen

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Keine drei Standard-Tasks bei neuer Buchung (legacy clean/document/invoice) | **Kein Problem** | `task-automation.service.ts` CONFIRMED: prep+pickup; `booking-task.pipeline.integration.spec.ts` | Spec erfüllt | — |
| `BOOKING_RETURN` erst bei `ACTIVE` | **Kein Problem** | `task-automation.service.ts` L821–823 | Kein dritter Task bei Confirm | — |
| Dokumenten-Spam (ein Package pro Phase) | **Kein Problem** | `document:package:{phase}:{bookingId}`; `booking-document-task.sync.spec.ts` | Dedup + Legacy-Supersede | — |
| Keine doppelten Cleaning-Tasks (Runtime-Dedup) | **Kein Problem** | `vehicle-cleaning-task.service.ts` `findPrimaryOpenCleaningTask` | Integrationstests grün | — |
| Zukünftige Rechnungstasks (`activatesAt`, PLANNED-Bucket) | **Kein Problem** | `invoice-payment-task.util.ts`; `task-bucket.util.ts` `isTaskPlanned` | Read-time Bucket | — |
| Invoice-Timing-Refresh verliert Org-Offsets | **P1** | `invoice-payment-task.service.ts` (~L179–192) | Nach erstem Upsert falsche `activatesAt`/`dueDate` | `adjustedTiming` auch bei Refresh |
| Invoice-Refresh-Cron nur bei OVERDUE-Transition | **P2** | `invoice-overdue-scheduler.service.ts` | „Due today“-Eskalation verzögert | Periodischer Refresh-Job |
| Cleaning ignoriert Org-Rule-Resolver | **P1** | `vehicle-cleaning-task.service.ts` (kein `TaskAutomationRuleResolverService`) | Org-Disable wirkungslos | Rule-Resolver wie Booking/Invoice |
| Service-Materialisierung: zwei Pfade (Bridge vs. Compliance) | **P1** | `insight-task-bridge.service.ts` vs. `compliance-task-materialize.service.ts` | Compliance bypassed Rules/Outbox | Einheitlicher Pfad |
| Stale `booking:document` in `confirmedPhaseActiveDedupKeys` | **P1** | `task-automation-rule.util.ts` | Stale Lifecycle-Close unvollständig | Auf `document:package:*` umstellen |
| `ensureDocumentTask` deprecated, keine Caller | **P2** | `task-automation.service.ts` (~L1059) | Toter Code | Entfernen |
| `ensureBookingLifecycleTasks` bei `PENDING`-Create | **P2** | `bookings.service.ts` (~L309) | Harmlos durch Guards, aber noisy | Nur bei CONFIRMED/ACTIVE triggern |
| Simulation-Prefix-Mismatch (`booking:document` vs. package) | **P2** | `task-automation-simulation.service.ts` | Admin-Simulation irreführend | Prefixs an Catalog anpassen |
| Service-Tasks fachlich (Insight-Typen, Dedup) | **Kein Problem** | `service-overdue-task.integration.spec.ts` | Bridge + Auto-Resolve getestet | — |
| Architektur-Doc: Pickup/Return-Trigger veraltet | **P2** | `docs/architecture/task-domain-v2.md` vs. `task-automation-rule.catalog.ts` | Onboarding-Risiko | Doc sync |

---

## 5. API

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Tenant-Scope (`OrgScopingGuard` + Service-Link-Validation) | **Kein Problem** | `tasks.controller.ts` L33–37, L40–41 | Kein Cross-Tenant-Leak | — |
| DTOs vollständig (Create, Complete, Bulk, List-Query) | **Kein Problem** | `dto/task.dto.ts`; Controller L44–60 | Filter inkl. `invoiceId`, `stationId` | — |
| `linkedObjects` via Resolver + Detail-View | **Kein Problem** | `task-linked-object-resolver.service.ts`; `task-detail-view.builder.ts` | Human-readable Labels | — |
| `availableActions` im Detail | **Kein Problem** | `task-detail-view.builder.ts` `buildAvailableActions` | Override-Flag serverseitig | — |
| Buckets (NOW/TODAY/PLANNED/…) | **Kein Problem** | `task-bucket.util.ts`; `task-domain-v2/buckets-where.spec.ts` | Server-seitige Semantik | — |
| Rückwärtskompatibilität (nullable V2-Felder, Legacy-List ohne Detail) | **Kein Problem** | `format()` in `tasks.service.ts`; Frontend `isNormalizedTaskDetail` | Alte Clients funktionieren | — |
| `activatesAt` in List/Detail exponiert | **Kein Problem** | `tasks.service.ts` L260 | Clients können PLANNED rendern | — |
| Complete-Policy nicht auf `activatesAt` | **P1** | Siehe §2 CB4 | API erlaubt vorzeitigen Abschluss | Server-Guard |

---

## 6. Operator

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Heute: Bucket-Feed, **nicht** pauschale All-Open-Liste | **Kein Problem** | `useOperatorTodayFeed.ts`; `operatorTodayFeed.utils.ts` (exkl. `ALL_OPEN`) | NOW/TODAY/UPCOMING/PLANNED/UNASSIGNED | — |
| `ALL_OPEN` nur Tasks-Tab / Nav-Link | **Kein Problem** | `OperatorDataContext.tsx` L83; `shouldShowAllOpenTasksNav` | Bewusste Trennung | — |
| Konkrete Labels (Linked Objects, Dokumentnamen) | **Kein Problem** | `operatorTaskDisplay.utils.test.ts`; `OperatorTaskCard.test.tsx` | Keine generischen „Dokumente“-Labels | — |
| Keine UUIDs in Haupt-UI | **Kein Problem** | `operatorTaskCard.utils.ts`; E2E `assertNoVisibleUuids` | Timeline-Scrubbing | — |
| Mobile Aktionen (48px/44px Targets) | **Kein Problem** | `OperatorTaskCard.tsx`; `OperatorTodayView` Sheet-Detail | Touch-tauglich | — |
| `openTaskEntries` berechnet, nie gerendert | **P2** | `operatorData.ts` L211; keine View-Consumer | Toter Code + verwirrende Tests | Feld entfernen |
| `vehicleCheckTasks` beeinflusst Empty-State, nie gerendert | **P2** | `operatorTodayView.utils.ts` L121 | Falsche „leer“-Semantik | Rendern oder entfernen |
| `totalOpenTasksCount`-Fallback ohne `ALL_OPEN`-Bucket | **P2** | `operatorData.ts` L213–217 | „Alle offenen (N)“ evtl. zu niedrig | Immer `summary.buckets.ALL_OPEN` |
| Status-/Priority-Labels inkonsistent (Operator vs. Rental) | **P2** | `task-detail.utils.ts` „In Arbeit“ vs. `task-list.utils.ts` „In Bearbeitung“ | UX-Verwirrung | Zentrale Label-Map |
| Operator Tasks-Tab: Raw-Enums in Priority-Chips | **P2** | `OperatorTasksView.tsx` L224–236 | `HIGH` statt „Hoch“ | `vehicleTaskPriorityLabel` |
| Client-inferierte `availableActions` auf Cards | **P2** | `operatorTaskCard.utils.ts` L228–297 | „Erledigen“ evtl. vor Detail falsch | Backend-Actions auf List-DTO oder Complete disablen bis Detail |
| Legacy Document-Dedup-Heuristik | **Kein Problem** (intentional) | `operatorTodayTasks.ts` `filterCanonicalOperatorTasks` | Versteckt Legacy-Per-Type-Docs | — |
| Dual Data-Source OperatorTasksView (Context vs. API-Filter) | **P2** | `OperatorTasksView.tsx` L46–88 | Wartungsrisiko | Einheitliche Query-Strategie |

---

## 7. Rental

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Task Page (Buckets, URL-State, Filter, KPI) | **Kein Problem** | `TasksView.tsx`; `TasksView.contract.test.ts`; E2E Test 1 | V2-konform | — |
| Detailseite (Shell, Actions, Dialoge außerhalb Sheet) | **Kein Problem** | `GlobalTaskDetailPanel.tsx`; `useTaskDetailActionsHost` | Radix-Nesting behoben | — |
| Manuelle Erstellung (`TasksNewTaskDialog` + `ManualTaskCreateForm`) | **Kein Problem** | `ManualTaskCreateForm.test.tsx`; Felder inkl. `estimatedDurationMinutes`, `initialNote` | Persistenz getestet | — |
| Filter + Bulk-Aktionen | **Kein Problem** | `TasksFilterPanel.test.tsx`; `TasksBulkActionBar.test.tsx`; `api.tasks.bulk` | Assign/Priority/Due/Waiting/Cancel | — |
| `NewTaskModal` gemountet, nie geöffnet | **P2** | `App.tsx` L186, L1116–1118; kein `setIsNewTaskModalOpen(true)` | Toter paralleler Create-Flow | Entfernen oder konsolidieren |
| Entity-Lookup-Fallback zeigt UUID | **P2** | `TasksView.tsx` L184–199; `TasksNewTaskDialog.tsx` | Seltene UUID in Dropdown | Immer `bookingNumber`/`name` |
| Client-Sort nach Server-Bucket | **P2** | `TasksView.tsx` L250–252 | OK heute; fragil bei Paging | Server-Sort oder dokumentieren |

---

## 8. Workflow Management

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Regelkatalog (Booking, Document, Invoice, Cleaning, Service) | **Kein Problem** | `task-automation-rule.catalog.ts` | Zentrale Definition | — |
| Org-Overrides + Versionierung | **Kein Problem** | `OrgTaskAutomationRuleOverride` + `Revision`; `TaskAutomationRuleDrawer.tsx` | Optimistic concurrency | — |
| Simulation (read-only, API + UI) | **Kein Problem** | `task-automation-simulation.service.ts`; `TaskAutomationSimulationPanel`; Controller-Tests | Kein Persist bei Simulate | — |
| Audit (DB-Revisions) | **Kein Problem** (Backend) | `OrgTaskAutomationRuleOverrideRevision` | Snapshots vorhanden | — |
| Audit-UI (wer/wann/was im Produkt) | **P2** | `TaskAutomationRuleDrawer.tsx` — nur `updatedAt`/`updatedByName` | Kein Revision-Diff in UI | Revisions-Liste im Drawer |
| Generic Workflow Engine: Legacy-Trigger-Keys | **P2** | `WorkflowAutomationView.tsx` L92–106 (`vehicle_returned` vs. `booking.returned`) | Verwechslung mit Task-Automation | Keys deprecaten |
| Permission `workflow-automation` für Task-Rules | **Kein Problem** | `task-automation.integration.test.ts` | Korrekt getrennt von `tasks.*` | — |

---

## 9. Zuverlässigkeit

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Outbox-Enqueue bei Automation-Fehlern | **Kein Problem** | `task-automation-outbox-enqueue.service.ts`; Services nutzen `enqueueFailure` | Durable Retry | — |
| Retry + Exponential Backoff (Default 5×, 60s) | **Kein Problem** | `task-automation-outbox.config.ts` | Konfigurierbar | — |
| Dead-Letter nach Max Attempts | **Kein Problem** | `task-automation-outbox.repository.ts` L130 | Status `DEAD_LETTER` | — |
| Idempotente Verarbeitung (dedupKey, Outbox-Idempotency) | **Kein Problem** | `task-automation-outbox-idempotency.util.ts`; `upsertByDedup` | Race-sicher getestet | — |
| Prometheus-Metriken Outbox | **Kein Problem** | `trip-metrics.service.ts` L557–597 (`synqdrive_task_automation_outbox_*`) | Enqueued/Failed/Backlog/Duration | — |
| Outbox abschaltbar per Env | **P1** | `TASK_AUTOMATION_OUTBOX_ENABLED=false` → `enqueueFailure` no-op | Automation-Fehler nur Logs | Prod: enforced enabled + Alert |
| PROCESSING-Stuck (Crash mid-job) | **P1** | `task-automation-outbox.repository.ts` L71, L96; kein Stale-Recovery | Row blockiert Re-Enqueue | Timeout → PENDING Recovery-Job |
| DEAD_LETTER ohne Auto-Replay / Admin-API | **P2** | Scheduler pollt nur `PENDING` | Manuelle Ops nötig | Admin-Replay-Endpoint |
| Service-Compliance-Pfad ohne Outbox | **P1** | `service-overdue-task.service.ts` `materializeFromSignal` | Direkter Upsert-Fehler = Datenlücke | Outbox wie Bridge |
| `recordEvent`-Swallow (nicht-kritisch) | **P2** | `tasks.service.ts` L405–411 | Audit-Lücken bei Assign/Update | Siehe §2 |

---

## 10. Codequalität

| Prüfpunkt | Klassifikation | Datei / Pfad | Auswirkung | Empfohlene Korrektur |
|-----------|----------------|--------------|------------|----------------------|
| Task-Module: keine `TODO`/`FIXME` | **Kein Problem** | Grep `backend/src/modules/tasks/**`, `frontend/src/**/*task*` | Sauber | — |
| String „Detail aktualisieren“ | **Kein Problem** | Grep repo-weit: **nicht gefunden** | Entfernt oder nie gelandet | — |
| Tote Komponenten: `NewTaskModal` | **P2** | `App.tsx` | Siehe §7 | Entfernen |
| Tote Komponenten: `TasksSectionView` | **P2** | Nur `figma-rental/App.tsx` | Legacy-Figma | Löschen wenn ungenutzt |
| Tote Komponenten: `TaskDetailChecklistOverrideDialog` | **P2** | Nur Test-Import | Duplikat | Entfernen |
| Alte API-Pfade (`/api/v2/tasks` etc.) | **Kein Problem** | Grep `frontend/src` | Einheitlich `/organizations/:orgId/tasks` | — |
| `as any` in Task-Produktcode | **Kein Problem** | Keine Treffer in `*task*` Prod-Dateien; `api.ts` L4826 isoliert | Typ-Sicherheit Task-Domain OK | — |
| Duplizierte Dedup-Helper (Cleaning, Service) | **P2** | `task-automation-rule.util.ts` vs. `vehicle-cleaning-task.util.ts` / `service-overdue-task.util.ts` | Drift-Risiko | Eine Quelle |
| Duplizierte Businesslogik Label-Maps | **P2** | Operator/Rental/Entity (siehe §6) | Inkonsistente UI | `task-display.utils` zentralisieren |
| Alte Gruppierungsheuristiken | **P2** | `filterCanonicalOperatorTasks`, `mapTaskCategory` Fallbacks | Legacy-Kompatibilität | Nach Migration entfernen |
| Architektur-/Changes-Docs veraltet | **P2** | `task-domain-v2.md`, `ArchitekturView.tsx` (zitiert `NewTaskModal`) | Onboarding | Docs sync |
| Debug-Texte in Task-UI | **Kein Problem** | Keine auffälligen Debug-Strings in Task-Komponenten | — | — |

---

## 11. Tests und Builds

### Ausgeführte Kommandos und Resultate (2026-07-15)

| # | Kommando | Ergebnis |
|---|----------|----------|
| 1 | `cd backend && npm run prisma:validate` | ✅ Schema valid (1 unrelated `SetNull`-Warnung) |
| 2 | `cd backend && npx tsc --noEmit` | ✅ Exit 0 |
| 3 | `cd backend && npm run build` | ✅ `nest build` Exit 0 |
| 4 | `cd backend && npm test -- --testPathPattern="tasks/|task-domain|…|task-automation"` | ✅ **527/527** Tests, **46/46** Suites |
| 5 | `cd frontend && npx tsc -b` | ✅ Exit 0 |
| 6 | `cd frontend && npm test -- --run` | ✅ **1199 passed**, 1 skipped, **194** Dateien |
| 7 | `cd frontend && npm test -- --run src/lib/tasks src/rental/components/tasks src/operator/tasks …` | ✅ **123/123** Task-Fokus |
| 8 | `cd frontend && npm run build` | ✅ Vite build Exit 0 |
| 9 | `cd frontend/e2e && npx playwright test tasks-flow.spec.ts tasks-responsive.spec.ts --project=desktop-1280` | ✅ **13/13** |
| 10 | `cd frontend/e2e && npx playwright test tasks-flow.spec.ts tasks-responsive.spec.ts` (alle Viewports) | ✅ **78/78** |

### Test-Abdeckung nach Audit-Bereichen

| Bereich | Primäre Nachweise |
|---------|-------------------|
| Schema/Migration | `prisma:validate`; Migrations-Review; `task-domain-v2/legacy-migration.spec.ts` |
| Status/Abschluss | `task-transition.policy.spec.ts`, `task-domain-v2/completion-modes.spec.ts`, `audit.spec.ts` |
| Checklisten | `task-checklist-completion.policy.spec.ts`, `task-domain-v2/checklists.spec.ts` |
| Automationen | `booking-task.pipeline.integration.spec.ts`, `booking-document-task.sync.spec.ts`, `invoice-payment-task.integration.spec.ts`, `vehicle-cleaning-task.integration.spec.ts`, `service-overdue-task.integration.spec.ts` |
| API | `tasks.controller.spec.ts`, `task-domain-v2/permissions.spec.ts`, `api-contract.test.ts` |
| Operator | `operatorTodayFeed.utils.test.ts`, `OperatorTodayTaskFeed.test.tsx`, `OperatorTaskCard.test.tsx` |
| Rental | `TasksView.contract.test.ts`, `ManualTaskCreateForm.test.tsx`, E2E `tasks-flow.spec.ts` |
| Workflow | `task-automation.integration.test.ts`, `task-automation-simulation.service.spec.ts` |
| Zuverlässigkeit | `task-automation-outbox.spec.ts` |
| Query Cache (Frontend) | `invalidate.test.ts`, `taskQueryCache.contract.test.ts` |

**Dokumentierte Coverage-Map:** `docs/testing/task-domain-v2-backend-coverage.md`, `docs/testing/task-domain-v2-frontend-e2e-coverage.md`

---

## Priorisierte Maßnahmenliste (Top 12 P1)

| # | Finding | Bereich |
|---|---------|---------|
| 1 | `fineId`/`invoiceId`/`fines` ohne Migration — Schema-Drift | Schema |
| 2 | Spec CB4: `complete` bei `activatesAt > now` nicht enforced | API/Status |
| 3 | `vehicles.service` direkter `orgTask.create` ohne Audit/Taxonomie | Status |
| 4 | Fire-and-forget Automation in Handover/Document-Bundle | Status/Automation |
| 5 | Invoice-Timing-Refresh verliert Org-Offsets | Automation |
| 6 | Cleaning ohne Org-Rule-Resolver | Automation |
| 7 | Service-Compliance bypassed Rules + Outbox | Automation |
| 8 | Stale `booking:document` in active dedup keys | Automation |
| 9 | Outbox `PROCESSING`-Stuck ohne Recovery | Zuverlässigkeit |
| 10 | Outbox per Env abschaltbar ohne harten Prod-Guard | Zuverlässigkeit |
| 11 | Baseline `org_tasks` nicht in Migrations-Historie | Schema |
| 12 | `completeTask` ohne verpflichtenden Actor | Status |

---

## Gesamtfazit

Das Task-System ist **architektonisch reif** für V2: zentrale Statusmaschine, auditierbare Abschlussarten, Checklisten-Policy mit Override, bucket-basierte Operator-Heute-Ansicht, normalisierte Rental-Detail-UI und umfangreiche Test-Suite (527 Backend + 1199 Frontend Unit + 78 E2E).

**Vor Produktions-Rollout** sollten die **P1-Punkte** adressiert werden — insbesondere Schema-Drift (`fineId`/`invoiceId`), CB4-Aktivierungs-Guard, Outbox-Betriebssicherheit und Automation-Pfad-Konsistenz (Cleaning/Service/Invoice-Refresh). **P2** betrifft vor allem Doc-Sync, tote UI-Komponenten und Label-Vereinheitlichung.

---

*Audit durchgeführt als Read-only-Repository-Review. Keine Produktdateien wurden verändert.*
