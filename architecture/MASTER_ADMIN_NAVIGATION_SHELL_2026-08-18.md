# Master Admin Navigation Shell

**Date:** 2026-08-18

## Overview

Master Admin uses a config-driven sidebar (`frontend/src/master/navigation/`) aligned with the canonical blueprint (`docs/ui/master-admin-canonical-navigation-blueprint.md`).

## URL contract

- Primary param: `?view=<viewId>` (legacy `masterView` still read on load)
- Org detail: `?view=organizations&orgId=<uuid>`
- Settings: `?view=settings&settingsTab=general|email|integrations`
- Legacy redirects: `hm-compatibility`, `health-tracking`, `trip-detection-logic`, `performance-logic`, `settingsTab=monitoring`

## Shell components

| Component | Role |
|-----------|------|
| `Sidebar.tsx` | Product nav + control footer |
| `MasterAccountSheet.tsx` | Account / theme / logout sheet |
| `useMasterNavBadges.ts` | Operational badges from existing APIs |
| `App.tsx` | View state + `pushState` / `popstate` |

## Groups (8)

Overview → Mandanten & Nutzer → Flotte → Abrechnung → Konnektivität → Partner & Services → Plattformbetrieb (default expanded) → Entwicklung & Dokumentation (default collapsed)

## Rental parity

Collapsed rail (52px), `CollapsedNavTooltip`, `sq-sidebar-footer`, auto-expand active group, `focus-visible` on nav items.
