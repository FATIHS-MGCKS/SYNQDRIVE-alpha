# MAUX UX-012 — Sidebar V1 visual polish & Playwright evidence

**Date:** 2026-11-23 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_MAUX_SIDEBAR_V1_VISUAL_POLISH_PR`  
**Base SHA:** `f1aa0c69e1aa7d69c386176216b221a04ff0f4b2`  
**Change class:** PRODUCT_LOCAL (Master sidebar) + minimal **shared shell** (`nav-utils`, `nav-primitives`)

## Playwright mount root cause (Gate A)

1. **Insufficient API mocks** — Master shell stayed blank until `/admin/dashboard/operational` returned `MasterDashboardOperationalDto` (prior mock used legacy `/admin/dashboard` shape; also shadowed the operational path).
2. **Dual nav trees** — Locators without `data-testid="master-sidebar-desktop"` scope matched hidden mobile controls.
3. **Viewport gating** — Tablet/mobile `<1024px` must not assert desktop rail visibility.

## Visual polish (Gate B)

| Audit | Action |
|-------|--------|
| P1 tooltip keyboard | `CollapsedNavTooltip` → `group-focus-within:opacity-100` (shared Rental + Master) |
| P1 billing-only route | **Not reproduced in shell** — `App.tsx` `MASTER_ADMIN` gate unchanged (documented) |
| P2 sub-nav height | `subNavItemClass` → `min-h-[36px]`, `py-[8px]` |
| P2 indent | Folder children `ml-3 pl-2` aligned with parent children |
| P2 chevron naming | `master.sidebar.toggleChildMenu` (9 locales) on parent chevron only |
| P2 collapsed integration stack | Collapsed parent children wrapped with keyed `border-t` group |
| P2 typography doc conflict | **No change** — `!text-[12px]` override retained (design intent) |
| P3 chevron size | Group header chevron `w-3.5 h-3.5` |
| P3 footer gutter | Master footer `px-[18px]` expanded / `px-1.5` collapsed (Rental parity) |
| P3 fragment key | Collapsed parent block keyed wrapper |

## Evidence paths

- Screenshots: `/opt/cursor/artifacts/master-sidebar-v1-polish/`
- Geometry: `geometry-metrics.json`
- Axe sidebar: `axe-sidebar.json` (color-contrast on brand chip documented as pre-existing debt; non-blocking)

## Validation

- Playwright `master-sidebar-v1-visual.spec.ts`: **11/11 PASS** (desktop-1280 project; viewport matrix inline)
- Vitest: `Sidebar.v1.ui.test.tsx`, `nav-primitives.test.tsx`, `master-nav-sidebar-v1.test.ts`
- `npm run build`, `npm run i18n:check`: PASS