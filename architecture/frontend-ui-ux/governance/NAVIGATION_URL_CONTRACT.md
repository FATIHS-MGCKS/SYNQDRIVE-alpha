# Navigation & URL contract (FEUX / MAUX / RENTUX / OPUX)

**Status:** VALIDATED (code inspection)  
**Base SHA:** `0e98c87d8` (UX-006, post #2504)  
**Companion:** [`SHELL_LAYOUT_CONTRACT.md`](./SHELL_LAYOUT_CONTRACT.md) · [`CROSS_PRODUCT_CHANGE_POLICY.md`](./CROSS_PRODUCT_CHANGE_POLICY.md)

Products **retain independent navigation implementations**. This document is the authoritative cross-product map — not a mandate to unify routers.

---

## Platform entry (shared)

| Path | App | Router owner | Auth gate |
|------|-----|--------------|-----------|
| `/login` | `pages/LoginPage.tsx` | `frontend/src/App.tsx` (`BrowserRouter`) | public |
| `/master` | `master/App.tsx` | React state + `history.pushState` / `popstate` | `MASTER_ADMIN` |
| `/rental` | `rental/App.tsx` | in-memory `currentView` + **feature-local** URL sync | authenticated tenant user |
| `/operator/*` | `operator/OperatorApp.tsx` | React Router path routes + shell tab state | authenticated (Operator guard) |

**Root router:** single `BrowserRouter` in `frontend/src/App.tsx`. No second SPA router inside Master or Rental.

---

## MASTER_NAVIGATION_CONTRACT

### Top-level route ownership

- **Path:** fixed `/master` (no path segments for hubs).
- **Hub selection:** query `view` (canonical). Legacy alias `masterView` still **read** by `readViewParam`.
- **Canonical module:** `frontend/src/master/navigation/master-nav-url.ts` (`normalizeMasterNavLocation`, `buildMasterNavSearch`, `pushMasterNavState`, `readInitialMasterNavLocation`).
- **Orchestrator:** `frontend/src/master/App.tsx` — owns `currentView`, `detailOrgId`, sidebar; syncs URL on navigate and on mount migration.

### View state representation

| Layer | Mechanism |
|-------|-----------|
| Primary hub | `MasterView` in React state + `?view=` |
| Organization drilldown | `orgId` query + in-memory `detailOrgId` |
| Organization detail tabs | `orgTab` query — **written/read** via `organizations/org.utils.ts`; tab UI listens to `popstate` in `OrganizationDetailView.tsx` |
| Hub subnav (partial list) | dedicated `*-url.ts` per hub (e.g. `security-access-url`, `platform-integrations-url`, `platform-ops-url`, billing `masterBilling*`, voice `voiceSection` / `voiceOrgId`, `archCategory`, `hmTab`, intelligence URLs) |
| Sidebar collapse | `localStorage` (`synqdrive-master-sidebar-collapsed`) — not URL |

`MasterNavLocationState.orgTab` is carried by `buildMasterNavSearch` / `navigateMaster`; **normalization on load** for `orgTab` is delegated to organization detail (not central `normalizeMasterNavLocation`).

### URL parameter conventions (core)

| Param | When | Notes |
|-------|------|-------|
| `view` | Always (canonical hub) | Unknown `view` → **dashboard** |
| `masterView` | Legacy read-only | Mapped to `view` via `readViewParam` |
| `orgId` | `view=organizations` or billing flows | Drives detail vs list |
| `orgTab` | `view=organizations` + detail | 8 tabs — see `ORG_DETAIL_TABS` |
| `settingsTab` | legacy / redirects | Several aliases redirect to other hubs |
| Hub-specific | per matrix | Preserved or migrated on hub entry — see `MASTER_HUB_SUBNAV.md` |

### Deep-link support

- Full hub URLs: `/master?view=<hub>&…` restore hub on refresh after `normalizeMasterNavLocation` + mount `replaceState` migration (`migratePlatformHealthParams`, `migrateSecurityAccessParams`, `migratePlatformIntegrationsParams`).
- Organization detail: `/master?view=organizations&orgId=<id>&orgTab=<tab>`.
- Drilldown helpers: `frontend/src/master/navigation/master-drilldown.ts` (`applyMasterDrilldownUrl`).

### Browser Back / Forward

- `master/App.tsx` registers `popstate` → re-reads `normalizeMasterNavLocation` → updates `currentView`, `detailOrgId`, arch/hm settings.
- **`orgTab`:** `OrganizationDetailView` separate `popstate` → `readOrgTabFromUrl()` (tested in `org-tab-url.test.ts`).
- Intelligence views use `pushMasterIntelligenceUrl` with dedicated context params.

### State restoration after refresh

- URL is **source of truth** for hub + `orgId` + hub sub-params after initial migration pass.
- Ephemeral UI (dialogs, table filters not encoded) may reset — hub-specific modules document encoded state.

### Legacy route normalization (CONFIRMED)

Applied in `normalizeMasterNavLocation` (tests in `master-nav-url.test.ts`):

| Legacy | Resolves to |
|--------|-------------|
| `hm-compatibility` | `high-mobility` + default `hmTab=eligibility` |
| `health-tracking` / `trip-detection-logic` / `performance-logic` | `architektur` + `archCategory` |
| `settings` + `settingsTab=monitoring` | `platform-ops` |
| `platform-health` | `platform-ops` |
| `fleet-connection` | `vehicles` + `cvSection` |
| `users` / `activity-log` | `security-access` + section param |
| bare `settings` view id | `platform-integrations` |

Additional **search-string migrations** on boot in `master/App.tsx` (replaceState, no new framework).

### Unknown / invalid route handling

- Unknown `view` → dashboard (`normalizeMasterNavLocation`).
- Billing-only users: `isBillingOnlyMasterUser` redirect logic in App (permission — not URL).

### Tests (representative)

`frontend/src/master/navigation/master-nav-url.test.ts`, hub `*-url` tests, `org-tab-url.test.ts`.

---

## RENTAL_NAVIGATION_CONTRACT

### Top-level route ownership

- **Path:** fixed `/rental`.
- **Primary view:** in-memory `currentView` string union in `rental/App.tsx` (sidebar `handleViewChange`).
- **Not a global `?view=` writer:** most sidebar navigations **do not** push `?view=` on every view change. URL is **selective** per feature.

### View state representation

| Concern | Representation |
|---------|----------------|
| Current screen | `currentView` React state |
| Settings tab | `settingsTab` + `sessionStorage` keys (`RENTAL_SETTINGS_*`) |
| Fleet hub tab | `fleetTab` + sessionStorage |
| Finance mode | `financeTab`; URL via `finance-navigation.ts` (`parseFinanceViewFromUrl`) |
| Fleet health / service | `fleetHealthServiceNav` + `parseFleetHealthServiceNavFromSearch` / `applyFleetHealthServiceNavToUrl` |
| Communication center | `communication-center-navigation.ts` + `communication-center-url.ts` (rich query contract) |
| Voice assistant | `voice-assistant-navigation.ts` sets `view=ai-voice-assistant` when syncing |
| Tasks list filters | `syncTasksListFiltersToUrl` |
| Invoices list filters | `syncInvoiceListFiltersToUrl` |
| Vehicle detail | **view id** = tab id (`overview`, `trips`, …) inside vehicle context — not separate path |
| Selected entities | React state (`selectedVehicle`, `detailCustomer`, …) — partial URL on some flows |

### URL parameter conventions

| Param / pattern | Feature | Module |
|-----------------|---------|--------|
| `view` | Finance tabs, communication, voice, legacy redirects | `finance-navigation`, `communication-center-*`, `voice-assistant-navigation` |
| Communication CC params | inbox/channel/settings | `communication-center-navigation.ts` |
| Fleet health params | condition-service drilldown | `fleet-health-service.types.ts` |
| Tasks filters | task list | `tasksListState.ts` |

**Refresh behavior:** deep links work where a module **encodes** state in the URL (communication, finance, fleet-health when synced). Generic sidebar views (e.g. dashboard) rely on **default in-memory** state after refresh unless user bookmarked a feature URL.

### Deep-link support

- Communication center: canonicalized from legacy `whatsapp-business`, `ai-voice-assistant`, etc. (`legacy-communication-navigation.ts` + tests).
- Finance: `parseFinanceViewFromUrl` on init.
- Document intake return navigation: `document-intake-navigation.ts`.

### Browser Back / Forward

- **Partial:** `popstate` on fleet health nav only (in `App.tsx`) — other features may not restore full `currentView` from URL on back.
- Communication / CC modules implement their own history sync where documented in tests.

### Legacy route normalization

- `redirectLegacyCommunicationRoute` / `resolveLegacyCommunicationRoute` on load and when entering legacy view ids.
- `stripLegacyBillingCustomerPaymentsParams` on mount (`replaceState`).
- Sidebar aliases: `fleet-condition` → fleet tab; `vendor-management` → fleet + health nav (in `handleViewChange`).

### Unknown / invalid route handling

- Legacy communication views redirected to `communication-center` or `workflow-automation` when recognized; otherwise state stays in memory.
- **No** global unknown-view fallback URL — UX-007 tracks legacy view id cleanup in types.

### Tests (representative)

`communication-center-navigation.test.ts`, `legacy-communication-navigation.test.ts`, `finance-navigation.test.ts`, `tasksListState.test.ts`, vehicle detail navigation tests.

---

## OPERATOR_NAVIGATION_CONTRACT

### Top-level route ownership

- **Path prefix:** `/operator` (React Router in `OperatorApp.tsx`).
- **Routes:** index, `vehicles/:vehicleId`, `bookings/:bookingId`, catch-all → `/operator`.
- **In-shell tabs:** `OperatorShellContext.activeTab` — not reflected in path except via deep-link bridge.

### View state representation

| Layer | Mechanism |
|-------|-----------|
| Tab | `activeTab` in context (`today` \| `scan` \| `vehicles` \| `tasks` \| `more`) |
| Vehicle focus | `selectedVehicleId` |
| Booking focus | `focusedBookingId` |
| Scan query | `scanQuery` |
| Deep link | `OperatorDeepLinkBridge` applies `resolveOperatorDeepLink` on location change |

### URL / path conventions

| Entry | Intent |
|-------|--------|
| `/operator` | default shell tab |
| `/operator/vehicles/:vehicleId` | scan tab + vehicle |
| `/operator/bookings/:bookingId` | scan tab + booking |
| `?q=` | scan search |
| `?tab=` | shell tab (whitelist; invalid tab ignored) |
| `/operator/scan` (path suffix) | scan tab |

Builders: `operator/lib/operatorRoutes.ts`.

### Deep-link support

**CONFIRMED** — bridge + tests (`operatorRoutes.test.ts`).

### Browser Back / Forward

React Router updates `location`; `OperatorDeepLinkBridge` re-applies intent. Shell tab state follows path/query — not a separate query-only hub model.

### State restoration after refresh

Path + query restore scan/vehicle/booking intents. Tab-only state without URL may default to Today.

### Legacy / invalid handling

Unknown paths → `Navigate to="/operator" replace`. Unknown `?tab=` values → ignored (`null` intent).

### Tests

`frontend/src/operator/lib/operatorRoutes.test.ts`.

---

## CROSS_PRODUCT_NAVIGATION_RULES

1. **Do not unify routers** — Master/Rental query+history patterns and Operator path routes are intentional (UX-006 preserves all three).
2. **Cross-product links** use absolute paths (`/master`, `/rental`, `/operator/...`) from login/default redirect in `App.tsx` — no shared nav registry.
3. **Shared foundation changes** (e.g. login redirect, root `Routes`) require FEUX governance + impact note in this doc.
4. **Master org admin URLs** use `master-nav-url.ts` + `org.utils.ts` for `orgTab` — not `master-nav-url.ts` alone (inventory corrected UX-005/006).
5. **Operator may consume Rental data context** (`RentalProvider`) — navigation remains OPUX-local.
6. **New screens:** document URL ownership in the product screen matrix + append hub/subnav inventory when adding query params.
7. **Legacy aliases:** preserve until UX-007/UX-008 backlog items with tests proving redirects (Rental) or normalization (Master).
8. **Production deep links** must not assume unified `?view=` across products.

---

## Related inventories

| Product | Matrix / subnav |
|---------|-----------------|
| MAUX | [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md), [`MASTER_HUB_SUBNAV.md`](../products/master-admin/inventories/MASTER_HUB_SUBNAV.md) |
| RENTUX | [`RENTAL_SCREEN_MATRIX.md`](../products/rental/inventories/RENTAL_SCREEN_MATRIX.md) |
| OPUX | [`OPERATOR_SCREEN_MATRIX.md`](../products/operator/inventories/OPERATOR_SCREEN_MATRIX.md) |

**Evidence:** [`UX006_NAVIGATION_URL_CONTRACT_2026-11-23.md`](../evidence/UX006_NAVIGATION_URL_CONTRACT_2026-11-23.md)