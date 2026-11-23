# Current State — Master Admin UI/UX

**Baseline (2026-11-23):** [`../../evidence/FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md`](../../evidence/FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md) (MAUX section). P9 audit access **RETIRED**.

**Last verified (repository):** 2026-11-22 (Europe/Berlin) · **SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**Production (P8):** infra **VERIFIED_READ_ONLY** @ `1e6a267c`; **authenticated UI BLOCKED** (no approved session); DIMO privilege UI **NOT_DEPLOYED** on prod vs `main`  
**Epistemic legend:** CONFIRMED = inspected source; INFERRED = structural conclusion; HISTORICAL = prior docs; UNKNOWN = not verified live.

## Executive summary

Master Admin is the Core **control-plane** SPA at `/master`, gated by `MASTER_ADMIN` (`frontend/src/App.tsx`). Navigation is **single-route** with canonical state in query parameters (`?view=`, plus hub-specific keys). The shell stacks **MasterAdminShell → AppShell variant="master"** with Master-owned **Sidebar**, **MasterGlobalChrome**, **PageContainer**, and hub-specific views under `frontend/src/master/`.

Runtime **couples** to shared foundation: `theme.css`, `components/ui`, `components/patterns`, shared MFA dialogs. Master-local chrome (`master/shell/*`, `master/components/*`, hub modules) is owned by **this authority**.

## Repository baseline

| Item | Value |
|------|--------|
| Route | `/master` |
| Entry | `frontend/src/master/App.tsx` |
| Nav SSOT | `frontend/src/master/navigation/master-nav.config.ts` (24 registered nav items) |
| URL sync | `master-nav-url.ts`, `pushMasterNavState`, `popstate` in App |
| Tests (nav) | `master-nav-url.test.ts`, `master-nav-product-management.test.ts`, tire/battery nav tests |

## Production baseline

| Item | Epistemic |
|------|-----------|
| `GET /master` → 200 SPA shell | CONFIRMED (2026-11-22 UTC) |
| `master-nav` in deployed bundle | CONFIRMED |
| Authenticated hub rendering | UNKNOWN |

See [`evidence/PRODUCTION_BASELINE.md`](./evidence/PRODUCTION_BASELINE.md).

## Repo vs Production

**Drift:** Production backend **CONFIRMED** @ `1e6a267c`; repository Master UI changes since then **NOT_DEPLOYED** (see `PRODUCTION_FRONTEND_DRIFT_RECONCILIATION.md`). Frontend **source** on Production **INFERRED** @ `1e6a267c`, not CONFIRMED without build attestation.

## End-to-end UI flow

1. User hits `/master` after `ProtectedRoute` + role check.  
2. `MasterAppInner` parses URL → `MasterView` + auxiliary params (`orgId`, `masterBilling*`, `security-access-url`, intelligence params, `archCategory`, `hmTab`).  
3. `Sidebar` renders grouped nav from `MASTER_NAV_GROUPS`; permissions from `master-nav-permissions.ts`.  
4. Content branch in `App.tsx` mounts hub component inside `PageContainer` (variant per view).  
5. Cross-hub navigation uses `handleMasterNavigate` / `navigateMaster` and MFA step-up via `MfaStepUpDialog`.

## Shell and page framework

| Layer | Component | Ownership | Epistemic |
|-------|-----------|-----------|-----------|
| Shell | `MasterAdminShell` | Master-local | CONFIRMED |
| Layout | `AppShell` (`components/shell`) | Shared foundation | CONFIRMED |
| Width | `PageContainer` (`standard`/`wide`/`full`) | Master-local wrapper | CONFIRMED |
| Header pattern | `MasterPageHeader`, `MasterPageTabs`, `MasterPageSection` | Master-local | CONFIRMED — engineering hubs use `variant="context"` for visible descriptions (UX-010) |
| Legacy tabs | `sq-tab-bar`, muted pills in some engineering views | Master-local debt | CONFIRMED |

**Layout (UX-001 corrected):** `product-management` uses in-view `PageContainer variant="standard"` in `ProductManagementView.tsx`; `App.tsx` intentionally omits an outer wrapper to avoid double padding.

## Navigation and URL contracts

- **24 top-level views** in `MASTER_NAV_ITEMS` (see [`inventories/MASTER_SCREEN_MATRIX.md`](./inventories/MASTER_SCREEN_MATRIX.md)).  
- **Sub-states** via query: organization detail (`orgId`, `orgTab`), billing center sections, security hub sections, platform-ops / integrations drilldowns, HM tab, architektur category. Organization detail uses eight `MasterPageTabs` with horizontal scroll + active-tab scroll-into-view (UX-005, 2026-11-23). Hub navigation contract: [`NAVIGATION_URL_CONTRACT.md`](../../governance/NAVIGATION_URL_CONTRACT.md) (UX-006).  
- **Legacy redirects** in `master-nav-url.ts` (`users` → `security-access`, deprecated engineering aliases).  
- **i18n (CONFIRMED debt):** sidebar group labels via `tMasterNav` DE map (`master-nav-i18n.ts`), not platform `LanguageProvider` catalogs — cross-ref **Internationalization** authority.

## Shared vs Master-local components

| Area | Shared imports | Master-only |
|------|----------------|-------------|
| Tables/dialogs | `patterns/DataTable`, `AppDialog`, `EmptyState` | Hub-specific columns |
| MFA | `components/mfa` | `MasterMfaGate`, org step-up flows |
| Chrome | `TopBar` patterns partially | `MasterGlobalChrome`, `Sidebar` |

## States, forms, dialogs

- Hubs use pattern **Empty/Loading/Error** where migrated (`MasterLoadingState`, `MasterErrorState`).  
- Org/user CRUD toasts: **mixed EN/DE** in `App.tsx` user handlers (CONFIRMED).  
- Billing/security hubs: dense tables + drawer/dialog stacks (INFERRED from imports; not browser-tested).

## Legacy and contradictions

| ID | Epistemic | Summary |
|----|-----------|---------|
| MAUX-CX-001 | HISTORICAL | `docs/ui/*` URL-segment navigation vs current `?view=` |
| MAUX-GAP-ORPHAN-001 | CONFIRMED | `RightSidebar.tsx` not mounted |
| MAUX-GAP-I18N-001 | CONFIRMED | Master chrome not on 9-locale runtime |

## Accessibility and responsive

- Sidebar collapse persisted; mobile primary shortcuts on selected nav items (`mobilePrimary`).  
- **UNKNOWN:** axe/contrast audits; keyboard path through all hubs.

## API / data consumers (UI-facing)

Master views call platform APIs via `frontend/src/master` service modules and shared `api` client (not owned by this authority). UI contract: loading/error surfaces must remain tenant-scoped — no hardcoded org IDs in components (spot checks CONFIRMED on nav layer).

## Failure / recovery (UI)

MFA step-up retry flows in App.tsx; hub-level error states vary by maturity (INFERRED).

## Confirmed invariants (governance)

- Master retains control-plane IA; Rental nav not copied wholesale (MAUX-DEC-CONTROL-PLANE-001).  
- Product-local doc changes default per foundation change-isolation policy.

## Explicit non-claims

- No Figma parity claim.  
- No Production screenshot verification.  
- No complete audit of every sub-tab in all 7-section hubs in one pass (hub internals PARTIAL).

## Open gaps

See [`contradictions/KNOWLEDGE_GAPS.md`](./contradictions/KNOWLEDGE_GAPS.md).

## Last evidence

MAUX-EVID-CODE-001 — full-tree inspection anchor at `413175e8c`.