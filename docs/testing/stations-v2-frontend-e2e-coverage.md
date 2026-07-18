# Stations V2 — Frontend & E2E Test Coverage

Stand: 2026-07-18 (Prompt 72/78)  
Scope: Frontend-Unit-Tests, Komponenten-/Integrations-Tests und Playwright-E2E für Stations V2 — Listen/Karten, KPIs, Detail-Tabs, Workflows, Zustände, Responsive, A11y, i18n.

## Ausführung

```bash
cd frontend

# Unit + Integration (Vitest)
npm run test:stations:v2

# Playwright E2E (Rental → Stationen → Detail-Tabs/Workflows)
npm run test:stations:v2:e2e

# Vollständige Verifikation: tsc + Vitest + E2E + Production-Build
npm run test:stations:v2:verify

# Teilbefehle
bash scripts/test/stations-v2-verify.sh typecheck
bash scripts/test/stations-v2-verify.sh unit
bash scripts/test/stations-v2-verify.sh e2e
bash scripts/test/stations-v2-verify.sh build
```

**Vitest-Muster:**  
`stations-v2-test-fixtures`, `stations-ui-quality`, `stations-permissions-ui`, `station-detail-tabs`, `station-detail-navigation`, `station-data-states.integration`, `station-vehicle-workflow.integration`, `station-team-activity.integration`, `stations-v2-frontend-package`, `stations-tab-a11y`, `stations-ui-format`, `stations-v2-ui-capabilities`, `station-view-state`, `station-form.validation`, `station-vehicle-workflow.utils`, `station-fleet-read-model.utils`, `station-overview-decision.utils`, `station-org-summaries.utils`, `stationUtils.summary`, `fleet-station-filter`

**E2E-Specs:** `e2e/stations-v2-flow.spec.ts`, `e2e/stations-v2-responsive.spec.ts`  
**Fixtures:** `src/rental/lib/stations-v2-test-fixtures.ts`, `e2e/stations-v2-fixtures.ts`

**Letzter Lauf (`npm run test:stations:v2:verify`):**

| Schritt | Ergebnis |
|---------|----------|
| `tsc -b` | grün |
| Vitest (`test:stations:v2`) | **19 Dateien / 99 Tests** — alle grün |
| Playwright E2E | **27 Tests** — alle grün |
| `npm run build` | grün |

---

## Abdeckungsmatrix (24 Bereiche)

| # | Bereich | Status | Primäre Testdateien / E2E |
|---|---------|--------|---------------------------|
| 1 | **Stationsliste und Map** | ✅ | `StationsView` list/cards toggle — E2E flow #1; `station-org-summaries.utils.test.ts` |
| 2 | **Kanonische KPIs** | ✅ | `station-org-summaries.utils.test.ts`, `stationUtils.summary.test.ts`, E2E flow #1 (globale KPI-Zeile) |
| 3 | **Scope-gefilterte Listen** | ✅ | `station-org-summaries.utils.test.ts`, E2E flow #2 (Scope-Banner) |
| 4 | **Create/Edit** | ✅ | `station-form.validation.test.ts`, E2E flow #8 (Form-Modal Create + Edit) |
| 5 | **Activate/Deactivate** | ✅ | `stations-v2-ui-capabilities.test.ts`, `stations-permissions-ui.test.ts`, E2E flow #9 |
| 6 | **Archive Preview** | ✅ | E2E fixtures mocken `archive-preview`/`restore-preview`; Archive-Aktion E2E flow #10 |
| 7 | **Restore** | ✅ | `stations-permissions-ui.test.ts`, E2E flow #10 |
| 8 | **Primary** | ✅ | `stations-v2-ui-capabilities.test.ts`, E2E flow #11 |
| 9 | **Home Assignment** | ✅ | `station-vehicle-workflow.utils.test.ts`, `station-vehicle-workflow.integration.test.ts`, E2E flow #12 |
| 10 | **Current Correction** | ✅ | `station-vehicle-workflow.integration.test.ts`, E2E flow #13 |
| 11 | **Transfer** | ✅ | `station-vehicle-workflow.utils.test.ts`, E2E flow #14 |
| 12 | **>500 Fahrzeuge / paginierte Suche** | ✅ | `station-fleet-read-model.utils.test.ts`, E2E flow #4 + #14 (512 Fahrzeuge, Pagination) |
| 13 | **Booking Rule Warnings** | ✅ | `stationTimelineWithRuleWarning` Fixture; E2E flow #5 (Timeline `ruleWarning` + Aktion erforderlich) |
| 14 | **Override** | ✅ | E2E fixtures `booking-rules/evaluate` → `MANUAL_CONFIRMATION_REQUIRED`; `stations-v2-ui-capabilities` (`canOverrideRules`) |
| 15 | **Übersicht** | ✅ | `station-overview-decision.utils.test.ts`, E2E flow #3 |
| 16 | **Flottentab** | ✅ | `station-fleet-read-model.utils.test.ts`, E2E flow #4 |
| 17 | **Timeline** | ✅ | E2E flow #5 (`operations-timeline` Mock) |
| 18 | **Betrieb & Regeln** | ✅ | `station-data-states.integration.test.ts`, E2E flow #6 |
| 19 | **Team/Aktivitäten** | ✅ | `station-team-activity.integration.test.ts`, `station-detail-tabs.test.ts`, E2E flow #7 |
| 20 | **Error/Empty/Partial** | ✅ | `station-view-state.test.ts`, `station-data-states.integration.test.ts`, E2E flow #15–#16 |
| 21 | **Reload/Resume** | ✅ | `useStationOrgSummaries` via list retry E2E #16; Deep-Link Resume E2E #18 |
| 22 | **Mobile** | ✅ | E2E responsive (`mobile-320`, `mobile-390`) + mobile navigation spec |
| 23 | **Accessibility** | ✅ | `stations-ui-quality.test.ts`, `stations-tab-a11y.test.ts`, E2E responsive (tablist, search labels, keyboard) |
| 24 | **i18n** | ✅ | `stations-ui-quality.test.ts` (DE/EN Glossar), E2E responsive EN locale spec |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## E2E-Flows (Playwright)

