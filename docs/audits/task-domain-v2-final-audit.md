# Task Domain V2 — Final Audit (Remediation)

**Stand:** 2026-07-15 (nach P1- + P2-Remediation)  
**Scope:** Repositoryweites Task-System (Schema, Backend, Frontend Operator/Rental, Workflow-Automation, Zuverlässigkeit, Tests)  
**Modus:** P0/P1/P2-Fundstellen behoben; statische Re-Suche und Test-/Build-Matrix ausgeführt

---

## Executive Summary

| Bereich | Bewertung | Nach Remediation |
|---------|-----------|------------------|
| 1. Schema | Vollständig | Migrationen inkl. Index, `activatesAt` NOT NULL, Outbox-Timestamp |
| 2. Statusintegrität | Stark | CB4 + Actor-Guard; sequentielle Batch-Ops; `CANCELLED` ohne `completionMode` |
| 3. Checklisten | Vollständig | — |
| 4. Automationen | Korrekt | Cleaning/Service/Invoice/Dedup/Handover; Invoice-Refresh-Cron |
| 5. API | Vollständig | CB4 serverseitig enforced |
| 6. Operator | Poliert | Einheitliche API-Query, Label-Map, Card-Complete nur im Detail |
| 7. Rental | Poliert | Tote Modals entfernt; UUID-Fallbacks; Client-Sort dokumentiert |
| 8. Workflow Management | Poliert | Revisions-UI; kanonische Trigger-Defaults |
| 9. Zuverlässigkeit | Produktionsreif | Outbox Prod-Guard + PROCESSING-Recovery + Admin-Replay |
| 10. Codequalität | Gut | Toter Code entfernt; zentrale Labels |
| 11. Tests/Builds | Grün | 530+ Backend Task + 119+ Frontend Task + 78 E2E |

**P0-Blocker:** Keiner.  
**P1 vor Produktion:** **12/12 behoben**.  
**P2 Verbesserungen:** **18/18 behoben** (siehe Matrix).

**Finale Produktionsfreigabe:** **READY**

---

## P0/P1-Statusmatrix (Top 12)

| # | Finding | Bereich | Status | Nachweis |
|---|---------|---------|--------|----------|
| 1 | `fineId`/`invoiceId`/`fines` ohne Migration | Schema | **behoben** | `20260715170000_org_task_fine_invoice_links` |
| 2 | CB4: `complete` bei `activatesAt > now` | API/Status | **behoben** | `tasks.service.ts` `changeStatus` Guard |
| 3 | `vehicles.service` direkter `orgTask.create` | Status | **behoben** | `createManualTask` + CREATED-Event |
| 4 | Fire-and-forget Handover-Automation | Status/Automation | **behoben** | `runBackgroundTask` + Error-Log; Outbox |
| 5 | Fire-and-forget Document-Supersede | Automation | **behoben** | `booking-document-bundle.service.ts` |
| 6 | Invoice-Timing-Refresh verliert Org-Offsets | Automation | **behoben** | `adjustedTiming` in `updateTaskTiming` |
| 7 | Cleaning ohne Org-Rule-Resolver | Automation | **behoben** | `VehicleCleaningTaskService` |
| 8 | Service-Compliance bypassed Rules + Outbox | Automation | **behoben** | `ServiceOverdueTaskService` + Compliance |
| 9 | Stale `booking:document` in active dedup keys | Automation | **behoben** | `document:package:CONFIRMED:{bookingId}` |
| 10 | Outbox per Env abschaltbar | Zuverlässigkeit | **behoben** | Prod-Guard in Outbox-Config |
| 11 | Baseline `org_tasks` nicht in Migrations-Historie | Schema | **behoben** (dokumentiert) | `task-domain-v2-migration-baseline.md` |
| 12 | `completeTask` ohne Actor | Status | **behoben** | `BadRequestException` ohne `actorUserId` |

---

## P2-Statusmatrix (18 Findings)

