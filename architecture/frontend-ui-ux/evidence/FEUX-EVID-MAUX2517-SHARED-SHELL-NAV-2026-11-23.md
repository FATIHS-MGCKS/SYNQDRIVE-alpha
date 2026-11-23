# FEUX — PR #2517 shared shell nav cross-product impact

**Date:** 2026-11-23  
**Operation:** `SYNQDRIVE_MAUX_PR2517_FINAL_REVIEW_GATES`  
**PR:** [#2517](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2517)  
**Change class:** `SHARED_FOUNDATION_CHANGE` (bounded) + `PRODUCT_LOCAL_CHANGE` (Master sidebar chrome)

## Changed shared artifacts

| File | Change | Blast radius |
|------|--------|--------------|
| `frontend/src/components/shell/nav-utils.ts` | `subNavItemClass`: `min-h-[36px]`, `py-[8px]` (aligned with primary rows) | **Master** + **Rental** sidebars |
| `frontend/src/components/shell/nav-primitives.tsx` | `CollapsedNavTooltip`: `group-focus-within:opacity-100` | **Master** + **Rental** collapsed rails |

## Cross-product matrix

| Product | Imports shared files? | Expected runtime effect | Operator |
|---------|---------------------|-------------------------|----------|
| **Master Admin** | yes (`Sidebar.tsx`) | Sub-nav height parity; keyboard tooltips when collapsed | — |
| **Rental** | yes (`rental/components/Sidebar.tsx`) | Same sub-nav geometry + tooltip focus path | **No import** — no sidebar shell dependency |
| **Operator** | no `nav-utils` / `nav-primitives` | None | **NO_IMPACT** |

## Rental regression evidence

- Vitest: `frontend/src/components/shell/shell-nav-shared-regression.test.ts` (sub-nav class contract + Rental import guard)
- Vitest: `nav-primitives.test.tsx`
- No Rental source edits in #2517

## Propagation policy

Per `CROSS_PRODUCT_CHANGE_POLICY.md`: intentional shared rhythm fix — not silent; documented here and in FEUX `CHANGE_LEDGER`.