# Master Admin Cross-Page Convergence (UI-FINAL)

**Date:** 2026-08-18

## Scope

Final consistency pass after UI-1 … UI-10 hub remediations. Fixes cross-page drilldown slugs, nav badge sources, TopBar chrome, shared formatters, orphan view removal, and billing-only deep-link guard — without new product features or IA changes.

## Drilldown URL contract

Central helper: `frontend/src/master/navigation/master-drilldown.ts`

- `resolveMasterDrilldownView()` — legacy alias map
- `applyMasterDrilldownUrl()` — `pushState` by default for browser Back support

| Legacy `?view=` | Canonical target |
|-----------------|------------------|
| `fleet-connection` | `vehicles` (+ `cvSection`) |
| `activity-log` | `security-access` + `securityAccess=audit` |
| `platform-health` | `platform-ops` |
| `settings` | `platform-integrations` |

Dashboard operational DTOs emit canonical `drilldownView` values (`vehicles`, `security-access`, `platform-ops`, `billing`, `organizations`).

## Nav badge sources

`useMasterNavBadges.ts`:

| Badge | Source |
|-------|--------|
| `connectivity-warning` (vehicles) | `GET /admin/vehicles/operational/overview` → `counts.withAttention` |
| `integration-outage` (high-mobility) | `GET /admin/platform-integrations/directory` → entry `high-mobility` attention / runtime health |
| Others | Unchanged (operational dashboard cache, security/integration attention summaries) |

## Shared formatters

`frontend/src/components/patterns/format-utils.ts` — `formatRelativeDe`, `formatDateTimeDe` (past-relative, de-DE).

Billing renewal dates keep `billing.utils.formatRelativeDe` (future-relative semantics).

## Removed orphan views

Deleted from `frontend/src/master/components/` (replaced by hubs):

- `PlatformSettingsView` → `platform-integrations`
- `PlatformHealthView` → `platform-ops`
- `FleetConnectionView` / `PlatformVehiclesView` → `connected-vehicles`
- `PlatformUsersView` / `ActivityLogView` → `security-access`

## Shell / a11y

- Skip link in `MasterAdminShell` → `#master-main`
- `TopBar`: welcome + integrations shortcut + theme cycle + optional logout (no decorative search/notifications)

## Permissions

Billing-only master users: `App.tsx` redirects non-`dashboard`/`billing` views to dashboard.

## Documentation

- Audit: `docs/ui/master-admin-final-cross-page-consistency-audit.md`
- Post-remediation: `docs/ui/master-admin-final-consistency-post-remediation.md`
