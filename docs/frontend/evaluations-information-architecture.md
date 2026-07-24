# Auswertungen — Informationsarchitektur (Prompt 30/54)

## Ziel

Die Seite **Auswertungen** (`FinancialInsightsView` → `EvaluationsPage`) folgt einer festen, progressiven Informationshierarchie. Management-Übersicht oben, operative Details in einklappbaren Bereichen mit Anchor-Navigation.

## Sektionsreihenfolge

| # | Anchor-ID | Komponente | Datenquelle |
|---|-----------|------------|-------------|
| 1 | `auswertungen-filter` | `EvaluationsGlobalFiltersSection` | Filter-Bar + `summary.generatedAt` |
| 2 | `auswertungen-executive` | `EvaluationsExecutiveSummarySection` | `summary.executive` |
| 3 | `auswertungen-staerken-schwaechen` | `EvaluationsStrengthsWeaknessesSection` | `summary.strengths` / `weaknesses` |
| 4 | `auswertungen-risiken` | `EvaluationsRisksSection` | `summary.activeRisks` + Insights-Listen |
| 5 | `auswertungen-finanzen` | `EvaluationsFinanceSection` | `summary.financial` / `receivables` + Rechnungs-Drill-down |
| 6 | `auswertungen-flotte` | `EvaluationsFleetSection` | `summary.fleetUtilization` / `utilizationModel` |
| 7 | `auswertungen-kosten-ausfaelle` | `EvaluationsCostsDowntimeSection` | `summary.costs` / `downtime` / `costModel` |
| 8 | `auswertungen-massnahmen` | `EvaluationsActionsSection` | Insights-Empfehlungen + Misuse-Cases |
| 9 | `auswertungen-datenqualitaet` | `EvaluationsDataQualitySection` | `summary.dataQuality` / `lineage` |

Konstanten: `frontend/src/rental/components/evaluations/evaluations-page.constants.ts`

## Komponentenbaum

```
EvaluationsPage
├── PageHeader + CSV-Export
├── EvaluationsSectionNav (sticky anchor nav)
└── sections (EvaluationsSection shell)
    ├── EvaluationsGlobalFiltersSection
    ├── EvaluationsExecutiveSummarySection
    ├── EvaluationsStrengthsWeaknessesSection
    ├── EvaluationsRisksSection
    ├── EvaluationsFinanceSection
    │   └── EvaluationsFinanceInvoiceDetail (Rechnungen-API)
    ├── EvaluationsFleetSection
    ├── EvaluationsCostsDowntimeSection
    ├── EvaluationsActionsSection
    └── EvaluationsDataQualitySection
```

## UX-Prinzipien

- **Progressive Dichte:** Executive + Filter standardmäßig geöffnet; Finanzen, Flotte, Kosten, Maßnahmen, DQ standardmäßig eingeklappt (`defaultOpen={false}`).
- **Keine redundanten KPIs:** Die frühere `InsightsCockpit`-KPI-Zeile und die englische „Financial Intelligence“-KPI-Reihe entfallen. Executive Summary ist die einzige Management-KPI-Zeile oben.
- **Drill-downs:** Risiko-Insight-Listen, Rechnungsdiagramm/Top-Listen, Kosten-/Auslastungsmodell-Details.
- **Zustände:** Jede Sektion nutzt `EvaluationsSection` mit `loading` / `empty` / `error` / `partial` / `ready`.
- **i18n:** Alle sichtbaren Labels über `evaluations.ia.*` (de/en).

## APIs

| Bereich | Endpoint / Hook |
|---------|-----------------|
| Analytics-Zusammenfassung | `GET …/evaluations/analytics/summary` → `useEvaluationsAnalyticsSummary` |
| Insights-Listen | `useEvaluationsInsightsAnalytics` |
| Rechnungs-Drill-down | `api.invoices.list` → `useEvaluationsInvoiceData` |
| Misuse | `api.misuseCases.list` |

Keine Fake-Daten. Rechnungs-Drill-down ist bewusst getrennt von der Summary-API (operative Detailtiefe).

## Entfernte Redundanzen

- `InsightsCockpit` wird auf der Auswertungen-Seite nicht mehr gerendert (Datei bleibt für ggf. andere Kontexte).
- Doppelte KPI-Karten (Cockpit + Executive + Finance-Row) konsolidiert.
- Englisch/deutsche Mischung in der Finance-UI durch i18n ersetzt.

## Dateien

| Pfad | Rolle |
|------|-------|
| `EvaluationsPage.tsx` | Seiten-Composer |
| `FinancialInsightsView.tsx` | Thin wrapper |
| `evaluations/EvaluationsSection.tsx` | Sektions-Shell |
| `evaluations/EvaluationsSectionNav.tsx` | Anchor-Navigation |
| `evaluations/sections/*.tsx` | Fachliche Sektionen |
| `hooks/useEvaluationsInvoiceData.ts` | Rechnungs-Aggregation |
| `lib/evaluations-format.ts` | EUR/Pct-Formatierung |

## Tests

- `evaluations-page.constants.test.ts` — Sektionsreihenfolge und IDs
- `EvaluationsSection.test.tsx` — Surface states und ARIA
- `EvaluationsSectionNav.test.tsx` — Nav-Links und i18n
