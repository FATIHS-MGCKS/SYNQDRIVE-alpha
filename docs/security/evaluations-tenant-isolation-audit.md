# Evaluations Analytics — Tenant Isolation Security Audit (Prompt 19/54)

Date: 2026-07-24  
Scope: Auswertungen analytics, insights, dashboard insights, background insight generation, Redis/BullMQ evaluation jobs.

## Method

Full path review of controllers → filter resolution → services → repositories → shared matching logic → background jobs. Each finding includes **query-level** verification, not guard presence alone.

## Surfaces audited

| Surface | Guards | Org in queries | Station scope | Notes |
|---------|--------|----------------|---------------|-------|
| `GET …/evaluations/analytics/summary` | OrgScoping + Roles | ✅ | ✅ via `EvaluationsAnalyticsFilterService` | Financial/booking/fleet repos use `resolved.organizationId` |
| `GET …/evaluations/insights/summary` | OrgScoping + Roles | ✅ | ✅ | Same filter service |
| `GET …/evaluations/insights` (list) | OrgScoping + Roles | ✅ | ✅ | Pagination capped at 100 |
| `GET …/evaluations/insights/:id` | OrgScoping + Roles | ✅ | ✅ **hardened** | Now resolves filters + scope check |
| `GET …/dashboard-insights` | OrgScoping + Roles | ✅ | ✅ **hardened** | Station-scoped widget filtering |
| `GET …/dashboard-insights/summary` | OrgScoping + Roles | ✅ | ✅ **hardened** | Uses unified resolved filters |
| `admin/business-insights/*` | MASTER_ADMIN | Cross-tenant by design | N/A | Run detail now requires `:orgId` |

## Findings and fixes

### F-01 — Insight detail bypassed station scope (HIGH)

**Before:** `GET …/evaluations/insights/:insightId` loaded by `{ id, organizationId }` only. Station-restricted users could fetch any in-org insight by UUID.

**Fix:** Controller resolves filters; `DashboardInsightsAnalyticsService.getAnalyticsInsightById` applies `matchesResolvedInsightFilters`. Out-of-scope → `404 Insight not found` (no existence leak).

**Query check:** `prisma.dashboardInsight.findFirst({ where: { id, organizationId, isActive: true } })` + in-memory scope gate.

### F-02 — Dashboard insights ignored station membership (HIGH)

**Before:** `GET …/dashboard-insights` returned org-wide top-N insights without `StationAccessService`.

**Fix:** Controller resolves implicit station scope; filters insight rows before applying `maxVisibleInsights`.

### F-03 — Org-wide insights visible under station filter (MEDIUM)

**Before:** `matchesStationInsightFilter` returned `true` when `entityIds.length === 0`, exposing org-wide insights to station-filtered views.

**Fix:** Rewritten station matcher — explicit/implicit station scope requires station/vehicle ties; empty ties → `false`.

### F-04 — Implicit membership station scope missing (MEDIUM)

**Before:** Station-limited users without explicit `stationId` query saw org-wide analytics.

**Fix:** `ResolvedEvaluationsAnalyticsFilters.allowedStationIds`; filter service builds `stationVehicleIds` from all allowed stations; repository uses `resolveStationBookingScope` / `resolveVehicleScopeConstraint`.

### F-05 — Empty vehicle scope treated as unrestricted (MEDIUM)

**Before:** `loadFinancialSnapshot` used truthy length check — empty `Set` fell through to org-wide invoice query.

**Fix:** `resolveVehicleScopeConstraint` distinguishes `unrestricted` vs `scoped` vs `empty`; repos use `{ in: [] }` for empty.

### F-06 — Error messages leaked foreign entity IDs (LOW)

**Before:** `Station ${id} not found`, `Vehicle ${id} not found`.

**Fix:** Generic `Station not found`, `Vehicle not found`, `Vehicle class not found`, `Insight not found`, `Run not found`.

### F-07 — Admin run detail without org binding (LOW)

**Before:** `GET admin/business-insights/run-detail/:runId` — `findUnique({ id: runId })` only.

**Fix:** `GET admin/business-insights/run-detail/:orgId/:runId` → `getRunDetailForOrg(organizationId, runId)`.

### F-08 — Missing module import (BUILD)

**Before:** `EvaluationsAnalyticsFilterService` in providers without import.

**Fix:** Import added in `business-insights.module.ts`.

### F-09 — Broken dashboard summary call (BUILD)

**Before:** `getAnalyticsSummary(orgId)` wrong arity after filter contract migration.

**Fix:** Dashboard summary uses `filterService.resolve` + resolved filters.

## Verified secure (no change required)

| Item | Evidence |
|------|----------|
| `organizationId` from path only | Filter DTOs contain no org field; `OrgScopingGuard` enforces JWT/membership |
| Insight DB reads | `where: { organizationId, … }` on active insight queries |
| Entity references on output | `sanitizeEntityReferences` strips cross-tenant refs |
| Insight publish | `normalizeCandidateEntityReferences(c, organizationId)` |
| Detectors | Prisma queries scoped by `ctx.organizationId` |
| BullMQ jobs | `notification-evaluation:{orgId}:{triggerClass}` |
| Redis keys | `notification:eval:pending:{orgId}`, `notification:eval:followup:{orgId}` |
| Evaluation lock | Per-org distributed lock key |
| Pagination manipulation | `parsePagination` clamps `page ≥ 1`, `limit ≤ 100` |
| Export endpoints | None in evaluations module |

## Cross-tenant negative tests executed

`backend/src/modules/business-insights/evaluations-tenant-isolation.security.spec.ts`:

- Foreign station ID → generic not found
- Foreign vehicle ID → not found (org-scoped Prisma)
- Foreign vehicle class ID → not found
- Foreign insight ID (wrong org) → `null` / 404 semantics
- In-org insight outside station scope → `null` (same as not found)
- Org-wide insight hidden from implicit station scope
- Pagination abuse (`page: -5`, `limit: 9999`) → safe bounds
- Redis/BullMQ key collision attempt → distinct per org
- Admin run detail cross-org → `getRunDetailForOrg` returns null

Shared station-scope tests in `evaluations-analytics-filters.spec.ts`.

Run: `cd backend && npm run test:insights:analytics` (55 tests).

## Remaining risks

| Risk | Severity | Mitigation path |
|------|----------|-----------------|
| No `PermissionsGuard` on evaluations routes (unlike `data-analyse`) | Medium | Add module permission matrix when Auswertungen RBAC is defined |
| `userId` undefined → station bypass in `StationAccessService` | Medium | Requires global auth guarantee; document dependency on `AuthGuard` + `@Req() user` |
| Legacy `entityIds` / `metrics` not re-validated against DB on read | Low | Regeneration + `sanitizeEntityReferences`; optional DB join validation later |
| MASTER_ADMIN cross-tenant admin APIs | Accepted | Intentional platform surface |
| No dedicated evaluations export endpoint | N/A | Nothing to harden yet |
| Financial detail charts still client-side (invoices API) | Medium | Separate audit for `/invoices` when wiring executive KPIs to summary API |

## Architecture references

- Filter contract: `docs/architecture/analytics/evaluations-filter-contract.md`
- Station access: `backend/src/shared/stations/station-access.service.ts`
- IAM guard regression: `backend/src/shared/auth/iam-tenant-isolation.security.regression.spec.ts`
