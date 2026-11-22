# Current State — Frontend UI/UX & Design System

**As-of:** `2026-11-22` · Repository `origin/main` @ `413175e8ca72355764a3d47936ad7eff78d415aa`

## Executive summary

SynqDrive Alpha ships **one frontend bundle** with three authenticated surfaces. **Visual SSOT** is `frontend/src/styles/theme.css` plus documented contracts (`LIQUID_GLASS_SYSTEM.md`, `THEME_COLOR_CONTRACT.md`). **Behavioral composition SSOT** for reusable UI is `frontend/src/components/{ui,patterns,shell,surface}`.

Master Admin is a **hub-style control plane** (`frontend/src/master/`) with shared patterns but **product-owned** chrome (`Sidebar`, `TopBar`) and query-parameter routing (`?view=`). Rental is the **largest consumer** of shared patterns and the **reference** for operational density. Operator is a **mobile-first** shell with bottom navigation and selective token/pattern use.

## Repository baseline

| Artifact | Path | Status |
|----------|------|--------|
| Router | `frontend/src/App.tsx` | CONFIRMED |
| Theme | `frontend/src/styles/theme.css` | CONFIRMED |
| Master app | `frontend/src/master/App.tsx` | CONFIRMED |
| Rental app | `frontend/src/rental/App.tsx` | PARTIAL (deep inventory open) |
| Operator app | `frontend/src/operator/OperatorApp.tsx`, `OperatorShell.tsx` | CONFIRMED |
| Master TSX count | 207 files under `frontend/src/master/` | CONFIRMED (inventory list in authority) |

## Production baseline

**UNKNOWN** for rendered UI. See [`evidence/PRODUCTION_BASELINE.md`](./evidence/PRODUCTION_BASELINE.md). Registry status **must remain** `AUDIT_IN_PROGRESS` until read-only Production UI attestation.

## Shared design system (confirmed)

| Layer | Canonical | Notes |
|-------|-----------|-------|
| Entry | `styles/index.css` → fonts, tailwind, theme | CONFIRMED |
| Brand | `--brand: #4F86E8` | CONTRADICTS some historical changelog blues |
| Typography | Manrope UI; Geist Mono data | CONFIRMED |
| Theme modes | `AppThemeContext`: light/dark/system | CONFIRMED |
| Surfaces | L0–L4 per `LIQUID_GLASS_SYSTEM.md` | CONFIRMED |
| Buttons | shadcn `Button` → `.sq-3d-btn--*` | CONFIRMED |
| Motion | `--dur-*`, `--ease-*`; `prefers-reduced-motion` block | CONFIRMED |
| Patterns | `PageHeader`, `DataCard`, `StatusChip`, `AppDialog`, `DataTable`, … | CONFIRMED |
| Liquid glass lens | Opt-in `VITE_ENABLE_LIQUID_GLASS_LENS` | CONFIRMED |

**No separate CSS authority** — this module documents and governs references only.

## Master Admin (confirmed highlights)

- **Shell:** `MasterAdminShell` → `AppShell variant="master"`; skip link; single main scroll (`#master-main`).
- **Navigation:** `master-nav.config.ts` (24 items, 8 groups); URL sync via `master-nav-url.ts`; legacy redirects (`users` → `security-access`, etc.).
- **Page framework:** `PageContainer` variants `standard|wide|full`; `MasterPageHeader` + hub section tabs on major hubs.
- **Gaps:** `ProductManagementView` without `PageContainer`; orphan `RightSidebar.tsx`; Master chrome i18n via `tMasterNav` (DE-only); mixed legacy `sq-tab-bar` in older views (`ChangesView`, `ArchitekturView`, …).

Detail: [`products/master-admin/PRODUCT_PROFILE.md`](./products/master-admin/PRODUCT_PROFILE.md).

## Rental (partial depth)

- **Shell:** `rental/components/Sidebar` + `TopBar` + shared `AppShell` (`max-w-[1440px]`, wider horizontal gutter than Master).
- **Views:** large in-memory view union in `rental/App.tsx` (dashboard, fleet, vehicle detail, bookings, finance, settings, communication-center, …).
- **Patterns:** heavy `components/patterns` adoption; domain-specific presentation in `rental/lib/*-presentation.ts`.
- **Reference role:** KPI tiles, fleet/vehicle cards, tab bars using `chrome-tab-bar` utilities — documented as **ADAPT** candidates for Master, not copy targets.

Detail: [`products/rental/PRODUCT_PROFILE.md`](./products/rental/PRODUCT_PROFILE.md).

## Operator (confirmed highlights)

- **Shell:** full viewport column; `OperatorHeader` + `OperatorBottomNav` (5 tabs); safe-area padding.
- **Surfaces:** `OperatorGlassCard` uses `surface-frosted` | `surface-premium` + `sq-press`.
- **Access:** desktop shows `OperatorDesktopOnlyNotice`; uses `FleetProvider` from Rental contexts.
- **Shared deps:** selective `components/ui` + patterns; no Master page framework.

Detail: [`products/operator/PRODUCT_PROFILE.md`](./products/operator/PRODUCT_PROFILE.md).

## Cross-product dependencies

| Change in | Affects |
|-----------|---------|
| `theme.css` | All products |
| `components/ui/*` | Master + Rental + Operator (selective) |
| `master/shell/*` | Master only |
| `rental/components/Sidebar.tsx` | Rental only |

Matrix: [`inventories/SHARED_COMPONENTS.md`](./inventories/SHARED_COMPONENTS.md).

## Invariants (current)

See `graph/invariants.yaml` — especially **no parallel design system** and **i18n authority boundary**.

## Non-claims

- No claim of visual redesign completion
- No claim of Production UI parity at `413175e8c`
- No claim that `docs/ui` certifications remain valid

## Related evidence

Prior read-only audit @ `01bd08a4` reconciled to current main for UI paths (delta: unrelated backend org work on main).