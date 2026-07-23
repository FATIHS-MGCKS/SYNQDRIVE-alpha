# Rental Rules UI Restructure (V4.9.785)

| Field | Value |
|-------|-------|
| **Version** | V4.9.785 |
| **Prompt** | Rental Rules Remediation Prompt 32 |

## Component structure

```
RentalRulesTab (orchestrator)
├── RentalRulesPageHeader
├── RentalRulesSubNav
├── RentalRulesOverviewPanel
├── RentalRulesOrganizationSection
├── RentalRulesMatrixSection
│   ├── useRentalRulesMatrix
│   └── rental-rules-matrix.utils
├── RentalRulesOverridesSection
├── RentalRulesHistorySection (activity log)
├── RentalRulesPublishDrawer
└── existing drawers (DefaultRules, CategoryDetail, VehicleAssignment, EffectiveRulesPreview)
```

## Design patterns reused

- `PageHeader variant="full"` with status chip + meta row
- `surface-frosted` sub-navigation (L2 chrome)
- `fhs.kpiCard` KPI strip (Fleet Health Service pattern)
- `DataTable` desktop + mobile cards (`FleetConnectivityTab` pattern)
- `DetailDrawer` for publish workflow
- i18n keys under `rentalRules.ui.*` (DE/EN)

## Data sources (no duplicate business logic)

All data from existing APIs via `useRentalRulesCenter`:

- `api.rentalRules.overview`
- `api.rentalRules.getDefaults`
- `api.rentalRules.listCategories(includeInactive=true)`
- `api.rentalRules.fleetVehicles`
- Publish/draft via existing `RentalRulePublishImpactPanel` + revision APIs
- History via `api.activityLog.listByOrg` (filtered client-side)

## Matrix scalability

- Client-side search, status filter, incomplete filter
- Sortable columns (name, vehicles, age, deposit, status)
- Pagination (12 rows/page)
- Inactive/archived categories visible via status filter (`includeInactive=true` on load)

## Tests

- `rental-rules-matrix.utils.test.ts` — filter, sort, pagination, KPIs, draft collection
