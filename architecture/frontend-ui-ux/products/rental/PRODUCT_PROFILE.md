# Product Profile — Rental (Operations)

**Domain:** Tenant fleet & rental operations  
**Route:** `/rental`  
**Code root:** `frontend/src/rental/`  
**Role in platform:** **Positive design reference** for density, KPI rhythm, and pattern-library usage (owner decision).  
**Epistemic baseline:** PARTIAL @ `413175e8c`

## UX intent

Day-to-day **org operations**: fleet, bookings, customers, finance, vehicle detail health/trips, settings, communication channels, automation.

## App shell (CONFIRMED)

| Piece | Path |
|-------|------|
| Shell | `AppShell variant="rental"` in `rental/App.tsx` |
| Sidebar | `rental/components/Sidebar.tsx` (product-specific) |
| TopBar | `rental/components/TopBar.tsx` — breadcrumbs, org context |
| Content | `max-w-[1440px]` via AppShell; **wider gutters** than Master (`px-5 sm:px-7 lg:px-[100px]` in `app-shell.tsx`) |
| Right sidebar | **Removed** from Rental App (historical); comments may remain in legacy docs |

## Navigation model (CONFIRMED core)

- Primary: `currentView` state union in `App.tsx` (30+ view ids).
- URL sync: per-domain helpers (finance, communication-center, fleet health service, tasks filters, vehicle detail, etc.).
- Vehicle detail: tab bar (`VehicleDetailTabBar`) + deep links into health/trips/bookings.

## View inventory (CONFIRMED from type union — not exhaustive sub-tabs)

`overview`, `connectivity`, `trips`, `dashboard`, `bookings`, `health-errors`, `fleet`, `damages`, `documents`, `customers`, `customer-detail`, `tasks`, `vendor-detail`, `invoices`, `fines`, `price-tariffs`, `customer-payments`, `financial-insights`, `settings`, `new-booking`, `stations`, `station-detail`, `vehicle-bookings`, `vehicle-tasks`, `vehicle-requirements`, `document-upload`, `ai-assistant`, `support`, `help-center`, `data-analyse`, `workflow-automation`, `parts-accessories`, `insurances`, `communication-center`.

**Legacy URL-only (not active view state):** `whatsapp-business`, `ai-voice-assistant` — `legacy-communication-navigation.ts` (UX-007).

## Patterns & density (reference highlights — CONFIRMED samples)

| Pattern | Example locations | Reference value |
|---------|-------------------|-----------------|
| Dashboard KPI tiles | `DashboardView.tsx`, `BusinessInsightsBox.tsx` | Information density, tabbed insights |
| Fleet hub | `FleetHubView.tsx` | Multi-tab fleet operations |
| Vehicle detail header | `vehicle-detail/VehicleDetailHeader.tsx` | Status chips, quick actions |
| Health presentation | `rental-health`, `vehicle-detail` mappers | Unified health chips (Rental Health V1) |
| Chrome tabs | `chrome-tab-bar` utils | Section navigation consistency |
| Map / trips L3 glass | `TripsMapCard.tsx`, map controls | **DO_NOT_COPY** to Master ops tables |

## i18n (CONFIRMED)

Uses platform `useLanguage()` / `LanguageContext` — **contrasts with Master `tMasterNav`**.

## Shared vs local components

| Shared | Rental-local |
|--------|--------------|
| `components/ui`, `patterns` | `rental/components/Sidebar`, `TopBar` |
| `AppShell` structure | ~1192 files under `rental/components/` |
| MFA, support dialogs (partial) | `rental/components/ui/Icon.tsx` only |

## Positive reference guardrails

Rental reference applies to **visual rhythm and pattern reuse**, not:

- Master sidebar IA
- Rental max-width inside Master control-plane
- Fleet-first navigation metaphors in security/billing hubs

See comparison matrix for classified proposals.