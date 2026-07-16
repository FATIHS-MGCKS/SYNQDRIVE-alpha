# Battery Health V2 — Frontend & E2E Test Coverage

Stand: 2026-07-16 (Prompt 75/78)  
Scope: Frontend-Unit-Tests, Komponenten-Tests und Playwright-E2E für Battery Health V2 — LV/HV-Surfaces, Query-Schicht, Label-Verträge, Responsive/Dark/Light.

## Ausführung

```bash
cd frontend

# Unit + Komponenten (Vitest)
npm run test:battery:v2

# Playwright E2E (Fleet → Zustand & Service → Fahrzeuge → Health-Detail → Battery)
npm run test:battery:v2:e2e

# Vollständige Verifikation: tsc + Vitest + E2E + Production-Build
npm run test:battery:v2:verify

# Teilbefehle
bash scripts/test/battery-health-v2-verify.sh typecheck
bash scripts/test/battery-health-v2-verify.sh unit
bash scripts/test/battery-health-v2-verify.sh e2e
bash scripts/test/battery-health-v2-verify.sh build
```

**Vitest-Muster:**  
`battery-lv-view-model`, `battery-hv-view-model`, `canonical-battery-ui.adapter`, `battery-health-v2-surfaces`, `battery-readiness-display`, `battery-alert-task-display`, `battery-health-query`, `battery-data-quality`, `battery-display`, `battery-health-detail-ui`, `components/battery`, `BatteryDataQualityBadge`, `BatteryConditionBars`

**E2E-Specs:** `e2e/battery-health-flow.spec.ts`, `e2e/battery-health-responsive.spec.ts`  
**Fixtures:** `src/rental/lib/battery-test-fixtures.ts`, `e2e/battery-health-fixtures.ts`

**Letzter Lauf (`npm run test:battery:v2:verify`):**

| Schritt | Ergebnis |
|---------|----------|
| `tsc -b` | grün |
| Vitest (`test:battery:v2`) | **21 Dateien / 78 Tests** — alle grün |
| Playwright E2E | **11 Tests** — alle grün |
| `npm run build` | grün |

---

## Abdeckungsmatrix (26 Bereiche)

| # | Bereich | Status | Primäre Testdateien / E2E |
|---|---------|--------|---------------------------|
| 1 | **Live LV/HV** | ✅ | `battery-lv-view-model.test.ts`, `battery-hv-view-model.test.ts`, `battery-health-v2-surfaces.test.ts`, E2E flow #1 (12.48 V / 12.62 V) |
| 2 | **Fetch vs. Observation Freshness** | ✅ | `battery-health-v2-surfaces.test.ts`, `battery-health-query/freshness.test.ts`, `BatteryLvDetailContent.test.tsx` (stale banner) |
| 3 | **Stale** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryLvDetailContent.test.tsx`, E2E flow #2 (`vor N Std.`) |
| 4 | **Proxy** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryLvDetailContent.test.tsx`, `battery-data-quality.utils.test.ts`, E2E flow #3 (`Proxy-Messung`) |
| 5 | **Experimental** | ✅ | `battery-health-v2-surfaces.test.ts` (start-proxy EXPERIMENTAL classification) |
| 6 | **MISSED** | ✅ | `battery-health-v2-surfaces.test.ts`, `canonical-battery-ui.adapter.test.ts` |
| 7 | **Unsupported** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryLvSummaryCard.test.tsx` |
| 8 | **Legacy Unverified** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryHvSummaryCard.test.tsx`, `battery-hv-view-model.test.ts` |
| 9 | **Qualifizierte Ruhespannung** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryLvSummaryCard.test.tsx` (VERIFIED + 12.62 V) |
| 10 | **Startproxy** | ✅ | `battery-lv-view-model.test.ts`, `battery-health-v2-surfaces.test.ts`, `BatteryLvDetailContent.test.tsx` |
| 11 | **LV Assessment** | ✅ | `battery-lv-view-model.test.ts`, `BatteryLvSummaryCard.test.tsx`, `BatteryConditionBars.test.tsx` |
| 12 | **Charging Session** | ✅ | `battery-hv-view-model.test.ts`, `battery-health-v2-surfaces.test.ts` (HV detail sessions) |
| 13 | **HV Capacity Shadow** | ✅ | `battery-health-v2-surfaces.test.ts`, `battery-hv-view-model.test.ts` |
| 14 | **Reference Capacity** | ✅ | `battery-health-v2-surfaces.test.ts`, `battery-hv-view-model.test.ts` |
| 15 | **Fehlender SOH** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryHvSummaryCard.test.tsx` (`Kein belastbarer SOH`) |
| 16 | **Provider-SOH** | ✅ | `battery-health-v2-surfaces.test.ts`, `BatteryHvSummaryCard.test.tsx` (`Provider-SOH` + 91 %) |
| 17 | **API-Partial-Error** | ✅ | `BatteryHealthQueryErrorPanel.test.tsx`, `useBatteryHealthQuery.test.ts`, E2E flow #5 |
| 18 | **Auto-Refetch** | ✅ | `useBatteryHealthQuery.test.ts` (live polling / stale reload), `freshness.test.ts` |
| 19 | **Cacheinvalidierung** | ✅ | `battery-health-query/cache.test.ts`, `mutation.test.ts`, `useBatteryHealthQuery.test.ts` |
| 20 | **Readiness** | ✅ | `battery-readiness-display.test.ts` |
| 21 | **Alerts/Tasks** | ✅ | `battery-alert-task-display.test.ts` |
| 22 | **Mobile** | ✅ | E2E responsive (`mobile-320`, `mobile-390`) + Drawer-Locator in Fixtures |
| 23 | **Dark/Light** | ✅ | E2E responsive (theme via `synqdrive-theme-preference`) |
| 24 | **Lange deutsche Texte** | ✅ | `BatteryLvDetailContent.test.tsx`, E2E responsive (kein Layoutbruch / Overflow-Check) |
| 25 | **Accessibility** | ✅ | `BatteryHealthQueryErrorPanel.test.tsx` (`role="alert"`), `BatteryConditionBars.test.tsx` (`role="img"` + `aria-label`) |
| 26 | **Keine falschen SOH-/Prozent-Labels** | ✅ | `battery-health-v2-surfaces.test.ts`, LV/HV-Komponententests, E2E flow #1/#4 (Regex-Guards) |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## Label-Vertrag (keine falschen SOH-Werte)

