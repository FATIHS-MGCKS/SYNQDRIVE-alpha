# Evaluations Predictive Feature Store

Prompt 41/54 — tenant-safe, versioned feature basis for forecasting.

## Purpose

Materialize **point-in-time (PIT)** feature snapshots per organization for downstream statistical baselines and ML (see `evaluations-predictive-analytics-architecture.md`). This layer does **not** serve production forecasts to end users yet; it establishes reproducible training/evaluation datasets.

## Feature list (`feature-store-v1`)

| Key | Type | Description |
|-----|------|-------------|
| `calendar.weekday` | integer | Day of week (0=Sun) in org timezone |
| `calendar.month` | integer | Month (1–12) |
| `calendar.season` | string | Meteorological season (NH) |
| `calendar.is_public_holiday` | boolean | DE federal holiday (controlled static source) |
| `demand.booking_starts_count` | integer | Bookings starting on observation day |
| `demand.historical_7d_avg` | float | Trailing 7-day avg booking starts (prior days only) |
| `demand.historical_30d_avg` | float | Trailing 30-day avg booking starts |
| `bookings.lead_time_hours_avg` | float | Avg hours from create → start (PIT-safe) |
| `bookings.cancellations_count` | integer | Cancellations on observation day |
| `bookings.no_show_count` | integer | No-shows on observation day |
| `bookings.completed_count` | integer | Completions on observation day |
| `revenue.booking_minor` | integer | Completed booking revenue (minor units) |
| `revenue.invoice_issued_minor` | integer | Outgoing invoice total (EUR) on observation day |
| `pricing.avg_booking_minor` | integer | Avg completed booking price |
| `utilization.rented_minutes` | integer | Rented minutes overlapping observation day |
| `utilization.capacity_vehicle_minutes` | integer | Fleet capacity (vehicles × 24h) |
| `utilization.percent` | float | Rented / capacity % |
| `fleet.km_driven_total` | integer | KM from completions on observation day |
| `maintenance.events_opened_count` | integer | Service cases opened |
| `maintenance.cost_minor` | integer | Maintenance cost (minor units) |
| `downtime.minutes` | integer | Rental-blocking downtime overlap |
| `scope.station_id` | string | Station scope key (station builds only) |
| `scope.vehicle_class_id` | string | Class scope key (class builds only) |

Registry: `shared/evaluations-insights/predictive/evaluations-feature-registry.ts`  
All definitions: `pii: false`, explicit `maxLateArrivalDays`, `timeReference`.

## Versioning

| Layer | Version | Location |
|-------|---------|----------|
| Feature set | `feature-store-v1` | `FEATURE_SET_VERSION` constant |
| Registry | `1` per feature key | `PREDICTIVE_FEATURE_REGISTRY_VERSION` |
| Holidays | `de-federal-holidays-v1` | `evaluations-feature-calendar.ts` |

Snapshots are keyed by `(organizationId, featureSetVersion, grain, observationDate, scopeKey)`.  
Changing extraction logic or feature keys requires bumping `FEATURE_SET_VERSION` and re-materializing.

## Time reference & leakage controls

- **Observation date**: calendar day in organization IANA timezone.
- **asOfUtc**: end of observation day in org timezone (inclusive PIT cutoff).
- Records with event timestamps **after** `asOfUtc` are excluded (`recordsExcluded.futureLeakage`).
- Historical demand features use only dates **strictly before** the observation date.
- Holidays come **only** from the controlled static DE federal table — no ad-hoc API lookups.

## Storage decision

**PostgreSQL** via Prisma:

- `OrgPredictiveFeatureSnapshot` — materialized feature rows (JSON `features`, quality + lineage metadata).
- `OrgPredictiveFeatureBuildRun` — build audit trail.

Rationale: same tenant isolation model as the rest of SynqDrive, transactional upserts, no extra ML platform in v1. ClickHouse remains optional for high-volume telemetry; operational booking/service/invoice features fit PostgreSQL.

**Retention**: 24 months (`FEATURE_SNAPSHOT_RETENTION_MONTHS`). Purge runs after each successful build (`observationDate < cutoff`).

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│ PredictiveFeature   │────▶│ PredictiveFeatureLoader  │
│ Service             │     │ (org-scoped Prisma reads)│
└─────────┬───────────┘     └──────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ shared/evaluations-insights/predictive/                 │
│  extractPredictiveFeatures (pure PIT extraction)        │
└─────────┬───────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│ PredictiveFeature   │
│ Repository (upsert) │
└─────────────────────┘
```

### API (org-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/:orgId/business-insights/evaluations/predictive/features` | List snapshots |
| GET | `.../build-runs/latest` | Latest build run |
| POST | `.../build` | Materialize snapshots |
| POST | `/admin/business-insights/predictive-features/run/:orgId` | Master admin trigger |

v1 builds **FLEET** grain only (`scopeKey = fleet`). Station/class scopes are supported in extraction but not yet scheduled.

## Data quality

Each snapshot carries:

- `dataQuality.status`: `COMPLETE | PARTIAL | DELAYED | INSUFFICIENT`
- `coveragePercent`, `missingFeatureKeys`, `delayedFeatureKeys`, `notes`
- `lineage`: sources, record counts, exclusions, `buildFingerprint` for reproducibility checks

## Privacy assessment

| Topic | Assessment |
|-------|------------|
| PII in features | **None** — registry forbids customer names, emails, driver IDs |
| Personal data in storage | Org-scoped aggregates only; no per-customer rows |
| Lawful basis | Legitimate interest / contract (fleet analytics for tenant operators) |
| Retention | 24-month snapshot retention with post-build purge |
| Erasure | Org cascade delete removes snapshots and build runs |
| Holidays | Static public calendar data only |

## Tests

### Shared (Vitest)

`shared/evaluations-insights/predictive/evaluations-feature-store.shared.spec.ts`

- No future leakage (late `createdAt` excluded from lead time)
- Identical reproduction (`buildFingerprint`)
- Organization isolation (separate inputs → different fingerprints)
- Missing utilization when fleet empty
- Delayed completions excluded from same-day revenue
- Timezone-consistent observation windows (Berlin vs NYC)
- Controlled holiday source
- Station scope filtering
- Historical demand from prior days only

Run:

```bash
cd frontend && npx vitest run ../shared/evaluations-insights/predictive/evaluations-feature-store.shared.spec.ts
```

### Backend (Jest)

`backend/src/modules/business-insights/predictive/predictive-feature.service.spec.ts`

- Build flow with explicit dates
- Org isolation on loader/repository calls
- Failed build marks run `FAILED`
- List snapshots scoped by `organizationId`

Run:

```bash
cd backend && npx jest predictive-feature.service.spec.ts
```

## Related docs

- `docs/architecture/analytics/evaluations-predictive-analytics-architecture.md` — target forecasting architecture (Prompt 40)
