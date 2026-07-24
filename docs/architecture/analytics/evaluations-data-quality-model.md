# Evaluations Data Quality Domain Model (Prompt 26/54)

Unified **data quality model** for all Auswertungen analytics — per source and per metric, with explicit dimensions and no subjective overall score.

**Calculation version:** `data-quality-v1`

## API surfaces

| Endpoint | Output |
|----------|--------|
| `GET …/evaluations/analytics/summary` | `dataQuality` section with full domain model; cost/utilization metrics include `dataQuality` attachment |
| `GET …/evaluations/analytics/data-quality` | Dedicated data quality payload |

All assessments use the **same filter contract** as parent KPIs (tenant-scoped).

## Dimensions (per source / metric)

| Dimension | Measures |
|-----------|----------|
| **COMPLETENESS** | Expected vs present records |
| **FRESHNESS** | Age since last successful update |
| **VALIDITY** | Structural correctness (e.g. overlapping bookings) |
| **CONSISTENCY** | Cross-field / cross-source alignment |
| **UNIQUENESS** | Duplicate or overlapping records |
| **COVERAGE** | Population coverage percent |

## States

| State | Meaning |
|-------|---------|
| `GOOD` | Meets threshold |
| `LIMITED` | Usable with documented gaps |
| `STALE` | Data present but outdated |
| `INVALID` | Structural integrity failure |
| `MISSING` | Integration connected but no data in scope |
| `NOT_CONNECTED` | Loader/integration unavailable |
| `NOT_APPLICABLE` | Dimension does not apply to source |

`rollupStatus` is the **worst applicable state** across sources — not an independent subjective grade.

## Per-assessment fields

Each `EvaluationsDataSourceQualityAssessment` includes:

- Source key and label
- Period (same as analytics filters)
- Expected / present record counts
- Coverage percent
- Last successful update timestamp
- Six dimension assessments with measured values and threshold references
- Known errors (structured codes)
- Affected metric keys
- Recommended remediation steps

## Integrated data sources

| Source key | Origin |
|------------|--------|
| `INVOICES` | OrgInvoice financial loader |
| `BOOKINGS` | Booking snapshot |
| `FLEET` | Vehicle master data |
| `INSIGHTS` | Business insights engine |
| `COSTS` | Cost model aggregates |
| `UTILIZATION` | Utilization interval model |
| `TELEMETRY` | Vehicle latest state / DIMO freshness |
| `SERVICE_CASES` | ServiceCase actual costs |
| `DAMAGES` | VehicleDamage repair costs |

## Thresholds (default)

| Area | Good | Limited | Missing / invalid |
|------|------|---------|-------------------|
| Completeness | ≥ 95% | ≥ 70% | < 30% |
| Coverage | ≥ 90% | ≥ 60% | below limited |
| Freshness (insights/telemetry) | within 24h | — | stale after 24h |
| Uniqueness (bookings) | 0 overlaps | — | ≥ 1 overlap → INVALID |

Configured in `evaluations-data-quality.thresholds.ts`.

## Metric response integration

Cost model KPIs and utilization metrics receive optional `dataQuality`:

```typescript
{
  state: 'LIMITED',
  sourceKey: 'COSTS',
  warnings: ['…']
}
```

Bindings are also listed in `metricBindings[]` on the domain summary.

## Design rules

| Rule | Implementation |
|------|----------------|
| No arbitrary overall score | `rollupStatus` derived from dimension states only |
| Bad data quality ≠ business risk | `POOR_DATA_QUALITY` weakness uses `DATA_QUALITY` category; cross-cutting issues never use business risk codes |
| NOT_CONNECTED vs MISSING | `integrationConnected` flag + distinct states |
| Tenant safety | All loaders org-scoped; no cross-tenant aggregation |
| Legacy compatibility | `overallStatus`, `partialSections`, `invoiceDataComplete`, etc. preserved |

## Module map

| File | Role |
|------|------|
| `evaluations-data-quality.contract.ts` | Types |
| `evaluations-data-quality.thresholds.ts` | Documented thresholds |
| `evaluations-data-quality.ts` | Pure assessment engine |
| `evaluations-data-quality.service.ts` | NestJS adapter |
| `evaluations-analytics-summary.service.ts` | Wires domain + enriches models |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

Covers: complete, partial, stale, faulty (overlapping bookings), missing, and not-connected sources; metric enrichment; rollup derivation.

## Example results

**Complete fleet (GOOD)**

- FLEET: 10/10 vehicles, all dimensions GOOD
- Rollup: GOOD → `overallStatus: OK`

**Partial booking km coverage (LIMITED)**

- BOOKINGS COVERAGE: 25% (5/20 with kmDriven)
- Remediation: ensure completed bookings record kmDriven

**Stale insights (STALE)**

- INSIGHTS FRESHNESS: last run 4 days ago
- `insightsStale: true`; weakness `POOR_DATA_QUALITY` may fire

**Overlapping bookings (INVALID)**

- BOOKINGS VALIDITY/UNIQUENESS: INVALID
- Business weakness rules suppressed; cross-cutting `OVERLAPPING_BOOKINGS`

**Not connected invoices (NOT_CONNECTED)**

- INVOICES loader failed → NOT_CONNECTED on all applicable dimensions
- Distinct from empty fleet (MISSING)

## Known limits

| Limit | Reason |
|-------|--------|
| Invoice ↔ booking revenue reconciliation | Consistency marked LIMITED with note in v1 |
| Per-dimension history | Point-in-time assessment only |
| Custom thresholds per org | Global defaults in v1 |
