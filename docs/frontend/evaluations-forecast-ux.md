# Evaluations Forecast UX (Prompt 45/54)

Transparent presentation of approved predictive forecasts on the **Auswertungen** page (`FinancialInsightsView`).

## Placement

```
Auswertungen (FinancialInsightsView)
├── InsightsCockpit          ← rule-based risks (Ist/Schätzung)
├── EvaluationsForecastsSection   ← NEW: statistical/rule forecasts
└── Financial Intelligence   ← observed invoice KPIs (Istwerte)
```

**Visual separation:**

| Layer | Label | Source |
|-------|-------|--------|
| Observed | Istwert | Invoices, bookings, utilization actuals |
| Estimate | Schätzung | Rule-based insights (InsightsCockpit) |
| Forecast | Prognose | Approved baseline/risk models (this section) |

## Components

| Component | Path | Role |
|-----------|------|------|
| `EvaluationsForecastsSection` | `evaluations-forecasts/EvaluationsForecastsSection.tsx` | Section shell, filter chips, view toggle, empty/loading states |
| `ForecastCard` | `evaluations-forecasts/ForecastCard.tsx` | Primary card: target, horizon, point estimate, uncertainty band, metadata |
| `ForecastTable` | `evaluations-forecasts/ForecastTable.tsx` | Accessible table alternative to cards |
| `ForecastUncertaintyBand` | `evaluations-forecasts/ForecastUncertaintyBand.tsx` | Visual interval (never hidden) |
| `ForecastDrilldown` | `evaluations-forecasts/ForecastDrilldown.tsx` | Mobile-friendly detail drawer/modal |
| `ForecastTermTooltip` | `evaluations-forecasts/ForecastTermTooltip.tsx` | Glossary tooltips (forecast, interval, sMAPE, …) |
| `useEvaluationsForecasts` | `hooks/useEvaluationsForecasts.ts` | Data fetch hook |
| `evaluations-forecast-view-model` | `lib/evaluations-forecast-view-model.ts` | Pure visibility, confidence, formatting logic |

## Required fields per forecast card

Each displayed forecast shows:

1. **Prognoseziel** — `targetLabel()` (e.g. Nachfrage, Umsatz, Wartungskosten)
2. **Horizont** — `horizonDays` + date range
3. **Zentrale Prognose** — `pointEstimate` / P50 / probability
4. **Unsicherheitsbereich** — interval low/high or P50–P90 band (always visible)
5. **Modelltyp** — `inferenceTierLabel` (Statistische Baseline / Regelbasierte Schätzung)
6. **Modellversion** — `modelVersion`
7. **Datenbasis** — e.g. issued invoices, feature snapshots
8. **Datenabdeckung** — `dataCoveragePercent`
9. **Letzter Berechnungszeitpunkt** — `generatedAt`
10. **Historische Güte** — backtest sMAPE when available
11. **Einflussfaktoren** — `explainability.topFactors` (top 2 on card, full list in drill-down)
12. **Confidence-Warnung** — banner when `low_confidence` or `partial_data`

## Display rules

### Release gate (hard)

Forecasts are **not rendered** unless model registry status is `APPROVED`.

Hidden states (counted in `hiddenCount`, explained in footer):

- `gate_not_passed` — DRAFT / SHADOW
- `model_disabled` — DISABLED / ROLLED_BACK
- `insufficient_history` — INSUFFICIENT_HISTORY / INSUFFICIENT_DATA
- `stale` — expired or older than 72h

### Visible with warning

- `partial_data` — coverage &lt; 60%
- `low_confidence` — FALLBACK tier or low coverage

### Copy rules

- Never use absolute certainty language
- Default disclaimer on every card
- Risk forecasts: separate probability and impact in drill-down
- Currency chip always visible (`EUR`)
- Scope chip: `fleet` (v1)

## Fallbacks

| State | UI |
|-------|-----|
| Loading | 3 skeleton cards |
| API error | Critical tone banner |
| No approved forecasts | `EmptyState` with hidden-count explanation |
| Partial section | Cards + footer “N weitere Prognosen nicht angezeigt” |

## Mobile & accessibility

- **Cards:** 1 column on mobile; compact padding when &gt;4 cards
- **Table:** horizontal scroll; preferred on desktop
- **Drill-down:** bottom sheet on mobile (`items-end`), centered modal on `sm+`
- **Toggle:** `aria-pressed` on view mode buttons
- **Tooltips:** `role="tooltip"` on glossary terms
- **Tables:** `<caption class="sr-only">`, semantic `<th scope="col">`
- **Numbers:** `tabular-nums` on all metrics
- **Dialogs:** `role="dialog"`, `aria-modal`, labelled title

## API wiring

```typescript
api.evaluationsForecasts.list(orgId)
api.evaluationsForecasts.listRisk(orgId)
api.evaluationsForecasts.listRegistry(orgId)
api.evaluationsForecasts.listBacktestResults(orgId)
```

## Tests

| File | Cases |
|------|-------|
| `evaluations-forecast-view-model.test.ts` | available, gate failed, low confidence, insufficient history, stale, disabled, section build, confidence |
| `EvaluationsForecastsSection.test.ts` | partial data, stale hidden, filter context EUR |

```bash
cd frontend && npx vitest run \
  src/rental/lib/evaluations-forecast-view-model.test.ts \
  src/rental/components/evaluations-forecasts/EvaluationsForecastsSection.test.ts
```

## Screenshots (reference layouts)

### Desktop — card grid

```
┌─────────────────────────────────────────────────────────────┐
│ Prognosen                    [Karten|Tabelle] [↻]           │
│ Scope: fleet · Währung: EUR · Gesamte Organisation        │
├──────────────┬──────────────┬──────────────┐                │
│ Nachfrage    │ Umsatz       │ Auslastung   │                │
│ 30 Tage      │ 30 Tage      │ 7 Tage       │                │
│ 120          │ € 45.200     │ 72.5 %       │                │
│ [===●=====]  │ P50–P90 band │ interval bar │                │
│ Confidence   │ Modell v1.0  │ sMAPE 18%    │                │
└──────────────┴──────────────┴──────────────┘                │
```

### Mobile — simplified card

```
┌──────────────────────┐
│ Prognose · Nachfrage │
│ 30 Tage              │
│ 120                  │
│ [uncertainty bar]    │
│ ⚠ Niedrige Confidence│
│ Details →            │
└──────────────────────┘
```

### Table view

| Ziel | Horizont | Prognose | Unsicherheit | Modell | Abdeckung | sMAPE |
|------|----------|----------|--------------|--------|-----------|-------|

### Empty — gate not passed

```
Keine freigegebenen Prognosen
3 Prognose(n) ausgeblendet — Release Gate nicht erfüllt…
```

## Related

- `docs/architecture/analytics/evaluations-forecast-backtesting.md` — gates & metrics
- `docs/architecture/analytics/evaluations-demand-revenue-utilization-forecast.md` — operational models
- `docs/architecture/analytics/evaluations-maintenance-failure-forecast.md` — risk models