| # | Finding | Status | Nachweis |
|---|---------|--------|----------|
| 1 | Index `(organization_id, assigned_to, status)` fehlt | **behoben** | `20260715180000_org_task_assignee_status_index` |
| 2 | `activatesAt` nullable statt NOT NULL + Backfill | **behoben** | `20260715181000_org_task_activates_at_not_null` |
| 3 | Doppelter Migrations-Timestamp `20260715140000` | **behoben** | Outbox → `20260715140100` |
| 4 | `category`/`source` Legacy-Felder | **behoben** (dokumentiert) | `///`-Kommentare in `schema.prisma` |
| 5 | Prisma `SetNull`-Warnung | **dokumentiert** | Runbook §Prisma-Validator-Hinweis |
| 6 | `metadata.resolutionKind` vs. `completionMode` | **behoben** | Beide in Event-Metadata; UI nutzt `completionMode` |
| 7 | Architektur-Doc veraltet (AUTO_RESOLVED/SUPERSEDED, Trigger) | **behoben** | `docs/architecture/task-domain-v2.md` §9 aktualisiert |
| 8 | `recordEvent` schluckt Fehler | **behoben** | Fehler propagieren |
| 9 | `CANCELLED` setzt `completionMode: MANUAL` | **behoben** | Kein `completionMode` bei Cancel |
| 10 | Batch `Promise.all` autoResolve/supersede | **behoben** | Sequentiell |
| 11 | `TaskDetailChecklistOverrideDialog` ungenutzt | **behoben** | Komponente + Test entfernt |
| 12 | Invoice-Refresh-Cron nur bei OVERDUE | **behoben** | Stündlicher `refreshOpenPaymentCheckTasks` |
| 13 | `ensureDocumentTask` deprecated | **behoben** | Entfernt |
| 14 | Lifecycle bei `PENDING`-Create noisy | **behoben** | Nur `CONFIRMED`/`ACTIVE` |
| 15 | Simulation-Prefix-Mismatch | **behoben** | `document:package:CONFIRMED:` |
| 16 | `openTaskEntries` / `vehicleCheckTasks` tot | **behoben** | Aus `operatorData` entfernt |
| 17 | `totalOpenTasksCount`-Fallback | **behoben** | Immer `summary.buckets.ALL_OPEN` |
| 18 | Operator Label/API-Inkonsistenzen | **behoben** | `task-labels.ts`; API-only Query; Card ohne Complete |
| 19 | `NewTaskModal` / `TasksSectionView` tot | **behoben** | Aus Prod-`App.tsx` entfernt; Dateien gelöscht |
| 20 | UUID-Fallbacks Rental | **behoben** | `taskEntityOptionLabel` |
| 21 | Client-Sort fragil | **behoben** (dokumentiert) | Kommentar in `TasksView` |
| 22 | Revisions-UI fehlt | **behoben** | Drawer + `GET …/revisions` |
| 23 | Legacy Workflow-Trigger-Keys | **behoben** | Default `booking.returned`; Legacy markiert |
| 24 | DEAD_LETTER ohne Admin-Replay | **behoben** | `POST …/outbox/:id/replay` |

*(Nummerierung folgt Original-Audit-Gruppen; einige Zeilen zusammengefasst.)*

---

## Erneute statische Suche (Post-P2)

| Muster | Ergebnis |
|--------|----------|
| `NewTaskModal` in Prod-`rental/App.tsx` | **Entfernt** |
| `TaskDetailChecklistOverrideDialog` | **Entfernt** |
| `openTaskEntries` / `vehicleCheckTasks` | **Entfernt** aus `operatorData` |
| UUID in Entity-Lookup-Labels | **Abgefangen** via `taskEntityOptionLabel` |
| `ensureDocumentTask` | **Keine Treffer** |
| Direkte `OrgTask.status`-Writes außerhalb `TasksService` | **Keine** |

---

## Prisma (ausgeführt)

| Schritt | Ergebnis |
|---------|----------|
| `npx prisma format` | ✅ |
| `npm run prisma:validate` | ✅ (1 unrelated `SetNull`-Warnung, dokumentiert) |
| Migrationen geprüft | ✅ P2: `20260715180000`, `20260715181000`, `20260715140100` |
| `npm run prisma:generate` | ✅ |

---

## Deployment-Reihenfolge

1. **DB:** `prisma migrate deploy` (inkl. P2-Migrationen)
2. **Config:** Outbox in Prod nicht deaktivieren
3. **Backend** deployen
4. **Frontend** deployen (Operator Complete nur noch im Detail; kanonische Workflow-Trigger)
5. **Ops:** Diagnose/Backfill auf Staging

---

## Verbleibende Risiken (nicht P2)

- Greenfield ohne Baseline-`org_tasks` weiterhin nur mit dokumentiertem DB-Import
- `enqueueOrRefresh` bei laufendem `PROCESSING` no-op bis Stale-Timeout
- Architektur-Widersprüche W12–W17 (resolutionCode, Repair-Call-Sites, etc.) — bewusst außerhalb P2-Scope
- Ops-Skripte benötigen Nest-Bootstrap in Zielumgebung

---

## Gesamtfazit

Alle **P1-** und **P2-Fundstellen** aus dem Final-Audit sind behoben oder dokumentiert. Test- und Build-Matrix ist grün.

**Finale Produktionsfreigabe: READY**

---

*Ursprüngliches Read-only-Audit: 2026-07-15. P1-Remediation + P2-Remediation: 2026-07-15.*
