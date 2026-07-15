# Task Domain V2 — Frontend & E2E Test Coverage

Stand: 2026-07-15  
Scope: Vitest (Unit/Contract) + Playwright (E2E) für Task Management V2 im Rental-Frontend und Operator-Bereich.

## Ausführung

```bash
cd frontend

# TypeScript
npx tsc -b

# Vitest (gesamte Frontend-Suite)
npm test

# Task-Domain-Fokus (Auswahl)
npm test -- src/lib/tasks src/rental/components/tasks src/operator/tasks src/operator/components/OperatorTodayTaskFeed.test.tsx src/operator/hooks/operatorTodayFeed.utils.test.ts src/operator/views/operatorTodayView.utils.test.ts

# Production Build
npm run build

# Playwright E2E (Task-Specs, Desktop)
npx playwright test tasks-flow.spec.ts tasks-responsive.spec.ts --project=desktop-1280

# Playwright E2E (alle Viewports)
npx playwright test tasks-flow.spec.ts tasks-responsive.spec.ts
```

**Frameworks:** Vitest + React Testing Library (statische Markup-/Contract-Tests) · Playwright (`frontend/e2e/`) · bestehende Mocks in `task-fixtures.ts`.

---

## Abdeckungsmatrix (9 Bereiche)

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **1. Globale Task Page** | ✅ Voll | `TasksView.contract.test.ts`, `TasksPageViews.test.tsx`, `TasksFilterPanel.test.tsx`, `tasksListState.test.ts`, `tasks-page.utils.test.ts`, `TasksKpiStrip.test.tsx`, `TasksBulkActionBar.test.tsx`, `tasks-flow.spec.ts` (Test 1) |
| **2. Task Detail** | ✅ Voll | `TaskDetailBody.test.tsx`, `taskDetailView.utils.test.ts`, `TaskDetailNotesActivitySection.test.tsx`, `taskTimeline.utils.test.ts`, `taskLinkedObjectNavigation.test.ts`, `tasks-flow.spec.ts` (Test 2) |
| **3. Abschluss** | ✅ Voll | `TaskDetailCompleteDialog.test.tsx`, `taskCompleteForm.utils.test.ts`, `taskDetailCompletion.utils.test.ts`, `TaskDetailChecklistOverrideDialog.test.tsx`, `tasks-flow.spec.ts` (Tests 3–9) |
| **4. Abschlussarten** | ✅ Voll | `TaskDetailCompletionSummary.test.tsx`, `taskDetailActions.utils.test.ts`, `tasks-flow.spec.ts` (Test 10) |
| **5. Operator Today** | ✅ Voll | `operatorTodayFeed.utils.test.ts`, `operatorTodayView.utils.test.ts`, `operatorTodayTasks.test.ts`, `OperatorTodayTaskFeed.test.tsx` |
| **6. Operator Cards** | ✅ Voll | `OperatorTaskCard.test.tsx`, `operatorTaskCard.utils.test.ts`, `operatorTaskDisplay.utils.test.ts` |
| **7. Manuelle Erstellung** | ✅ Voll | `ManualTaskCreateForm.test.tsx`, `task-create-form.utils.test.ts` |
| **8. Responsive & A11y** | ✅ Voll | `TaskDetailActionBar.test.tsx`, `tasks-responsive.spec.ts` |
| **9. Query Cache** | ✅ Voll | `invalidate.test.ts`, `taskQueryCache.contract.test.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## 1. Globale Task Management Page

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Buckets/Tabs (Heute, Offen, Erledigt, …) | Contract + E2E | `TasksPageViews.test.tsx`, `tasks-flow.spec.ts` |
| Suche & Filter | Unit + E2E | `TasksFilterPanel.test.tsx`, `tasksListState.test.ts`, `tasks-flow.spec.ts` |
| URL-State (`taskView`, Filter) | Contract | `TasksView.contract.test.ts` |
| Empty/Error/Loading | Unit | `TasksView.contract.test.ts`, `TasksKpiStrip.test.tsx` |
| Responsive Listenlayout | E2E | `tasks-responsive.spec.ts` |
| Bulk-Aktionen | Unit | `TasksBulkActionBar.test.tsx`, `taskBulkActions.utils.test.ts` |

---

## 2. Task Detail

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Ursache (Reason) | Unit + E2E | `TaskDetailBody.test.tsx`, `tasks-flow.spec.ts` |
| Nächster Schritt | Unit + E2E | `taskDetailView.utils.test.ts`, `tasks-flow.spec.ts` |
| Linked Objects (Labels, Klick) | Unit + E2E | `taskLinkedObjectNavigation.test.ts`, `tasks-flow.spec.ts` |
| Checkliste | Unit | `TaskDetailChecklistSection.test.tsx`, `taskDetailChecklist.utils.test.ts` |
| Timeline | Unit | `taskTimeline.utils.test.ts`, `TaskDetailNotesActivitySection.test.tsx` |
| Notizen | Unit | `TaskDetailNotesActivitySection.test.tsx` |
| Technische Details | Unit + E2E | `TaskDetailBody.test.tsx`, `tasks-flow.spec.ts` |
| Sticky Action Bar | Unit + E2E | `TaskDetailActionBar.test.tsx`, `tasks-responsive.spec.ts` |

**Produktfix für E2E:** Complete-/Cancel-Dialoge werden via `useTaskDetailActionsHost` **außerhalb** des `DetailDrawer` (Radix Sheet) gerendert, um Dialog-Nesting zu vermeiden (`GlobalTaskDetailPanel.tsx`, `VehicleTaskDetailDrawer.tsx`).

---

## 3. Abschluss

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Normale Fertigstellung | Unit + E2E | `taskCompleteForm.utils.test.ts`, `tasks-flow.spec.ts` (Test 4) |
| Offene Pflichtpunkte blockieren | Unit + E2E | `taskDetailCompletion.utils.test.ts`, `tasks-flow.spec.ts` (Test 5) |
| Resolution Note / Code | Unit + E2E | `TaskDetailCompleteDialog.test.tsx`, `tasks-flow.spec.ts` (Test 7) |
| Manager-Override | Unit + E2E | `TaskDetailChecklistOverrideDialog.test.tsx`, `taskDetailActions.utils.test.ts`, `tasks-flow.spec.ts` (Test 6) |
| API-Fehler im Dialog | Unit + E2E | `TaskDetailCompleteDialog.test.tsx`, `tasks-flow.spec.ts` (Test 8) |
| Doppelter Klick / Submit-Guard | E2E | `tasks-flow.spec.ts` (Test 9) |

**Verhalten:** `Erledigen` ist aktiv, wenn `overrideCompletion.enabled` — Dialog öffnet sich mit Override-Checkbox (`taskDetailActions.utils.ts`).

---

## 4. Abschlussarten

| Modus | Abdeckung | Datei |
|-------|-----------|-------|
| MANUAL | Unit + E2E | `TaskDetailCompletionSummary.test.tsx`, `tasks-flow.spec.ts` (Test 10) |
| AUTO_RESOLVED | Unit + E2E | `taskDetailActions.utils.test.ts`, `tasks-flow.spec.ts` (Test 10) |
| SUPERSEDED | Unit + E2E | `taskDetailActions.utils.test.ts`, `tasks-flow.spec.ts` (Test 10) |
| Legacy DONE (ohne `completionMode`) | E2E | `tasks-flow.spec.ts` (Test 10, Hinweis „älterer Logik“) |

---

## 5. Operator Today

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| NOW / TODAY / UPCOMING / PLANNED | Unit | `operatorTodayFeed.utils.test.ts`, `operatorTodayView.utils.test.ts` |
| UNASSIGNED (nur mit Berechtigung) | Unit | `operatorTodayView.utils.test.ts` |
| Keine zukünftige Rechnung unter Heute | Unit | `operatorTodayFeed.utils.test.ts` (`mergeOperatorTodayActionableTasks`) |
| Feed-Sektionen & Empty | Unit | `OperatorTodayTaskFeed.test.tsx` |
| Bucket-Zuordnung | Unit | `operatorTodayTasks.test.ts` |

---

## 6. Operator Cards

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Konkrete Dokumentnamen | Unit | `operatorTaskDisplay.utils.test.ts`, `OperatorTaskCard.test.tsx` |
| Keine UUIDs in UI | Unit + E2E | `operatorTaskCard.utils.test.ts`, `tasks-responsive.spec.ts` (`assertNoVisibleUuids`) |
| Keine doppelten „Dokumente“-Labels | Unit | `operatorTaskDisplay.utils.test.ts` |
| Korrekte Primäraktion | Unit | `OperatorTaskCard.test.tsx`, `operatorTaskCard.utils.test.ts` |

---

## 7. Manuelle Erstellung

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Alle Formularfelder persistiert | Unit | `ManualTaskCreateForm.test.tsx`, `task-create-form.utils.test.ts` |
| `estimatedDurationMinutes` | Unit | `ManualTaskCreateForm.test.tsx` |
| `initialNote` | Unit | `ManualTaskCreateForm.test.tsx` |
| Custom-Checkliste | Unit | `ManualTaskCreateForm.test.tsx`, `task-create-form.utils.test.ts` |
| `linkedObjects` / Entity-Links | Unit | `ManualTaskCreateForm.test.tsx`, `task-create-form.utils.test.ts` |

---

## 8. Responsive & Accessibility

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| iPhone-Breite (320–430) | E2E | `tasks-responsive.spec.ts` (Playwright-Projekte) |
| Tablet (768) | E2E | `tasks-responsive.spec.ts` |
| Desktop (1280) | E2E | `tasks-flow.spec.ts`, `tasks-responsive.spec.ts` |
| Dark/Light Theme | E2E | `tasks-responsive.spec.ts` |
| Fokus / Keyboard | E2E | `tasks-responsive.spec.ts` (Tab-Fokus) |
| Screenreader-Labels (Tabs, Suche) | Unit + E2E | `TasksPageViews.test.tsx`, `tasks-responsive.spec.ts` |
| Safe Areas (mobile sticky bar) | Unit + E2E | `TaskDetailActionBar.test.tsx`, `tasks-responsive.spec.ts` (Drawer-Footer auf allen Breiten) |
| Kein horizontaler Overflow | E2E | `tasks-responsive.spec.ts` (`assertNoHorizontalOverflow`) |

---

## 9. Query Cache

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Mutationen patchen Detail + Listen | Contract | `taskQueryCache.contract.test.ts` |
| Keine globale Invalidierung (kein Flackern) | Unit | `invalidate.test.ts` |
| Rollback bei Fehler | Contract | `taskQueryCache.contract.test.ts` |
| Invalidation-Events | Unit | `invalidate.test.ts` |

---

## E2E-Fixtures (`frontend/e2e/task-fixtures.ts`)

| Seed | Zweck |
|------|-------|
| `Reifen prüfen E2E` | OPEN → Start → Complete |
| `Ölwechsel E2E` | IN_PROGRESS, normaler Abschluss |
| `Buchung vorbereiten E2E` | Checkliste + Manager-Override |
| `Bremsen prüfen E2E` | BRAKE_CHECK, Resolution Note/Code |
| `Manuell erledigt` / `Automatisch aufgelöst` / `Ersetzt durch Nachfolger` / `Legacy DONE …` | Abschlussarten auf Erledigt-Tab |

**Hilfsfunktionen:** `openTasksPage`, `openTaskDetail`, `clickTaskAction`, `openCompleteDialog`, `submitCompleteDialog`, `setFailNextComplete`, `getCompleteAttempts`, `assertNoVisibleUuids`.

---

## Bekannte Grenzen

| Thema | Status |
|-------|--------|
| Operator Today als Full-Page E2E | Nur Unit/Contract — kein separater Operator-Playwright-Flow (bestehendes Muster: Rental-E2E + Operator-Vitest) |
| Manuelle Erstellung E2E | Unit-abgedeckt; kein dedizierter Create-Flow in Playwright (Formular benötigt umfangreiche Entity-Mocks) |
| Filter-Panel alle Kombinationen | Kernpfade in Unit; nicht jede Filterkombination in E2E |

---

## Änderungshistorie

| Datum | Änderung |
|-------|----------|
| 2026-07-15 | Initiale Frontend/E2E-Coverage-Dokumentation; Dialog-Lifting; E2E-Flows 1–10; Override-Erledigen-Aktivierung |
