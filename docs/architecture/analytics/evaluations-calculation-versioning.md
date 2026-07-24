# Auswertungen — Calculation Versioning & Provenance

**Status:** Active (Prompt 6/54)  
**Schema version:** `1.0.0` (`EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION`)  
**Engine version:** `1.0.0` (`EVALUATIONS_CALCULATION_ENGINE_VERSION`)

## Purpose

Every analytics KPI and Business Insight result must be **reproducible**: consumers can see which formula ran, when, on which period, with which filters, from which sources, and whether the output is complete or partial.

This document defines the shared contract, persistence model, upgrade path, and operational procedures for formula changes and backfills.

## Provenance contract

Source: `shared/evaluations-metrics/evaluations-calculation-provenance.ts`

```typescript
interface EvaluationsCalculationProvenance {
  schemaVersion: string;           // envelope format version
  metricId: string;                // canonical registry id (e.g. fin.mtd_issued_revenue)
  calculationVersion: string;      // semver formula version from metric registry
  generatedAt: string;             // ISO-8601 — when the value was computed
  periodStart: string;             // ISO-8601 — data window start (inclusive semantics per metric)
  periodEnd: string;               // ISO-8601 — data window end
  appliedFilters: Record<string, unknown>;  // org, dimensions, policy, status exclusions, etc.
  sourceVersions: Record<string, unknown>;    // engine, registry, detectors, APIs, row counts
  completeness: 'complete' | 'partial' | 'degraded' | 'unknown';
}
```

Wrapped results use `EvaluationsCalculationResultEnvelope<T>` (`value` + `provenance`).

### Field semantics

| Field | Meaning |
|-------|---------|
| `calculationVersion` | Semver of the **formula** for this `metricId`. Bumped when logic changes. Sourced from the [Metric Registry](./evaluations-metric-registry.md). |
| `generatedAt` | Wall-clock time of computation (not necessarily equal to `periodEnd`). |
| `periodStart` / `periodEnd` | Analytic window the value represents. Detector-specific (e.g. rolling lookback for low utilization). |
| `appliedFilters` | Active slice: `organizationId`, insight policy, currency, excluded invoice statuses, entity scope, etc. |
| `sourceVersions` | Lineage: `engineVersion`, `registryVersion`, `dataSources`, `computationLayer` (`client` \| backend), API paths. |
| `completeness` | `complete` — full inputs; `partial` — detector/API failure or flagged incomplete client fetch; `degraded` — publish truncation (ranked > published); `unknown` — reserved for legacy gaps. |

### Legacy records

`parseCalculationProvenance(null | invalid)` returns **`null`**. We never invent historical metadata for rows persisted before Prompt 6.

## Calculation version resolution

Shared resolver: `shared/evaluations-metrics/evaluations-metric-calculation-versions.ts`

- Default version: `1.0.0` for all registry ids with prefixes `fin.`, `ins.`, `ops.`, `da.`, `fc.`
- Per-metric overrides: `EVALUATIONS_METRIC_CALCULATION_VERSION_OVERRIDES`
- Backend definitions in `evaluations-metric.definitions.ts` remain authoritative; sync test enforces parity

## Where provenance is attached

### Business Insights (backend, persisted)

| Layer | File | Behavior |
|-------|------|----------|
| Per-insight | `insight-calculation-provenance.ts` | Attached at publish via `attachInsightCalculationProvenance()` |
| Per-run | `buildInsightRunProvenance()` | Stored on `DashboardInsightRun.calculationMeta` |
| Persistence | `dashboard-insights.repository.ts` | JSON column `calculation_meta` on insight + run |
| API DTOs | `DashboardInsightDto`, `InsightRunSummaryDto` | `calculationMeta` parsed or `null` |

Run-level completeness:

- `partial` — one or more detectors failed (`Promise.allSettled` rejection)
- `degraded` — `rankedCandidateCount > publishedCount` (max visible cap)
- `complete` — otherwise

