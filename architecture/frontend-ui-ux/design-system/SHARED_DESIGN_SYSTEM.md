# Shared Design System — Code SSOT (CONFIRMED @ `413175e8c`)

This document **indexes** canonical implementation. It does **not** duplicate full token lists from `theme.css`.

## Authority chain

| Priority | Source |
|----------|--------|
| 1 | `frontend/src/styles/theme.css` |
| 2 | `frontend/src/styles/LIQUID_GLASS_SYSTEM.md` |
| 3 | `frontend/src/styles/THEME_COLOR_CONTRACT.md` |
| 4 | `frontend/src/styles/SURFACE_INSPIRATION_AUDIT.md` (policy) |
| 5 | `frontend/src/components/patterns/` + `frontend/src/components/ui/` |

## Theme modes

- **Runtime:** `frontend/src/context/AppThemeContext.tsx` — preference `light` | `dark` | `system`; class `.dark` on root.
- **CONFIRMED** for all three products (Operator observes `document.documentElement` class).

## Typography & spacing (summary)

- Root `--font-size: 14px`; `--font-sans` / `--font-display`: Manrope; `--font-mono`: Geist Mono.
- Scale: `--text-display-lg` through `--text-label` (see theme.css header).
- Spacing: `--space-xs` … `--space-4xl`; Master additions `--master-shell-max-standard` (1400px), `--master-shell-max-wide` (1600px).

## Color & status

- Brand: `#4F86E8` (`--brand`, hover/active variants).
- Semantic status: `--status-positive`, `--status-watch`, `--status-warning`, `--status-critical`, `--status-info`, `--status-nodata`, `--status-ai` (+ `-soft` tints).
- **Rule:** Use `StatusChip` / `toneForStatus` patterns — avoid ad-hoc tailwind status colors in new work.

## Surfaces L0–L4

| Level | Role | Canonical classes |
|-------|------|-------------------|
| L0 | Solid card | `.surface-solid`, `.sq-card`, shadcn `Card` |
| L1 | Premium solid | `.surface-premium`, `.sq-card-premium`, `DataCard` |
| L1e | Interactive lift | `.surface-elevated`, `.sq-card-elevated` |
| L2 | Frosted chrome | `.surface-frosted`, `.sq-glass` — small chrome only |
| L3 | Map liquid HUD | `.sq-map-liquid-*` — map imagery only |
| L4 | Overlay scrim | dialog/sheet backdrops |

**Liquid Glass is not a general skin** (CONFIRMED policy).

## Buttons & forms

- **Buttons:** `frontend/src/components/ui/button.tsx` — variants map to `.sq-3d-btn--{primary,neutral,destructive,…}`; ghost/link exceptions.
- **Forms:** shadcn inputs (`input`, `select`, `checkbox`, …) with tokenized borders/ring.
- **Dialogs:** `patterns/app-dialog.tsx` stacking contract; Radix `Dialog`/`Sheet`/`Drawer` under `components/ui`.

## Tables

- **Pattern:** `patterns/data-table.tsx` + table primitives in `components/ui/table.tsx`.
- Master hubs often compose `MasterTableShell` + `DataTable`.

## Animation & interaction

| Token / rule | Location |
|--------------|----------|
| Durations | `--dur-fast` 140ms, `--dur-base` 220ms, `--dur-slow` 360ms |
| Easing | `--ease-out-soft`, `--ease-in-out-soft`, `--ease-spring-in` |
| Utilities | `.animate-fade-up`, `.animate-online-pulse`, trips map animations |
| Reduced motion | `theme.css` `@media (prefers-reduced-motion: reduce)` — global neuter |
| Reduced transparency | `@supports not (backdrop-filter)` + dedicated reduced-transparency rules |

## Accessibility (code-level, CONFIRMED)

- Master: skip link in `MasterAdminShell`; `MasterPageTabs` keyboard handlers + tests.
- Radix primitives: focus traps for modals.
- **Gap:** Master DE-only strings / partial aria labels (see i18n + FEUX gaps).

## Shared import graph

See [`../inventories/SHARED_COMPONENTS.md`](../inventories/SHARED_COMPONENTS.md).

## Global change impact

**Any** change to `theme.css` or shared `Button`/`Card`/`StatusChip` affects **Master, Rental, and Operator** unless scoped with product-specific wrappers (discouraged for tokens).