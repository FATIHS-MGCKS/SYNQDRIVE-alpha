# Evaluations Driver Analysis (Prompt 25/54)

Transparent **Ursachen- und Einflussanalyse** for Auswertungen strengths, weaknesses, and risks.

**Calculation version:** `driver-analysis-v1`

> **Disclaimer (always included):** Factors indicate statistical association within the filtered dataset. **Correlation is not causation.**

## API surfaces

| Endpoint | Output |
|----------|--------|
| `GET …/evaluations/analytics/summary` | `driverAnalysis` section + embedded `driverAnalysis` on each strength/weakness; `driverOutcomes` on `activeRisks` |
| `GET …/evaluations/analytics/driver-analysis` | Dedicated driver analysis payload |

All analyses use the **same filter contract** as the parent KPI (period, station, vehicle class, etc.).

## Supported analysis types

| Outcome kind | IDs / categories | Primary data sources |
|--------------|------------------|----------------------|
| **Strength** | `HIGH_UTILIZATION`, `REVENUE_GROWTH`, `STRONG_STATION`, … | Utilization breakdown, financial comparison |
| **Weakness** | `UNDERUTILIZATION`, `DECLINING_REVENUE`, `RISING_COSTS`, `HIGH_OVERDUE_RECEIVABLES`, `RECURRING_VEHICLE_BREAKDOWNS`, `STATION_BOTTLENECKS`, `POOR_DATA_QUALITY`, … | Station/class breakdown, vendor categories, aging buckets, vehicle downtime |
| **Risk** | `BUSINESS_RISK`, `REVENUE_LEAKAGE`, `COMPLIANCE`, `CRITICAL_INSIGHTS` | Insight group counts, affected entity aggregates |

## Output structure per analysis

Each `EvaluationsDriverAnalysis` includes (when data exists):

| Field | Description |
|-------|-------------|
| `primaryFactors` / `secondaryFactors` | Traceable influence factors with `dataSource` and `confidence` |
| `quantitativeContributions` | Measured shares (%, count, currency_minor, ms) |
| `affectedStations` / `affectedVehicleClasses` / `affectedVehicles` | Entity refs with metric values |
| `affectedTimePeriods` | Current + comparison window |
| `trend` | Direction (IMPROVING/WORSENING/STABLE/UNKNOWN) with confidence |
| `historicalComparison` | Current vs comparison period metrics |
| `possibleConfounders` | Documented limitations (seasonality, fleet size, external demand) |
| `dataQualityWarnings` | Overlapping bookings, stale insights, partial sections |

Evidence kinds on contributions: `OBSERVATION` (measured), `ESTIMATE` (partial attribution), `FORECAST` (reserved — not used in v1).

## Example results

**Underutilization weakness**

- Primary: Station Berlin at 22% utilization (−13pp vs org 35%)
- Secondary: 4 underutilized vehicles in scoped fleet
- Confounders: home-station grouping, no demand signal

**Rising costs weakness**

- Primary: WORKSHOP vendor category €50k (45% of expenses)
- Secondary: Higher cost per vehicle when fleet attribution &lt; fleet total
- Historical: expenses +22% vs comparison period

**High overdue receivables**

- Primary: Overdue aging bucket €10k (40% of open)
- Secondary: Current-not-overdue bucket €15k

## Module map

| File | Role |
|------|------|
| `evaluations-driver-analysis.contract.ts` | Types |
| `evaluations-driver-analysis.ts` | Pure attribution engine |
| `evaluations-driver-analysis.service.ts` | NestJS adapter |
| `evaluations-analytics-summary.service.ts` | Wires enrichment into summary |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

## Known limits

| Limit | Reason |
|-------|--------|
| No period-over-period utilization trend | Historical utilization time-series not persisted |
| Receivables aging = 2 buckets | Full aging (30/60/90d) requires extended invoice snapshot |
| Risk entity refs aggregated | Per-insight entity lists not loaded in summary path |
| FORECAST kind unused | No trend projection rules in v1 |
| No personal attribution | By design — org/station/vehicle/class only |
| Causation explicitly disclaimed | Association-only attribution per product rules |