### Financial KPIs (client-computed, not yet persisted)

Builders in `shared/evaluations-metrics/evaluations-financial-provenance.ts`:

- `buildFinancialMtdProvenance()` — single MTD metric
- `buildFinancialInsightsProvenanceBundle()` — primary Financial Insights KPI set

Frontend re-export: `frontend/src/rental/lib/evaluations/evaluations-financial-provenance.ts`

UI wiring (attaching bundles to Financial Insights views) is deferred; builders and tests are in place.

## Database schema

Migration: `20260724130000_dashboard_insight_calculation_meta`

```sql
ALTER TABLE dashboard_insight_runs ADD COLUMN calculation_meta JSONB;
ALTER TABLE dashboard_insights   ADD COLUMN calculation_meta JSONB;
```

Both columns are **nullable**. Existing rows keep `NULL` → API returns `calculationMeta: null`.

Prisma models: `DashboardInsight.calculationMeta`, `DashboardInsightRun.calculationMeta`.

## Process for future formula changes

1. **Identify the metric** in the [KPI taxonomy](./evaluations-kpi-taxonomy.md) and [Metric Registry](./evaluations-metric-registry.md).
2. **Bump `calculationVersion`** in `evaluations-metric.definitions.ts` (semver: MAJOR = breaking definition, MINOR = additive filter/dimension, PATCH = bugfix same inputs).
3. **Add override** in `evaluations-metric-calculation-versions.ts` if the shared default no longer applies.
4. **Update detector / client logic** that implements the formula.
5. **Extend provenance** `appliedFilters` or `sourceVersions` when new inputs affect reproducibility.
6. **Add tests** for old and new versions (parse round-trip, version-specific expectations).
7. **Document** the change in SynqDrive Changes + this file if architecture shifts.
8. **Optional:** set `supersededBy` on deprecated registry entries.

Consumers comparing values across versions must match on `metricId` **and** `calculationVersion`.

## Backfills and historical recalculation

### When to backfill

- Formula bugfix that changes published insight text/metrics
- Policy change retroactively affecting severity or ranking
- Migration to attach provenance to historical runs (optional; do not fake timestamps)

### Recommended approach

1. **Scope:** organization id(s), date range of runs, insight types affected.
2. **Dry run:** re-execute detectors in read-only mode; diff candidate counts and priorities.
3. **Batch job:** reuse `BusinessInsightsService.runForOrganization(orgId, 'backfill_<reason>')` or a dedicated script that:
   - creates a new run
   - attaches current provenance (honest `generatedAt`)
   - does not rewrite old `calculation_meta` unless explicitly required
4. **Legacy rows:** leave `calculation_meta = NULL` unless a justified backfill; never backfill with guessed filters.
5. **Audit:** log `trigger`, `calculationVersion` map in run provenance `sourceVersions.detectorVersions`.

### Client-side financial KPIs

No DB backfill. Users see new provenance on next render after UI integration. For exports, include provenance envelope in CSV/JSON metadata (future prompt).

## Testing

| Suite | Location | Covers |
|-------|----------|--------|
| Provenance contract | `evaluations-calculation-provenance.spec.ts` | build, parse, wrap, v1/v2 versions |
| Insight provenance | same file | attach, periods, run completeness |
| Shared sync | `evaluations-metric-calculation-versions.sync.spec.ts` | definitions ↔ shared resolver |
| Repository DTOs | `evaluations-baseline.characterization.spec.ts` | legacy null, round-trip |
| Financial (client) | `evaluations-financial-provenance.test.ts` | MTD bundle, partial flag |

Run:

```bash
cd backend && npm run test:evaluations
cd frontend && npm run test:evaluations
```

## Related documentation

- [evaluations-kpi-taxonomy.md](./evaluations-kpi-taxonomy.md)
- [evaluations-metric-registry.md](./evaluations-metric-registry.md)
