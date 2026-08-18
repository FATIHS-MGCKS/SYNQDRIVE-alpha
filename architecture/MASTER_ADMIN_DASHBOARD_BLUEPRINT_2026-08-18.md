# Master Admin Dashboard Blueprint

**Date:** 2026-08-18  
**Phase:** UI-4.2 (specification only)

## Role

`Plattform-Übersicht` is the Master Admin **control plane overview** — not monitoring, billing, org admin, queue console, or SIEM.

Answers: *What matters right now and where do I go next?*

## Target layout (above the fold)

1. **Status Hero** — `platform-health.overallStatus`, incident count, affected orgs, domain chips (Runtime, Worker, DIMO, Billing, Backup, Support)
2. **Active Incidents** — normalized P0/P1 rows with drilldowns
3. **Platform Status** — compact grouped health (Core / Processing / External / Resilience) with progressive disclosure

## Canonical data sources

| Domain | API |
|--------|-----|
| Platform health | `GET /admin/platform-health` |
| Billing signals | `GET /admin/billing/overview` |
| Org attention | `GET /admin/billing/organizations` (warnings) |
| Support | `GET /admin/support/stats`, `newest` |
| Telemetry freshness | `GET /admin/connectivity/platform-summary` (**new**) — `telemetry-freshness.resolver` |
| Resilience | `GET /admin/ops/resilience-status` (**new**) |
| Aggregated ops DTO | `GET /admin/dashboard/operational` (**new**, preferred) |

**Deprecated for dashboard UI:** misleading fields on `GET /admin/dashboard` (MRR, PENDING-as-trial, vehicle count as “connected”).

## New frontend module (implementation phase)

`frontend/src/master/dashboard/` — StatusHero, IncidentList, PlatformStatus, domain summaries, shared `useMasterDashboardOperational` hook. Reuses `master/shell` + pattern library.

## Nav badges

`useMasterNavBadges` must consume the same operational DTO as the dashboard (no hardcoded `platformCritical: false`).

## Docs

- Audit: `docs/ui/master-admin-dashboard-deep-audit.md`
- Blueprint: `docs/ui/master-admin-canonical-dashboard-blueprint.md`
- Page framework: `docs/ui/master-admin-canonical-page-framework.md`
