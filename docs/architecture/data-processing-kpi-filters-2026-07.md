# Data Processing Hub — KPI, Filter, Pagination & Performance (Prompt 37)

Date: 2026-07-24

## Summary

Refactored the Data Processing hub lists, KPIs, and filters for server-side pagination, exact KPI-to-filter mapping, and improved performance on large tenants.

## API changes

### New endpoint

- `GET /organizations/:orgId/data-authorizations/hub-metrics`
  - Returns readiness KPIs: active activities, blocking gaps, reviews due, revocations in progress, enforcement errors, DPIA overdue, plus legacy authorization stats.

### Extended list queries

**Processing activity register** (`GET .../processing-activity-register`)

| Param | Purpose |
|-------|---------|
| `kpiFilter` | `active`, `blocking_gaps`, `review_due`, `dpia_overdue`, `revocations_in_progress` |
| `cursor`, `limit`, `sort`, `dir` | Cursor pagination and sorting |
| `q` | Server-side title/code search |

**Legacy authorizations** (`GET .../data-authorizations`)

| Param | Purpose |
|-------|---------|
| `expiringSoon` | ACTIVE records expiring within 30 days (not all ACTIVE) |
| `revokedOrExpired` | REVOKED, EXPIRED, or ACTIVE past `expiresAt` |
| `revocationInProgress` | Legacy auths linked to in-progress revocation workflows |
| `riskLevel`, `dataCategory` | Risk and category filters |
| `cursor`, `limit`, `sort`, `dir` | Cursor pagination |

**Audit log** (`GET .../data-authorizations/audit-log`)

| Param | Purpose |
|-------|---------|
| `entityId` | Entity-scoped timeline (no org-wide client filtering) |
| `cursor`, `limit` | Cursor pagination |

**Authorization decisions** (`GET .../audit/authorization-decisions`)

- Already supported `cursor` + `limit`; hub audit section now uses dedicated paginated hook.

## Filter logic

- Each KPI maps to exactly one server query parameter via `kpiToRegisterParams` / `kpiToLegacyParams`.
- `enforcement_errors` KPI toggles client filter on preloaded coverage flows (`status === ENFORCEMENT_ERROR`).
- Active filter chips reflect URL-synced state (`dpQ`, `dpKpi`, `dpStatus`, etc.).
- Saved views are tenant-scoped in `localStorage` (`synqdrive:data-processing-saved-views:{orgId}`).

## Performance improvements

- Removed bulk preload of all activities, legacy authorizations, and audit rows in hub mount.
- Section lists fetch one page at a time with debounced search (300ms).
- Detail drawer resolves vehicles/customers/bookings by ID only (no 500-vehicle fetch).
- Register `blocking_gaps` KPI uses iterative post-filter pagination to avoid loading entire register.
- `useDataProcessingSectionList` uses cursor ref to prevent duplicate fetches on `nextCursor` updates.

## Frontend architecture

| Module | Role |
|--------|------|
| `data-processing-list-state.ts` | URL sync, KPI mapping, filter defaults |
| `useDataProcessingSectionList.ts` | Debounced paginated list hook |
| `useAuditDecisionsList.ts` | Paginated audit decisions hook |
| `DataProcessingKpiStrip.tsx` | Section-aware KPI cards |
| `DataProcessingActiveFilters.tsx` | Visible active filter chips |
| `DataProcessingSavedViews.tsx` | Tenant saved views UI |
| `resolve-authorization-scope-entities.ts` | Per-ID entity resolution |

## Tests

### Backend

- `data-processing-hub-metrics.service.spec.ts` — KPI aggregation
- `data-authorizations.service.spec.ts` — `expiringSoon`, `revokedOrExpired`, `revocationInProgress`

### Frontend

- `data-processing-list-state.test.ts` — KPI param mapping
- `data-processing.ui.test.tsx` — hub KPI strip, enforcement error filter, paginated sections

Run:

```bash
cd backend && npm test -- data-authorizations data-processing-hub
cd frontend && npm test -- data-processing
```

## Changes / Architektur

- Changes: V4.9.820
- Architektur: Data Processing hub list/KPI architecture updated