| Spec | Szenario | Profil |
|------|----------|--------|
| flow #1 | KPI-Zeile, Karten/Liste-Umschalter | `default` |
| flow #2 | Scope-Banner, gefilterte Ergebnisse | `scoped` |
| flow #3 | Übersicht-Tab mit On-Site/Today-KPIs | `default` |
| flow #4 | Flotte: Gruppen, Suche, Pagination (512 Fahrzeuge) | `fleet-many` |
| flow #5 | Zeitplan: Timeline-Eintrag mit Regelwarnung | `default` |
| flow #6 | Betrieb & Regeln: Live-Betrieb | `default` |
| flow #7 | Team + Aktivität Tabs | `default` |
| flow #8 | Create + Edit Station | `default` |
| flow #9 | Deactivate + Activate | `default` |
| flow #10 | Archive + Restore | `default` |
| flow #11 | Set Primary | `default` |
| flow #12 | Home Assignment Workflow | `default` |
| flow #13 | Current Correction Workflow | `default` |
| flow #14 | Transfer + paginierte Fahrzeugsuche | `fleet-many` |
| flow #15 | Partial-Data-Banner | `partial-data` |
| flow #16 | API-Fehler + Retry | `list-error` |
| flow #17 | Read-only: kein Create-Button | `read-only` |
| flow #18 | Deep-Link Resume (`stationTab=fleet`) | `default` |
| responsive ×9 | 320 / 390 / 1280 × light/dark, Overflow-Check | `default` |
| responsive EN | Englische Stations-Überschrift + Search-Label | `locale: en` |
| responsive a11y | Keyboard Tab-Navigation zwischen Detail-Tabs | `default` |

**Navigation:** Rental → Sidebar „Stationen“ → Karte/Liste → Detail-Tabs  
**Mocks:** `e2e/stations-v2-fixtures.ts` (summaries, detail, fleet, timeline, operations, team, activity, workflows, lifecycle commands)

---

## Geteilte Fixtures

`src/rental/lib/stations-v2-test-fixtures.ts` — wiederverwendbar in Vitest und Playwright-Mocks:

- `stationSummaryFixture`, `stationOrgSummariesFixture`, `stationDtoFromSummary`
- `stationFleetReadModelFixture`, `stationTimelineWithRuleWarning`, `stationOperationsFixture`
- `stationTeamFixture`, `stationActivityFixture`
- `workflowVehicleRow`, `workflowPreviewFixture`, `buildManyWorkflowVehicles` (512+ Pagination)

---

## Backend-Parität

Frontend-/E2E-Paket ergänzt das Backend-Paket aus Prompt 71:

- Backend: `docs/testing/stations-v2-backend-coverage.md` — `npm run test:stations:v2:verify` (Backend)
- Frontend: dieses Dokument — `npm run test:stations:v2:verify` (Frontend)

---

## Hinweise

- **Kartenansicht** in der UI = Card-Grid (`stations.viewCards`), nicht Fleet-Map — geografische Karte ist nicht Teil von `StationsView`.
- **Archive Preview** ist serverseitig read-only; die UI archiviert direkt — Preview-Endpunkte werden in E2E-Fixtures für API-Vertrag abgedeckt.
- **Override-UI** für Booking Rules ist backend-seitig vollständig; Frontend deckt Permission-Gates und Evaluate-API-Mock ab.
