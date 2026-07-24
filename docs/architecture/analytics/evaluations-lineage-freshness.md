# Evaluations Lineage and Freshness (Prompt 27/54)

Data **provenance** and **freshness** metadata for all relevant Auswertungen analytics results.

**Calculation version:** `lineage-v1`

## API surfaces

| Endpoint | Output |
|----------|--------|
| `GET …/evaluations/analytics/summary` | `lineage` section + per-section `lineage` on envelopes; metric-level `lineage` on cost/utilization KPIs |
| `GET …/evaluations/analytics/lineage` | Dedicated lineage payload |

Same filter contract as parent KPIs. Tenant-scoped — no cross-org data.

## Per-metric / per-analysis fields

| Field | Description |
|-------|-------------|
| `dataSources` | User-facing source labels (no credentials) |
| `oldestIncludedRecordAt` | Oldest record in scope |
| `newestIncludedRecordAt` | Newest record in scope |
| `lastSuccessfulImportAt` | Last successful data import for source |
| `lastSuccessfulBackgroundJobAt` | Last successful background job (e.g. insights scheduler) |
| `calculatedAt` | When this metric was computed |
| `calculationVersion` | Engine version for reproducibility |
| `excludedRecordCount` | Records excluded from metric |
| `exclusionReasons` | Structured exclusion codes + human-readable reasons |
| `dataCoverage` | Percent + included/eligible counts |
| `freshness` | FRESH / DELAYED / STALE / UNKNOWN / FAILED + documented threshold |
| `sourceErrors` | Errors affecting this metric |

## Role differences

| Audience | Resolved from | Visible metadata |
|----------|---------------|------------------|
| **STANDARD** | Non-admin membership | Sources, bounds, freshness, exclusions, coverage |
| **ADMIN** | `ORG_ADMIN` or `MASTER_ADMIN` | Above + `adminDiagnostics`: loader key, background job name, recalculation trigger, cache info, remediation notes |

No internal secrets, credentials, or raw infrastructure hostnames are exposed.

## Freshness policy (source-dependent)

| Source | Stale threshold | Documented in |
|--------|-----------------|---------------|
| Insights | 24h since `lastRunAt` | `evaluations-data-quality.thresholds.ts` |
| Telemetry | 24h since last vehicle signal | same |
| Invoices / Bookings / Fleet | Fresh at request time (on-demand load) | lineage builder |

States map from data-quality dimension assessments — lineage does not invent independent freshness grades.

## Recalculation triggers

| Trigger | Meaning |
|---------|---------|
| `ON_DEMAND` | Default — summary requested via API |
| `SCHEDULED` | Background scheduler run (insights) |
| `CACHE` | Response served from cache (`servedFromCache: true`) |

## Integrated metadata surfaces

- Summary sections: `financial`, `receivables`, `bookings`, `fleetUtilization`, `costModel`, `utilizationModel`, `activeRisks`, `strengths`, `weaknesses`, `driverAnalysis`, `dataQuality`
- Cost model KPIs: `lineage` per metric
- Utilization model metrics: `lineage` per metric
- Top-level `lineage` section: full metric catalog + `sourceErrors`

## Sources without lineage (v1)

Documented in `sourcesWithoutLineage`:

- `EXTERNAL_ACCOUNTING_EXPORT`
- `PAYROLL_PERSONNEL`
- `DEMAND_FORECAST`

## Module map

| File | Role |
|------|------|
| `evaluations-lineage.contract.ts` | Types + audience resolver |
| `evaluations-lineage.ts` | Pure lineage builder |
| `evaluations-lineage.service.ts` | NestJS adapter |
| `evaluations-analytics-summary.service.ts` | Wires lineage into summary |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

Scenarios: fresh data, stale insights, failed loader/job, partial sources with exclusions, on-demand recalculation (admin), cached response (admin), role redaction.

## Example results

**Fresh revenue (STANDARD user)**

- Sources: Invoice ledger
- Bounds: period from → to
- Freshness: FRESH
- No adminDiagnostics

**Stale insights (ADMIN user)**

- Freshness: STALE, threshold label "Stale when older than 24h"
- `adminDiagnostics.backgroundJobName`: `business-insights-scheduler`
- Exclusion: insights never run (if applicable)

**Partial bookings (MISSING_KM)**

- 10 bookings excluded from km-based metrics
- `exclusionReasons`: `MISSING_KM`

## Known limits

| Limit | Reason |
|-------|--------|
| Record-level min/max timestamps | v1 uses period bounds + loader timestamps where row-level min/max unavailable |
| Executive section lineage | Aggregated from dependent sections |
| Custom per-org stale thresholds | Global defaults in v1 |
