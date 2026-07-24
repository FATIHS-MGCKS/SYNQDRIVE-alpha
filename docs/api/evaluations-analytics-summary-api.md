# Evaluations Analytics Summary API

Canonical, tenant-scoped summary endpoint for the Auswertungen (evaluations) page.

## Endpoint

```
GET /api/v1/organizations/:orgId/evaluations/analytics/summary
```

### Query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stationId` | UUID | No | Restrict metrics to vehicles/bookings/invoices linked to the station |
| `period` | `mtd` \| `last7d` \| `last30d` | No | Primary window (default: `mtd`) |

### Authentication & authorization

- Bearer JWT required
- `OrgScopingGuard` — path `orgId` must match the authenticated user's organization (or `MASTER_ADMIN`)
- `RolesGuard` — authenticated org membership required (same as `/evaluations/insights/*`)

No personal data (customer names, emails, driver details) is included in the response.

## Response shape

Each domain section is wrapped in a **section envelope**:

```json
{
  "status": "OK",
  "data": { },
  "error": null,
  "generatedAt": "2026-07-24T11:30:00.000Z",
  "freshness": { "stale": false, "lastUpdatedAt": "2026-07-24T10:00:00.000Z" }
}
```

### Top-level fields

| Field | Description |
|-------|-------------|
| `organizationId` | Tenant scope |
| `generatedAt` | ISO timestamp when the summary was assembled |
| `period` | Current analytics window (`from`, `to`, `timezone`, `key`) |
| `comparisonPeriod` | Previous window of equal length for deltas |
| `appliedFilters` | `stationId`, `period` |
| `overallStatus` | `OK` \| `PARTIAL` \| `UNAVAILABLE` \| `ERROR` |
| `executive` | Cross-domain executive KPIs |
| `financial` | Revenue, expenses, margin, deltas |
| `receivables` | Open/overdue receivable counts and amounts |
| `bookings` | Active/pending/completed + revenue |
| `fleetUtilization` | Rented/available/reserved + utilization % |
| `vehicleAvailability` | Status breakdown |
| `downtime` | Maintenance/blocked/cleaning vehicles |
| `costs` | Expense summary with comparison |
| `activeRisks` | Business insight risk counts + exposure |
| `affectedEntities` | Deduped entity counts from insights |
| `strengths` / `weaknesses` | Derived highlight items (no PII) |
| `dataQuality` | Section health + insights freshness |
| `insights` | Insight run metadata (`hasRun`, `stale`, `error`) |
| `metadata` | `generationDurationMs`, per-status section counts |

## Example response (abbreviated)

```json
{
  "organizationId": "org_abc",
  "generatedAt": "2026-07-24T11:30:00.000Z",
  "period": {
    "key": "mtd",
    "label": "Month to date",
    "from": "2026-07-01T00:00:00.000Z",
    "to": "2026-07-24T11:30:00.000Z",
    "timezone": "Europe/Berlin"
  },
  "comparisonPeriod": {
    "key": "mtd",
    "label": "Previous month to date",
    "from": "2026-06-01T00:00:00.000Z",
    "to": "2026-06-30T23:59:59.999Z",
    "timezone": "Europe/Berlin"
  },
  "appliedFilters": { "stationId": null, "period": "mtd" },
  "overallStatus": "OK",
  "executive": {
    "status": "OK",
    "data": {
      "revenueMtdMinor": 1200000,
      "expensesMtdMinor": 350000,
      "netMarginMinor": 850000,
      "openReceivablesMinor": 90000,
      "overdueReceivablesMinor": 15000,
      "activeBookings": 28,
      "fleetUtilizationPercent": 60.9,
      "criticalRisks": 4,
      "currency": "EUR"
    },
    "error": null,
    "generatedAt": "2026-07-24T11:30:00.000Z"
  },
  "financial": { "status": "OK", "data": { "revenueMtdMinor": 1200000, "revenueDeltaPercent": 20 } },
  "activeRisks": {
    "status": "OK",
    "data": {
      "businessRiskGroups": 18,
      "criticalBookings": 3,
      "estimatedExposureMinor": 240000,
      "exposureCurrency": "EUR"
    }
  },
  "affectedEntities": {
    "status": "OK",
    "data": {
      "insightGroups": 45,
      "events": 180,
      "affectedVehicles": 55,
      "affectedBookings": 22,
      "uniqueEntities": 81
    }
  },
  "dataQuality": {
    "status": "OK",
    "data": {
      "overallStatus": "OK",
      "insightsStale": false,
      "invoiceDataComplete": true,
      "fleetDataComplete": true,
      "partialSections": [],
      "unavailableSections": []
    }
  },
  "metadata": {
    "generationDurationMs": 42,
    "sectionCount": 13,
    "okSections": 13,
    "partialSections": 0,
    "errorSections": 0,
    "unavailableSections": 0
  }
}
```

Amounts are in **minor units** (cents) unless noted otherwise.

## Error semantics

| Section `status` | Meaning |
|------------------|---------|
| `OK` | Section computed successfully |
| `PARTIAL` | Derived section with missing upstream data (e.g. executive when financial failed) |
| `UNAVAILABLE` | Source not applicable or access blocked (`not found` / `forbidden`) |
| `ERROR` | Source threw an unexpected error |

**HTTP status:** `200` for composed summaries even when individual sections fail. Inspect `overallStatus` and per-section `status`/`error`.

The HTTP layer returns `401`/`403` only for auth/org guard failures.

## Architecture

```
EvaluationsAnalyticsController
  → EvaluationsAnalyticsSummaryService (orchestration, partial failure handling)
      → EvaluationsAnalyticsSummaryRepository (financial, bookings, fleet DB reads)
      → DashboardInsightsAnalyticsService (insight risks + entities)
      → shared/evaluations-insights/evaluations-analytics-summary.ts (pure composition)
```

- No business logic in the controller
- Typed contracts: `shared/evaluations-insights/evaluations-analytics-summary.contract.ts`
- Query validation: `EvaluationsAnalyticsSummaryQueryDto`
- OpenAPI: `@ApiTags('Evaluations Analytics')` on controller (`/docs`)

## Tests

```bash
cd backend && npm run test:insights:analytics
```

Covers:

- Shared period/delta/section helpers (contract tests)
- Service orchestration + station filter + partial failure
- Controller route contract
- Integration performance guard (~120 vehicles, ~45 insight groups, <500ms with mocked IO)

## Performance (mocked integration, 2026-07-24)

| Scenario | Fleet vehicles | Insight groups | Generation time |
|----------|----------------|----------------|-----------------|
| Full summary | 120 | 45 | < 500 ms |
| Partial (insights error) | 120 | — | < 500 ms |

Real production latency depends on invoice/booking row counts and DB load; repository queries are bounded aggregates (no pagination truncation).

## Related endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET …/evaluations/insights/summary` | Insight-only KPI block (used internally) |
| `GET …/evaluations/insights` | Paginated insight detail list |
| `GET …/invoices/stats` | Legacy invoice stats (superseded for Auswertungen page) |

## Migration notes

No database migration required. Frontend may migrate `FinancialInsightsView` / `InsightsCockpit` from client-side invoice aggregation to this endpoint incrementally.
