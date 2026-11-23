# Shell & layout contract (FEUX / MAUX / RENTUX / OPUX)

**Status:** VALIDATED (code inspection, `b8bfd55cc91b4c42b03c7c543791510c830bdc3c`)  
**Related:** [`CROSS_PRODUCT_CHANGE_POLICY.md`](./CROSS_PRODUCT_CHANGE_POLICY.md) · [`../inventories/SHARED_COMPONENTS.md`](../inventories/SHARED_COMPONENTS.md)

This document describes **actual** layout ownership. Products are **not** required to share one shell implementation; changes must respect the boundaries below before editing shared code.

---

## SHARED_CONTRACT

| Concern | Owner | Implementation | Cross-product rule |
|---------|--------|----------------|--------------------|
| Sidebar + main column grid | `frontend/src/components/shell/app-shell.tsx` | `AppShell` — `variant: 'rental' \| 'master'` only | **SHARED_FOUNDATION_CHANGE** — impact Master + Rental |
| Rental content max-width | `AppShell` | `max-w-[1440px]` on inner wrapper when `variant="rental"` | Rental-local behavior inside shared file |
| Rental gutters | `AppShell` | `px-5 sm:px-7 lg:px-[100px]`, vertical `pt/pb` | Same |
| Master gutters (chrome) | `AppShell` | `px-4 sm:px-6 lg:px-8` on scroll region; **no** max-width here | Same |
| Master page max-width | `frontend/src/master/shell/PageContainer.tsx` + `master-page-tokens.ts` | `standard` / `wide` / `full` via CSS vars | **MASTER_LOCAL** — do not move to `AppShell` (avoids double constraint; comment in `app-shell.tsx`) |
| Theme / typography base | `frontend/src/styles/theme.css`, `AppThemeContext` | Manrope, surfaces | **SHARED_FOUNDATION_CHANGE** |
| Skip link pattern | Product shells | Master: skip link in `MasterAdminShell`; Operator: header landmarks | Document per product when adding |

**When to run cross-product impact analysis**

1. Any edit to `app-shell.tsx` padding, max-width map, or flex/overflow structure.  
2. Any edit to `PageContainer` / `master-page-tokens.ts` that changes global Master width tokens in `theme.css`.  
3. New shared shell variant or merging Operator into `AppShell` — **not** current architecture; requires owner decision + all four authorities.

---

## MASTER_LOCAL

| Layer | File | Behavior |
|-------|------|----------|
| Shell wrapper | `frontend/src/master/shell/MasterAdminShell.tsx` | `AppShell variant="master"` + `#master-main` landmark + skip link |
| View router | `frontend/src/master/App.tsx` | Renders views inside `MasterAdminShell`; **most** views wrapped in `PageContainer` at route level |
| In-view container | e.g. `ProductManagementView.tsx` | **May** own `PageContainer` internally when `App.tsx` does not wrap (single container — no double padding) |
| Page width / stack | `PageContainer.tsx` | `PAGE_CONTAINER_MAX_CLASS`, `master-page-stack` / section gaps |
| Sidebar | `frontend/src/master/components/Sidebar.tsx` | Master nav; fixed in `AppShell` left column |

**Layout invariants**

- One primary scroll: `AppShell` main column `overflow-auto`.  
- Master max-width applied at **PageContainer**, not at `AppShell` inner wrapper.  
- `variant="full"` used for support-style full-bleed hubs only where documented in screen matrix.

---

## RENTAL_LOCAL

| Layer | File | Behavior |
|-------|------|----------|
| Shell | `frontend/src/rental/App.tsx` | `AppShell variant="rental"` + `Sidebar` |
| Content | View components under `rental/components/` | No global Rental `PageContainer`; width capped by `AppShell` `max-w-[1440px]` |
| Top chrome | `TopBar.tsx`, sidebar collapse | Inside shell children; shares scroll with views |

**Layout invariants**

- Desktop sidebar + scrollable main; mobile sidebar behavior owned by Rental sidebar component.  
- Typography rhythm: `text-[13px]` on rental inner wrapper (AppShell).

---

## OPERATOR_LOCAL

| Layer | File | Behavior |
|-------|------|----------|
| Shell | `frontend/src/operator/OperatorShell.tsx` | **Does not use `AppShell`** — mobile-first column layout |
| Device gate | `useIsOperatorDevice` | Desktop shows `OperatorDesktopOnlyNotice` |
| Header | `OperatorHeader.tsx` | Top bar inside shell |
| Main | `OperatorShellInner` `<main>` | `max-w-lg` (phone), `md:max-w-none`; bottom padding `calc(4.5rem + env(safe-area-inset-bottom))` |
| Navigation | `OperatorBottomNav.tsx` | Fixed bottom tabs; independent of Master/Rental query navigation |
| Deep links | `OperatorDeepLinkBridge`, routes in `OperatorApp.tsx` | Path-based `/operator`, `/operator/vehicles/:id`, etc. |

**Layout invariants**

- `min-h-[100dvh]` + safe-area on main bottom inset.  
- Tab content swapped inside single main; no shared `PageContainer` pattern.  
- Operator may import Rental contexts (`FleetProvider`) — **data coupling only**, not layout.

---

## UX-001 layout note (product-management)

`ProductManagementView` uses `<PageContainer variant="standard">` **inside** the view. `master/App.tsx` mounts the view **without** an outer `PageContainer` — intentional to avoid nested containers. See [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md).

---

## Change checklist (agents)

| Change type | Authority updates |
|-------------|-------------------|
| `app-shell.tsx` | FEUX + MAUX + RENTUX inventories; SHARED_FOUNDATION_CHANGE |
| `PageContainer` / tokens | MAUX + FEUX |
| `OperatorShell.tsx` | OPUX only unless importing shared primitives |
| Single Master view layout | MAUX only unless touching shared patterns |