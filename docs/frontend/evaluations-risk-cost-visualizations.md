# Auswertungen — Risiko-, Kosten- und Ausfallvisualisierungen (Prompt 33/54)

## Ziel

Fachlich sinnvolle Visualisierungen für **Risiken**, **Kosten** und **Ausfälle** — jede Chart beantwortet eine konkrete Management-Frage. Keine dekorativen Diagramme, keine 3D-Charts.

## Implementierte Charts

| Chart | Komponente | Sektion | Fachfrage |
|-------|------------|---------|-----------|
| **Risikomatrix** | `EvaluationsRiskMatrixChart` | Risiken | Welche Risikokategorien kombinieren hohe Eintrittswahrscheinlichkeit und hohe Auswirkung? |
| **Kosten-Waterfall** | `EvaluationsCostWaterfallChart` | Kosten & Ausfälle | Wie setzen sich die Betriebskosten der Periode zusammen? |
| **Pareto Kostentreiber** | `EvaluationsCostParetoChart` | Kosten & Ausfälle | Welche Stationen/Klassen verursachen den größten Kostenanteil? |
| **Kosten & Downtime Zeitreihe** | `EvaluationsCostDowntimeSeriesChart` | Kosten & Ausfälle | Entwickeln sich Kosten und Ausfallquote zwischen den Perioden? |
| **Forderungs-Aging** | `EvaluationsReceivablesAgingChart` | Finanzen | Wie verteilen sich offene Forderungen auf fällig und überfällig? |
| **Flottenausfalltrend** | `EvaluationsFleetFailureTrendChart` | Kosten & Ausfälle | Welche Ausfalltypen dominieren (Wartung, Blockiert, Reinigung)? |
| **Station-/Klassenvergleich** | `EvaluationsDimensionComparisonChart` | Kosten & Ausfälle | Wo konzentrieren sich Kosten oder Auslastung? |

Resolver: `shared/evaluations-insights/evaluations-risk-cost-visualizations.ts`  
Panel: `EvaluationsRiskCostVizPanel` (Varianten `risks` | `costs` | `finance`)

## Regeln (Umsetzung)

| Regel | Umsetzung |
|-------|-----------|
| Konkrete Frage | `question`-Zeile unter jedem Chart-Titel |
| Keine 3D / dekorativen Kreisdiagramme | 2D Bar/Line/Composed; Risikomatrix als Grid |
| Einheiten & Zeitraum sichtbar | `periodLabel`, `unitLabel` Chips im Chart-Header |
| Schätzungen kennzeichnen | `isEstimate`-Badge auf Waterfall, Pareto, Matrix, Dimension |
| Fehlende Daten als Lücken | `connectNulls={false}`; Vergleichs-Downtime = `null` |
| Tabellarische Alternative | `EvaluationsChartDataTable` unter jedem Chart (`sr-only` caption) |
| Verständliche Tooltips | Recharts Tooltip mit formatierten Währungs-/Prozentwerten |
| Drill-down | Risikomatrix-Links → `#auswertungen-risiken`; Filter-Chips Station/Klasse |
| Filterinteraktion | Dimension-Vergleich `onModeChange`; liest gefilterte `summary` |

## Architektur

```
EvaluationsRisksSection → EvaluationsRiskCostVizPanel (variant=risks)
EvaluationsFinanceSection → EvaluationsRiskCostVizPanel (variant=finance)
EvaluationsCostsDowntimeSection → EvaluationsRiskCostVizPanel (variant=costs)
    └── resolveRiskCostVisualizations()
        └── EvaluationsChartCard + Recharts / Risk Matrix Grid
            └── EvaluationsChartDataTable (Screenreader)
```

## Datenquellen

| Visualisierung | API-Felder |
|----------------|------------|
| Risikomatrix | `activeRisks`, `driverAnalysis.riskDrivers` |
| Waterfall | `costModel.totals` |
| Pareto | `costModel.metrics[].breakdown` (COST_BY_STATION / CLASS) |
| Kosten/Downtime Serie | `financial.expenses*`, `downtime.downtimePercent`, `utilizationModel.totals` |
| Aging | `receivables.open/overdue` |
| Flottenausfall | `downtime.maintenance/blocked/cleaning` |
| Dimension | `costModel` + `utilizationModel` breakdowns |

## Tests

| Ebene | Datei | Szenarien |
|-------|-------|-----------|
| Shared | `evaluations-risk-cost-visualizations.spec.ts` | Matrix, Waterfall, Pareto, Lücken, Aging, leer, lange Labels, Dimension |
| UI | `EvaluationsRiskCostVizPanel.test.tsx` | Risiken/Kosten/Finanzen, Empty, Tabs, Multi-Currency |

```bash
cd backend && NODE_OPTIONS='--max-old-space-size=8192' npx jest evaluations-risk-cost-visualizations.shared.spec.ts --runInBand
cd frontend && npm test -- EvaluationsRiskCostVizPanel
```

## Screenshots / Visual Regression

Nach `npm run dev` unter Auswertungen:

1. **Risiken** — Risikomatrix mit Kategorie-Badges + Tabelle
2. **Finanzen** — Forderungs-Aging horizontal
3. **Kosten & Ausfälle** — Waterfall + Pareto (2×2 Grid), Zeitreihe + Flottenausfall, Station/Klassen-Toggle

Empfohlen für CI: Snapshot der tabellarischen Alternativen (stabil) statt Recharts-SVG.

## i18n

Alle Texte unter `evaluations.viz.*` (de/en).
