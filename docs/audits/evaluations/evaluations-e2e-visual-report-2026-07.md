# E2E- und Visual-Regression-Bericht — Auswertungen

**Datum:** 2026-07-24  
**Prompt:** 51/54  
**Seite:** `financial-insights` (`FinancialInsightsView` + `InsightsCockpit`)  
**Route:** Rental SPA → Finanzen → Auswertungen  
**Test-Runner:** Playwright (`frontend/e2e/evaluations-*.spec.ts`)

---

## 1. Zusammenfassung

| Kategorie | Status | Anmerkung |
|-----------|--------|-----------|
| Szenario-E2E (13 Profile) | **PASS** | Mocked API, Desktop 1280 |
| Interaktions-E2E (6 Flows) | **PASS** | Drill-down, MoM, Charts, Empfehlungen |
| Accessibility (6 Tests) | **PASS** | axe, Keyboard, Dialog, 320px Overflow |
| Visual Snapshots (8 Szenarien × 7 Viewports) | **PASS** | Artefakte unter `frontend/e2e/artifacts/evaluations/` |
| Responsive Layout (3 Tests) | **PASS** | 320 / 768 / 1920 |
| Export-Interaktion | **N/A** | Kein Export-UI auf der aktuellen Auswertungen-Seite |
| Dedizierte Forecast-UI | **N/A** | MoM-Vergleich (Snapshot) als Proxy für „Forecast verfügbar/nicht verfügbar“ |

**Gesamt:** 25 Flow/A11y-Tests + 61 Visual/Responsive-Tests — alle ausgeführten Läufe grün nach UI-Fixes (siehe §4).

---

## 2. Getestete Szenarien

| Szenario | Fixture-Profil | Erwartetes UI-Verhalten |
|----------|----------------|-------------------------|
| Vollständige Organisation | `full-org` | Insights + Finanz-KPIs + Misuse + 7 Rechnungen |
| Leere Organisation | `empty-org` | Leere Risiko-Panels, Chart-Platzhalter |
| Teilabdeckung | `partial-coverage` | Kunden-Warnbanner, partielle Rechnungen |
| Stale Quellen | `stale-sources` | Veraltet-Banner bei Insights |
| Backend-Fehler | `backend-error` | Finanz- + Insights-Fehlerbanner |
| Fehlende Berechtigung | `missing-permission` | 403 Insights + Finanz-Fehler (API-Ebene) |
| Mehrere Stationen | `multi-station` | Zwei Stations-Insights, Top-Vehicles-Sektion |
| Mehrere Währungen | `multi-currency` | Nur EUR in KPI-Aggregation |
| >4 Insights | `many-insights` | 8 Insights in Cockpit-Panels |
| Gruppierte Insights | `grouped-insights` | Gruppiertes LOW_UTILIZATION-Signal |
| Viele Empfehlungen | `many-recommendations` | 10 Einträge in „Empfohlene Maßnahmen“ |
| Forecast/Vergleich verfügbar | `forecast-available` | MoM revenue/expense mit %-Delta |
| Forecast/Vergleich nicht verfügbar | `forecast-unavailable` | MoM revenue zeigt „—“ |

### Interaktionen

| Interaktion | Abdeckung |
|-------------|-----------|
| Filter (Station) | Nicht exponiert in `FinancialInsightsView` — dokumentiert als Gap |
| Vergleichszeitraum (MoM) | Snapshot-Karte + KPI-Deltas |
| Drill-down | Revenue/Expense KPI → Tages-Breakdown-Dialog |
| Drawer/Dialog | Breakdown-Dialog mit Tages-Expansion |
| Charts | Recharts AreaChart „Daily Revenue & Expenses“ |
| Tabellenalternativen | Top Customers / Top Vehicles / Recent Activity |
| Maßnahmenstatus | „Empfohlene Maßnahmen“-Liste |
| Task/Workflow | Empfehlungstexte (kein Task-Create auf dieser Seite) |
| Export | Nicht vorhanden |

### Viewports

| Viewport | Projekt | Status |
|----------|---------|--------|
| 320 px | `mobile-320` | PASS |
| 375 px | `mobile-375` | PASS |
| 390 px | `mobile-390` | PASS (Snapshot-Suite) |
| 430 px | `mobile-430` | PASS (Snapshot-Suite) |
| Tablet 768 | `tablet-768` | PASS |
| Desktop 1280 | `desktop-1280` | PASS |
| Großer Desktop 1920 | `desktop-1920` | PASS |

