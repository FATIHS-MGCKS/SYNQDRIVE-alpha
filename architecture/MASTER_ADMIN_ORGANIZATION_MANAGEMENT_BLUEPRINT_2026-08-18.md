# Master Admin Organization Management Blueprint

**Date:** 2026-08-18  
**Phase:** UI-5.2 (specification — not implemented)

## Role

`Organisationen` is the Master Admin **tenant control plane** — index and detail for mandate operations, not a replacement for Billing Control Center or Fleet Connection Console.

Answers: *Is this organization healthy — and if not, what needs my attention?*

## Target surfaces

| Surface | Purpose |
|---------|---------|
| Organizations List | Compact scalable index — status, subscription, billing health, vehicles, attention |
| Organization Detail Header | Context: name, org status, subscription, metadata, few actions |
| Overview Tab | 10-second health snapshot — no duplicate detail tables |
| Tabs | Übersicht, Benutzer, Fahrzeuge, Abrechnung, Integrationen, Aktivität, Einstellungen |

## Attention model

Server-computed aggregate from canonical states only — no frontend business logic.

| Code | Source |
|------|--------|
| `PAST_DUE`, `PAYMENT_METHOD_MISSING`, `RECONCILIATION_DRIFT`, `PRICE_NOT_CONFIGURED` | Billing (`billing-admin.service`, dashboard attention loader) |
| `ORG_SUSPENDED`, `ORG_PENDING` | `Organization.status` |
| `INTEGRATION_ERROR` | Integration registry / DIMO connection state |
| `CONNECTIVITY_CRITICAL` | `telemetry-freshness.resolver` thresholds |

## Canonical data sources (target)

| Domain | API (existing / proposed) |
|--------|---------------------------|
| Org list + attention | `GET /admin/organizations/operational` (**proposed**) |
| Org detail | `GET /admin/organizations/:id` |
| Billing summary | `GET /admin/billing/organizations` → `listOrganizationsBilling()` |
| Org connectivity | `GET /admin/connectivity/organizations/:orgId/summary` (**proposed**) |
| Users (scoped) | `GET /admin/users?organizationId=` (**param proposed**) |
| Activity (scoped) | `GET /admin/activity-log?organizationId=` (**param proposed**) |
| Privileged audit | `master-admin-privileged-audit.interceptor` — reason required for DELETE |

## Privileged actions

| Tier | Examples | UI |
|------|----------|-----|
| Normal | Edit metadata | Header / Settings |
| Sensitive | Subscription change | Billing tab, step-up |
| High risk | Suspend, disconnect integration | Isolated actions + reason |
| Destructive | Delete org | Danger Zone only |

## Frontend modules (current → target)

| Current | Target |
|---------|--------|
| `OrganizationsView.tsx` | Server pagination, attention column, no MRR/Plan |
| `OrganizationDetailView.tsx` | Fresh fetch, `orgTab` URL, 7 tabs, no mock toggles |
| List snapshot for detail | `api.organizations.get(id)` |

## Docs

- Audit: `docs/ui/master-admin-organizations-deep-audit.md` (UI-5.1)
- Blueprint: `docs/ui/master-admin-canonical-organization-management-blueprint.md` (UI-5.2)
- Page framework: `docs/ui/master-admin-canonical-page-framework.md`
- Dashboard patterns: `docs/ui/master-admin-canonical-dashboard-blueprint.md`

## Acceptance target

10-second org health test ≥ **85/100** (current ~42/100 per audit).
