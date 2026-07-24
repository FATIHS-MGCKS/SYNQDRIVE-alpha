# Evaluations Weakness Detection (Prompt 24/54)

Rule-based, traceable detection of **Unternehmensschwächen** and improvement potentials for Auswertungen.

**Calculation version:** `weakness-detection-v1`

## API surfaces

| Endpoint | Section |
|----------|---------|
| `GET /organizations/:orgId/evaluations/analytics/summary` | `weaknesses` |
| `GET /organizations/:orgId/evaluations/analytics/weaknesses` | Dedicated weakness detection payload |

## Detected weakness IDs

| ID | Category | Typical comparison |
|----|----------|------------------|
| `UNDERUTILIZATION` | UTILIZATION | Org target (default &lt; 40%) |
| `DECLINING_REVENUE` | REVENUE | Historical period (default ≤ −5%) |
| `RISING_COSTS` | COST | Historical period (default ≥ +10%) |
| `LOW_MARGIN` | MARGIN | Org target (default &lt; 10%) |
| `HIGH_OVERDUE_RECEIVABLES` | RECEIVABLES | Org target (&gt; 5% overdue rate) |
| `HIGH_CANCELLATION_RATE` | BOOKINGS | Org target (&gt; 10%) |
| `HIGH_NO_SHOW_RATE` | BOOKINGS | Org target (&gt; 5%) |
| `LONG_TURNAROUND` | OPERATIONS | Org target (&gt; 48h avg) |
| `RECURRING_VEHICLE_BREAKDOWNS` | FLEET_HEALTH | Observed per-vehicle downtime share |
| `HIGH_DAMAGE_RATE` | DAMAGE | Org target (&gt; 5% of revenue) |
| `STATION_BOTTLENECKS` | CAPACITY | Observed low spare capacity |
| `COMPLIANCE_RISKS` | COMPLIANCE | Active TÜV/BOKraft/HM insight groups |
| `POOR_DATA_QUALITY` | DATA_QUALITY | Partial/unavailable/stale/overlapping data |

Each weakness includes: `id`, `category`, `severity`, `underlyingKpis`, `quantitativeDeviation` (with `kind`: OBSERVATION | ESTIMATE | FORECAST), `period`, `comparisonBasis`, `affectedEntities`, `financialImpact`, `confidence`, `dataCoverage`, `recommendedNextAnalysis`, `priority`.

## Severity model

| Severity | When used |
|----------|-----------|
| `INFO` | Minor deviation; monitor only |
| `WARNING` | Meaningful deviation vs target or history |
| `CRITICAL` | Large deviation, high exposure, or many affected entities |

Not every warning is critical — e.g. overdue receivables within target rate may surface as `INFO`.

## Deduplication

1. **Per-id + dimension:** `id:dimensionKey` uniqueness
2. **Conflict groups** — only the most severe kept:
   - `booking-loss`: `HIGH_CANCELLATION_RATE` vs `HIGH_NO_SHOW_RATE`
   - `fleet-downtime`: `RECURRING_VEHICLE_BREAKDOWNS` vs `LONG_TURNAROUND`
   - `utilization-pressure`: `UNDERUTILIZATION`

Prioritization sort: severity (CRITICAL → INFO), then `priority` score (incorporates financial impact).

## Data quality rules

- **Business weaknesses suppressed** when `dataQuality.overallStatus === ERROR`, unavailable sections, or overlapping bookings
- **`POOR_DATA_QUALITY` always allowed** — data gaps are not reported as revenue/utilization deterioration
- Observation vs estimate vs forecast is explicit on `quantitativeDeviation.kind` and `financialImpact.kind`

## Minimum data

| Rule | Minimum |
|------|---------|
| `UNDERUTILIZATION` | ≥ 3 vehicles |
| `DECLINING_REVENUE` / `RISING_COSTS` | Comparison-period baseline &gt; 0 |
| `HIGH_CANCELLATION_RATE` / `HIGH_NO_SHOW_RATE` | ≥ 10 booking outcomes |
| `LONG_TURNAROUND` | ≥ 3 turnaround gaps |
| `RECURRING_VEHICLE_BREAKDOWNS` | ≥ 2 vehicles above downtime share threshold (15%) |

## Module map

| File | Role |
|------|------|
| `evaluations-weakness-detection.contract.ts` | Types, targets, snapshot |
| `evaluations-weakness-detection.ts` | `detectOrganizationalWeaknesses`, dedupe, prioritize |
| `evaluations-weakness-detection.service.ts` | NestJS adapter |
| `insights-analytics.ts` | `complianceRisks` count for COMPLIANCE_RISKS rule |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

## Known data gaps

| Gap | Reason |
|-----|--------|
| Underutilization revenue impact | No demand forecast — labeled ESTIMATE, amount null |
| Station bottleneck revenue at risk | Not quantified in v1 |
| No-show lost revenue | Partially via insight exposure estimate only |
| FORECAST kind | Reserved; no trend projection rules in v1 |
| Compliance exposure | Aggregated insight exposure includes non-compliance insights |
