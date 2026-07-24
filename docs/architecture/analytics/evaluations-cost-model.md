# Evaluations Cost Model (Prompt 21/54)

Canonical, traceable cost KPIs for the Auswertungen analytics summary (`GET …/evaluations/analytics/summary` → `costModel` section).

**Calculation version:** `cost-model-v1`

## Design principles

1. **Actual vs estimated** — Incoming invoices and recorded repair/service costs are `ACTUAL`. Vehicle master-data leasing/insurance/tax rates are `ESTIMATED`.
2. **No opportunity costs as actual costs** — Underutilization potential and downtime opportunity are `UNAVAILABLE` with explicit data gaps.
3. **Coverage transparency** — Every KPI carries `coverage` (numerator/denominator counts + percent when applicable).
4. **Tenant scope** — All repository queries respect `ResolvedEvaluationsAnalyticsFilters` (station, vehicle, class, status).

## Response shape

```typescript
EvaluationsSectionEnvelope<EvaluationsCostModelSummary>

EvaluationsCostModelSummary {
  calculationVersion: 'cost-model-v1'
  currency: string
  period: EvaluationsTimePeriod
  totals: { actualExpensesMinor, estimatedFixedCostsMinor, recordedDamageCostsMinor, recordedMaintenanceCostsMinor, ... }
  denominators: { vehicleCount, completedBookings, totalKmDriven, totalRentalDays, cancelledBookings, noShowBookings, ... }
  metrics: EvaluationsCostKpi[]   // each with formula, dataSources, coverage, status, calculationVersion
  dataGaps: EvaluationsCostDataGap[]
}
```

## KPI catalog

| Key | Label | Formula | Primary sources | Status |
|-----|-------|---------|-----------------|--------|
| `TOTAL_OPERATING_EXPENSES` | Total operating expenses | `SUM(OrgInvoice.totalCents)` incoming, period | `OrgInvoice` | ACTUAL |
| `COST_PER_VEHICLE` | Cost per vehicle | `totalOperatingExpenses / vehicleCount` | Invoices + scoped vehicles | ACTUAL/PARTIAL |
| `COST_PER_KM` | Cost per kilometer | `totalOperatingExpenses / SUM(kmDriven)` | Invoices + `Booking.kmDriven` | PARTIAL |
| `COST_PER_RENTAL_DAY` | Cost per rental day | `totalOperatingExpenses / SUM(rentalDays)` | Invoices + `BookingPriceSnapshot` | PARTIAL |
| `COST_PER_BOOKING` | Cost per booking | `totalOperatingExpenses / completedBookings` | Invoices + completed bookings | PARTIAL |
| `UNPLANNED_MAINTENANCE_COSTS` | Unplanned maintenance | `SUM(ServiceCase.actualCostCents)` REPAIR/DIAGNOSTIC | `ServiceCase` | PARTIAL |
| `DAMAGE_REPAIR_COSTS` | Damage repair costs | `SUM(VehicleDamage.repairCostCents)` | `VehicleDamage` | ACTUAL/PARTIAL |
| `COST_BY_VEHICLE_CLASS` | Costs by vehicle class | Invoice sum grouped by `Vehicle.rentalCategoryId` | Invoices + vehicles | PARTIAL |
| `COST_BY_STATION` | Costs by station | Invoice sum grouped by `Vehicle.homeStationId` | Invoices + vehicles | PARTIAL |
| `ESTIMATED_FIXED_COSTS` | Estimated fixed costs | Pro-rated monthly master data | `Vehicle.leasing/insurance/tax` | ESTIMATED |
| `UNPLANNED_DOWNTIME_COSTS` | Unplanned downtime costs | N/A | — | UNAVAILABLE |
| `UNDERUTILIZATION_POTENTIAL` | Underutilization potential | N/A (not actual cost) | Utilization counts only | UNAVAILABLE |
| `NO_SHOW_CANCELLATION_COSTS` | No-show / cancellation costs | N/A (counts only) | `Booking.status` | UNAVAILABLE |

## Data source audit

### Belastbar (implemented)

| Category | Source | Usage |
|----------|--------|-------|
| Operating expenses | `OrgInvoice` INCOMING_* | Totals, per-vehicle/station/class splits |
| Damage repair | `VehicleDamage.repairCostCents` | `DAMAGE_REPAIR_COSTS` |
| Workshop / repair cases | `ServiceCase.actualCostCents` | `UNPLANNED_MAINTENANCE_COSTS` |
| Service events | `VehicleServiceEvent.costCents` | Maintenance totals |
| Fixed cost estimates | `Vehicle.leasingRateCents`, `insuranceCostCents`, `taxCostCents` | `ESTIMATED_FIXED_COSTS` |
| Denominators | `Booking`, `BookingPriceSnapshot` | km, rental days, booking counts |
| Vendor categories | `Vendor.category` on invoices | Towing/workshop signal (gap if zero) |

### Geschätzt only

- Vehicle fixed costs (master data, pro-rated 30-day month)
- Partial ratio KPIs when denominators or invoice vehicle links are incomplete

### Fehlende Datenquellen (documented in `dataGaps`)

| Category | Reason |
|----------|--------|
| Cleaning | No cleaning cost ledger; `cleaningStatus` is operational |
| Replacement vehicles | No substitution cost model |
| Personnel | No HR/labor integration |
| Downtime cost | Status counts only, no monetary ledger |
| Underutilization | Opportunity metric — excluded from actual costs |
| No-show / cancellation financial | Status counts only; no linked forfeiture/fees |
| Tires / brakes / battery dedicated buckets | Health data exists; no dedicated cost rollup |
| Insurance premiums | Only master-data estimate unless INSURANCE vendor invoices exist |

## Module map

| File | Role |
|------|------|
| `shared/evaluations-insights/evaluations-cost-model.contract.ts` | Types, KPI keys, snapshot |
| `shared/evaluations-insights/evaluations-cost-model.ts` | Pure `buildCostModelSummary` |
| `evaluations-analytics-summary.repository.ts` | `loadCostModelSnapshot` |
| `evaluations-analytics-summary.service.ts` | Orchestration → `costModel` section |
| `evaluations-analytics-summary.contract.ts` | Summary response includes `costModel` |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

- `shared/evaluations-insights/evaluations-cost-model.spec.ts` — KPI math, metadata, gaps
- `evaluations-analytics-summary.service.spec.ts` — `costModel` section wiring
- `evaluations-analytics-contracts.spec.ts` — `costModel` required key

## Related

- Prompt 17: Analytics summary endpoint
- Prompt 18: Unified filters (scope for cost queries)
- Prompt 20: Contract primitives and validation
