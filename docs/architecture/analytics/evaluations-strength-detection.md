# Evaluations Strength Detection (Prompt 23/54)

Rule-based, traceable detection of **Unternehmensstärken** for Auswertungen.

**Calculation version:** `strength-detection-v1`

## API surfaces

| Endpoint | Section |
|----------|---------|
| `GET /organizations/:orgId/evaluations/analytics/summary` | `strengths` |
| `GET /organizations/:orgId/evaluations/analytics/strengths` | Dedicated strength detection payload |

Both use the same filter contract as the analytics summary (period, station, vehicle class, etc.).

## Comparison bases (no industry benchmarks)

Strengths are only asserted against:

1. **HISTORICAL_PERIOD** — current period vs configured comparison window (e.g. previous MTD)
2. **ORG_TARGET** — organization defaults in `DEFAULT_STRENGTH_ORG_TARGETS` until persisted org goals exist
3. **PEER_STATIONS** — station or vehicle-class utilization vs org fleet average within the same organization

External/industry benchmarks are **not** used.

## Detected strength IDs

| ID | Title (EN) | Underlying KPI | Comparison |
|----|------------|----------------|------------|
| `HIGH_UTILIZATION` | High fleet utilization | `utilizationModel.metrics.UTILIZATION_PER_VEHICLE` | Org target (default ≥ 70%) |
| `REVENUE_GROWTH` | Revenue growth vs previous period | `financial.revenueMtdMinor` | Historical period (default ≥ +5%) |
| `HIGH_PAYMENT_COLLECTION` | Strong payment collection | `paidRevenue / revenue` | Org target (default ≥ 80%) |
| `LOW_OVERDUE_RATE` | Low overdue receivables | `overdue / open receivables` | Org target (default ≤ 5%) |
| `LOW_CANCELLATION_RATE` | Low cancellation/no-show rate | `(cancelled + no_show) / outcomes` | Org target (default ≤ 10%) |
| `LOW_UNPLANNED_DOWNTIME` | Low unplanned downtime | `unplannedDowntimeMs / fleetCapacityMs` | Org target (default ≤ 5%) |
| `SHORT_TURNAROUND` | Short turnaround between rentals | `turnaroundMs / turnaroundCount` | Org target (default ≤ 24h avg) |
| `LOW_DAMAGE_RATE` | Low damage cost ratio | `damage costs / revenue` | Org target (default ≤ 5%) |
| `STABLE_VEHICLE_AVAILABILITY` | Stable vehicle availability | `vehicleAvailability.readyPercent` | Org target (default ≥ 80%) |
| `GOOD_DATA_QUALITY` | Good analytics data quality | `dataQuality.overallStatus` | All core gates OK |
| `STRONG_STATION` | Strong station | `UTILIZATION_BY_STATION` vs org avg | Peer (+10pp default) |
| `STRONG_VEHICLE_CLASS` | Strong vehicle class | `UTILIZATION_BY_VEHICLE_CLASS` vs org avg | Peer (+10pp default) |

Each detected strength includes: `id`, `title`, `description`, `underlyingKpi`, `comparisonBasis`, `threshold`, `period`, `affectedDimension`, optional `dimensionKey`/`dimensionLabel`, `quantitativeImprovement`, `confidence`, `dataCoverage`, `rationale`.

## Minimum data requirements

| Rule | Minimum data |
|------|----------------|
| `HIGH_UTILIZATION` | ≥ 3 vehicles; utilization coverage ≥ org `minDataCoveragePercent` (80%) |
| `REVENUE_GROWTH` | Comparison-period revenue > 0 |
| `HIGH_PAYMENT_COLLECTION` | Period revenue > 0 |
| `LOW_CANCELLATION_RATE` | ≥ 10 booking outcomes in period |
| `LOW_UNPLANNED_DOWNTIME` | Utilization model available with fleet capacity > 0 |
| `SHORT_TURNAROUND` | ≥ 3 turnaround gaps |
| `LOW_DAMAGE_RATE` | Cost model + revenue available |
| `STABLE_VEHICLE_AVAILABILITY` | ≥ 5 vehicles in scoped fleet |
| `GOOD_DATA_QUALITY` | `overallStatus OK`, invoice + fleet complete, insights fresh, no partial sections |
| `STRONG_STATION` / `STRONG_VEHICLE_CLASS` | Org utilization + ≥ 2 peers; peer entity ≥ 2 vehicles |

## Global suppression rules

All strengths are suppressed when:

- `dataQuality.overallStatus === ERROR`
- Any unavailable analytics section (`unavailableSectionCount > 0`)
- Overlapping blocking bookings on the same vehicle (`hasOverlappingBookings`)

Deduping: one strength per `id + dimensionKey`.

Legacy UI: `summary.highlights` exposes org/fleet-level highlight cards derived from detected strengths.

## Examples

**Revenue growth:** Revenue 200k vs previous 150k → +33% → `REVENUE_GROWTH` with `comparisonBasis: HISTORICAL_PERIOD`.

**Strong station:** Org utilization 75%, Berlin station 88% → +13pp → `STRONG_STATION` for `st-1`.

**Suppressed:** Only 2 vehicles in scope → `HIGH_UTILIZATION` in `rulesSuppressed` with reason "Minimum 3 vehicles…".

## Module map

| File | Role |
|------|------|
| `evaluations-strength-detection.contract.ts` | Types, targets, snapshot |
| `evaluations-strength-detection.ts` | `detectOrganizationalStrengths`, `buildStrengthDetectionSnapshot` |
| `evaluations-strength-detection.service.ts` | NestJS adapter from summary snapshots |
| `evaluations-analytics-summary.service.ts` | Wires `strengths` section + dedicated endpoint |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

Covered in `evaluations-strength-detection.spec.ts`:

- Required metadata on detected strengths
- Overlap / data-error suppression
- Minimum vehicle and booking thresholds
- Peer station comparison (no external benchmark)
- Deduping and section status
- Snapshot builder mapping from utilization/cost models

## Known limits

| Limit | Reason |
|-------|--------|
| Org targets not persisted | Uses `DEFAULT_STRENGTH_ORG_TARGETS` constants until org goal storage exists |
| `weaknesses` unchanged | Now uses rich `EvaluationsWeaknessDetectionSummary` (was legacy highlight cards in Prompt 23) |
| No person rankings | By design — fleet/org/station/class dimensions only |
| `GOOD_DATA_QUALITY` excludes strengths/weaknesses from partial count | Avoids circular dependency during detection |
| Zero damage costs | `LOW_DAMAGE_RATE` may fire with LOW confidence when no repair records exist |
| Peer comparison uses utilization only | Station/class strength not derived from revenue or margin yet |
