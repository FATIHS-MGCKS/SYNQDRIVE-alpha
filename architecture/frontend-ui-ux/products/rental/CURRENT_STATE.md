# Current State — Rental UI/UX

**Repository SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa` · **Production:** infra VERIFIED @ `1e6a267c`; auth UI UNKNOWN  
**Route:** `/rental` · **Epistemic:** CONFIRMED where `rental/App.tsx` + `Sidebar.tsx` inspected; PARTIAL for every nested tab.

## Executive summary

Rental is the primary **fleet operations** SPA: org-scoped sidebar navigation, in-memory view state with URL synchronization, `AppShell variant="rental"`, and the densest consumer of shared **patterns** (KPI cards, tables, vehicle detail chrome). It is documented as a **positive design reference** for polish only — not a layout donor for Master (RENTUX-DEC-REFERENCE-001, PROPOSED).

## Shell and navigation

- **Sidebar** (`rental/components/Sidebar.tsx`): grouped sections (operations, finance, automation, integrations, administration) with permission gates (`useRentalOrg`, communication permissions).  
- **Top chrome:** vehicle detail tabs when `VEHICLE_DETAIL_VIEWS` active; fleet hub has internal tab strip.  
- **MainNavTabs retired** (comment V4.6.94 in App.tsx) — sidebar is canonical primary nav (CONFIRMED).

## View catalog

Full matrix: [`inventories/RENTAL_SCREEN_MATRIX.md`](./inventories/RENTAL_SCREEN_MATRIX.md) — **35+ view ids** including vehicle-detail tabs and finance tabs.

## Dashboards and KPIs

`DashboardView` links into fleet, finance, tasks, communication — high pattern-library density (CONFIRMED imports). KPI rhythm suitable for **ADAPT** proposals in foundation comparison doc; **not implemented** in Master.

## Fleet and vehicle detail

- **Fleet:** `FleetHubView` with `FleetTab` + condition/service vendors (`vendor-detail`).  
- **Vehicle context:** `overview`, `trips`, `health-errors`, `damages`, `documents`, bookings/tasks/requirements, `connectivity` — each wrapped in `VehicleDetailTabPanel`.

## Bookings, customers, finance

- Bookings flow includes `new-booking` wizard and deep links from dashboard.  
- Finance unifies `invoices`, `price-tariffs`, `customer-payments` via `FinanceView`.  
- `financial-insights` → `EvaluationsPage` (E6B canonical evaluations surface).

## Health and intelligence

`HealthErrorsView` modules tie to vehicle health architecture; communications include `CommunicationCenterView`, voice assistant entry points, workflow automation.

## Settings and administration

`SettingsView` multi-tab (account, company, users, data-authorization, email, rental-rules, billing). Permission-trimmed sidebar entries.

## Communication and automation

Communication center with URL state helpers; workflow automation with read/write guards.

## Shared vs Rental-local

| Shared foundation | Rental-owned |
|-------------------|--------------|
| `components/ui`, `patterns`, `shell/AppShell` | `rental/components/*`, FleetHub, Settings |
| `theme.css`, liquid glass (map/trips) | Sidebar layout, view union |
| Platform `LanguageProvider` / `t()` | Rental copy migration ongoing (i18n authority) |

## Runtime coupling (explicit)

Changes to global tokens or shared patterns can alter Rental without Rental authority doc updates — **SHARED_FOUNDATION_CHANGE** applies.

## States

`EmptyState` used for disabled Stations V2; pattern loading/error across views — **PARTIAL** inventory of per-view coverage.

## Responsive (CONFIRMED)

Sidebar mobile drawer; `lg` breakpoint collapse; AI assistant full-bleed negative margins on small screens.

## Tests

Rental has broader frontend test surface than Master/Operator UI (INFERRED from `*.test.ts` near rental); not exhaustively indexed in this bootstrap.

## Contradictions and gaps

RENTUX-GAP-INVENTORY-001 — fleet inner tabs not fully traced. RENTUX-GAP-PROD-001 — Production UI UNKNOWN.

## Non-claims

No browser screenshots; no claim Rental is visually isolated from shared CSS.