| Surface | Regel | Test |
|---------|-------|------|
| LV Summary/Detail | Primärlabel **„Geschätzter 12V-Batteriezustand“** — kein SOH | `battery-health-v2-surfaces.test.ts`, `BatteryLvSummaryCard.test.tsx`, E2E #1/#4 |
| HV ohne Gate | **„Kein belastbarer SOH“** — kein erfundener Prozentwert | `BatteryHvSummaryCard.test.tsx`, `battery-hv-view-model.test.ts` |
| HV Legacy Unverified | SOH-Prozent ausgeblendet | `battery-health-v2-surfaces.test.ts`, `BatteryHvSummaryCard.test.tsx` |
| HV Provider | Nur mit `sohSource: PROVIDER` und Label **„Provider-SOH“** | `BatteryHvSummaryCard.test.tsx` |
| Data-Quality-Chips | Kurzlabels aus i18n (`Proxy`, `Verpasst`, `Legacy`, …) | `BatteryDataQualityBadge.test.tsx`, `battery-data-quality.utils.test.ts` |

---

## E2E-Flows (Playwright)

| Spec | Szenario | Profil |
|------|----------|--------|
| flow #1 | LV-Zusammenfassung ohne SOH, Spannungen 12.48 V / 12.62 V | `ice-lv-stable` |
| flow #2 | Veraltete Observation — Alterskontext `vor N Std.` | `ice-lv-stale` |
| flow #3 | Proxy-Chip auf Battery-Tab | `ice-lv-proxy` |
| flow #4 | EV-Tab: 12V-Label, kein LV-SOH-Wording | `ev-hv-provider` |
| flow #5 | API 503 → Alert + „Erneut laden“ + Fetch-Zähler | `summary-error` |
| responsive ×6 | 320 / 390 / 1280 × light/dark, Overflow-Check | `ice-lv-stable` |

**Navigation:** Fleet → Status → Zustand & Service → Fahrzeuge → „Open health for BAT-ICE“ → Tab Battery  
**Mocks:** `e2e/battery-health-fixtures.ts` (fleet-map, rental-health, battery-health-summary/detail, Tasks/Vendors/Stations)

---

## Geteilte Fixtures

`src/rental/lib/battery-test-fixtures.ts` — wiederverwendbar in Vitest und Playwright-Mocks:

- `iceLvLiveStable`, `iceLvObservationStale`, `iceLvStartProxyProxy`, `iceLvStartProxyExperimental`
- `iceLvMissedRest`, `iceLvUnsupported`
- `evHvProviderSoh`, `evHvMissingSoh`, `evHvLegacyUnverified`, `evHvCapacityShadow`

---

## Produktionsfix aus Testarbeit (P75)

`useBatteryHealthQuery`: Bei Fetch-Fehlern wird `healthFetchedAt` gesetzt, damit kein Endlos-Refetch bei dauerhaftem API-Fehler entsteht (E2E #5 + stabile Error-UI).

---

## Dateiübersicht

| Typ | Pfad |
|-----|------|
| Fixtures | `src/rental/lib/battery-test-fixtures.ts` |
| View-Models | `battery-lv-view-model.test.ts`, `battery-hv-view-model.test.ts` |
| Adapter | `canonical-battery-ui.adapter.test.ts` |
| Surfaces / Label | `battery-health-v2-surfaces.test.ts` |
| Query | `battery-health-query/*.test.ts` |
| Utils | `battery-data-quality.utils.test.ts`, `battery-display.utils.test.ts`, `battery-health-detail-ui.test.ts` |
| Readiness / Alerts | `battery-readiness-display.test.ts`, `battery-alert-task-display.test.ts` |
| Komponenten | `components/battery/*.test.tsx`, `BatteryDataQualityBadge.test.tsx`, `BatteryConditionBars.test.tsx` |
| E2E | `e2e/battery-health-flow.spec.ts`, `e2e/battery-health-responsive.spec.ts`, `e2e/battery-health-fixtures.ts` |
| Verify | `scripts/test/battery-health-v2-verify.sh`, `package.json` scripts |
