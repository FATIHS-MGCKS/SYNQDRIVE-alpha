# Auswertungen — Executive KPI Strip (Prompt 31/54)

## Ziel

Professioneller **Executive KPI Strip** oben im Bereich „Executive Summary“. Maximal **8 priorisierte Kennzahlen** aus der **Metric Registry** — keine verstreuten Hardcodings in UI-Komponenten.

## Kennzahlen (Registry-Priorität)

| Prio | ID | Kennzahl | Quelle | Vergleich |
|------|-----|----------|--------|-----------|
| 10 | `revenue_mtd` | Umsatz (Periode) | `financial.revenueMtdMinor` | Vorperiode + Δ% |
| 20 | `paid_revenue_mtd` | Zahlungseingänge | `financial.paidRevenueMtdMinor` | vs. ausgestellter Umsatz |
| 30 | `contribution_margin` | Deckungsbeitrag | `financial.netMarginMinor` | Vorperiode-Marge + Δ% |
| 40 | `fleet_utilization` | Auslastung | `fleetUtilization.utilizationPercent` | — (kontextuell) |
| 50 | `fleet_availability` | Flottenverfügbarkeit | `vehicleAvailability.readyPercent` | — |
| 60 | `unplanned_downtime` | Ungeplante Downtime | `downtime.downtimePercent` | — |
| 70 | `financial_risk_exposure` | Erwartetes Finanzrisiko | `activeRisks.estimatedExposureMinor` | Schätzung |
| 80 | `overdue_receivables` | Überfällige Forderungen | `receivables.overdueAmountMinor` | — |

Registry: `shared/evaluations-insights/evaluations-executive-kpi-registry.ts`

Prioritäten überschreibbar via `getExecutiveKpiRegistry({ revenue_mtd: 5, … })`.

## Karteninhalt

Jede Karte (`EvaluationsExecutiveKpiCard`) zeigt:

- Titel + **Definitionstooltip** (i18n `evaluations.executiveKpi.{id}.definition`)
- Wert + Einheit (über `EvaluationsMetricValue` / Registry-Format)
- Zeitraum (`summary.period.label`)
- Vergleichswert (Vorperiode oder fachlicher Referenzwert)
- Absolute und/oder prozentuale Veränderung
- **Status** (`EvaluationsMetricStateBadge` — partial/stale/error/null)
- **Datenabdeckung** (Lineage `dataCoverage.percent`)
- **Freshness** (Lineage `freshness.state`)
- Badge **Schätzung** / **Prognose** wo zutreffend
- **Drill-down**-Link zum passenden Seitenanker

## Delta-Färbung (fachlicher Kontext)

Kein blindes Grün/Rot nach Vorzeichen. `deltaSemantics` in der Registry:

| Semantik | Verhalten |
|----------|-----------|
| `higher_is_better` | Positives Δ → günstig |
| `lower_is_better` | Negatives Δ → günstig (z. B. Downtime, überfällig) |
| `contextual` | Neutrale Darstellung (Auslastung) |
| `neutral` | Keine Bewertungsfarbe |

## Layout / Mobile

- **Desktop:** 2×4 Grid (`md:grid-cols-2`, `xl:grid-cols-4`)
- **Mobile:** horizontaler Scroll mit `snap-x`, `min-width: 280px` pro Karte — keine 8 Mini-Karten in einer Zeile
- Mindestschrift: Titel ~11.5px, Wert ~22px

## Architektur

```
EvaluationsExecutiveSummarySection
└── EvaluationsExecutiveKpiStrip
    └── resolveExecutiveKpiStrip()  ← shared registry
        └── EvaluationsExecutiveKpiCard × n
```

## Tests

| Ebene | Datei |
|-------|-------|
| Registry/Resolver | `evaluations-executive-kpi-registry.spec.ts` |
| UI-Struktur | `EvaluationsExecutiveKpiStrip.test.tsx` |

Abgedeckte Szenarien: vollständige Daten, partial, stale, error, echter Nullwert, lange Währungswerte, Mobile-Markup.

## i18n

Alle sichtbaren Texte unter `evaluations.executiveKpi.*` (de/en). Keine Sprachmischung in der UI.
