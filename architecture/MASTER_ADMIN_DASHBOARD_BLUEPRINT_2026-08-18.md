# Master Admin Dashboard Blueprint

**Date:** 2026-08-18  
**Phase:** UI-4.3/4.4 (implemented)

## Role

`Plattform-Übersicht` is the Master Admin **control plane overview** — not monitoring, billing, org admin, queue console, or SIEM.

Answers: *What matters right now and where do I go next?*

## Implemented layout (above the fold)

1. **Status Hero** — `overallStatus`, incident count, affected orgs, domain chips (Runtime, Worker, DIMO, Billing, Backup, Support)
2. **Active Incidents** — normalized P0/P1 rows with drilldowns
3. **Platform Status** — compact grouped health (Core / Processing / External / Resilience) with progressive disclosure

## Canonical data sources

| Domain | API |
|--------|-----|
| Platform health | `GET /admin/platform-health` (embedded in operational) |
| Billing signals | `GET /admin/billing/overview` (embedded) |
| Org attention | Derived in `PlatformDashboardService` from PAST_DUE, drifts, missing PM |
| Support | `GET /admin/support/stats`, `newest` (embedded) |
| Telemetry freshness | `GET /admin/connectivity/platform-summary` — `telemetry-freshness.resolver` |
| Resilience | `GET /admin/ops/resilience-status` — JSON or Prometheus textfile |
| Aggregated ops DTO | `GET /admin/dashboard/operational` (**primary UI source**) |

**Deprecated for dashboard UI:** misleading fields on `GET /admin/dashboard`.

## Frontend module

`frontend/src/master/dashboard/` — `useMasterDashboardOperational`, `operational-cache`, utils, types.  
View: `frontend/src/master/components/MasterDashboardView.tsx`.  
Reuses `master/shell` + pattern library.

## Nav badges

`useMasterNavBadges` consumes `operationalToNavBadgeState` from shared operational cache (no hardcoded health).

## Acceptance

- `docs/ui/master-admin-dashboard-post-remediation.md` — 10-second test PASS (~88/100 ops-weighted)
- Unit tests: `platform-dashboard.service.spec.ts`, `master/dashboard/*.test.ts`

## Docs

- Audit: `docs/ui/master-admin-dashboard-deep-audit.md`
- Blueprint: `docs/ui/master-admin-canonical-dashboard-blueprint.md`
- Post-remediation: `docs/ui/master-admin-dashboard-post-remediation.md`
- Page framework: `docs/ui/master-admin-canonical-page-framework.md`