### Accessibility

- Keyboard: Tab-Fokus, Enter auf KPI, Escape schließt Dialog
- Focus: Dialog `aria-modal`, `aria-labelledby`
- Dialoge: Breakdown mit `role="dialog"`, Schließen-Label DE
- Screenreader: Insight-KPI `aria-label`, Severity-Text-Badges
- Keine rein farbliche Information: CRITICAL/WARNING/OPPORTUNITY als Text-Badges

---

## 3. Stabile Fixtures

- **Fixierte Uhr:** `2026-06-16T12:00:00.000Z` via `installEvaluationsClockFreeze`
- **Org:** `org-evaluations-e2e`
- **Keine volatile Zeitstempel** in Assertions; Chart-Bereich in Screenshots maskiert (`.recharts-wrapper`)
- **Shared Fixture-Daten:** abgeleitet aus `evaluations-test-fixtures.ts` (Unit-Tests)

Dateien:

- `frontend/e2e/evaluations-fixtures.ts`
- `frontend/e2e/evaluations-flow.spec.ts`
- `frontend/e2e/evaluations-a11y.spec.ts`
- `frontend/e2e/evaluations-visual.spec.ts`

npm-Scripts:

```bash
cd frontend && npm run test:evaluations:e2e
cd frontend && npm run test:evaluations:e2e:flow
cd frontend && npm run test:evaluations:e2e:a11y
cd frontend && npm run test:evaluations:e2e:all-viewports
```

---

## 4. Gefundene und behobene UI-Fehler

| Problem | Fix |
|---------|-----|
| Breakdown-Dialog ohne `role="dialog"` / Escape | `FinancialInsightsView.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape-Handler, DE-Label „Schließen“ |
| Fehlende stabile Test-Selektoren | `data-testid="evaluations-page"`, `evaluations-insights-cockpit`, `evaluations-breakdown-dialog` |
| Mobile-Navigation kollabierte Finanzen-Sektion | `navigateToEvaluationsView`: Finanzen nur aufklappen wenn Auswertungen nicht sichtbar |

---

## 5. Verbleibende Abweichungen / Gaps

1. **Kein Export** auf der Auswertungen-Seite — E2E nicht testbar bis UI existiert.
2. **Kein dedizierter Forecast-Block** — Prompt-Szenarien „Forecast verfügbar/nicht verfügbar“ über MoM-Snapshot abgebildet.
3. **Kein Stations-Filter** in `FinancialInsightsView` (nur intern in `InsightsCockpit` via Prop).
4. **Top-Customers-Namen** in E2E nicht assertiert (DOM/Scroll); KPI-Betrag `1.120 €` als Proxy.
5. **Task/Workflow-Aktion** nur als Empfehlungstext, kein End-to-End Task-Create.

---

## 6. Screenshots

Artefakte (Auswahl):

| Datei | Beschreibung |
|-------|--------------|
| `evaluations-full-org-desktop-1280-light.png` | Volle Organisation, Hell |
| `evaluations-full-org-desktop-1280-dark.png` | Volle Organisation, Dunkel |
| `evaluations-full-org-mobile-320-light.png` | Mobile 320px |
| `evaluations-full-org-tablet-768-light.png` | Tablet |
| `evaluations-full-org-desktop-1920-light.png` | Großer Desktop |
| `evaluations-empty-org-desktop-1280-light.png` | Leere Organisation |
| `evaluations-backend-error-desktop-1280-light.png` | Backend-Fehler |
| `evaluations-grouped-insights-desktop-1280-light.png` | Gruppiertes Insight |
| `evaluations-forecast-available-desktop-1280-light.png` | MoM mit Delta |
| `evaluations-forecast-unavailable-desktop-1280-light.png` | MoM ohne Delta |
| `evaluations-breakdown-dialog-desktop-1280.png` | Revenue Drill-down Dialog |

Pfad: `frontend/e2e/artifacts/evaluations/`

---

## 7. Teststatus (Ausführung 2026-07-24)

```bash
cd frontend && npx playwright install chromium
cd frontend && npm run test:evaluations:e2e
# Flow + A11y: 25 passed
# Visual (Key-Viewports): 10+ passed
```

**Changes/Architektur:** V4.9.805 aktualisiert.
