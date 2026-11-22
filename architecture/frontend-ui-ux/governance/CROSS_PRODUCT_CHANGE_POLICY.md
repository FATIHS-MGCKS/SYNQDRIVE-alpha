# Cross-Product UI Change Policy (Mandatory Governance)

**Authority:** Shared UI Design Foundation (`architecture/frontend-ui-ux/`)  
**Status:** VALIDATED (owner decision, PR #2490 remediation, 2026-11-22)  
**Epistemic note:** Rules are **governance**; runtime still **couples** via shared `theme.css`, `components/ui`, and `components/patterns` until implementation isolation improves.

## PRODUCT_LOCAL_CHANGE

Changes governed by **Master Admin UI/UX**, **Rental UI/UX**, or **Operator UI/UX** must **not** require updates to the other product authorities or their inventories unless:

1. A **shared foundation contract** changed, or  
2. A **documented import dependency** from `inventories/SHARED_COMPONENTS.md` (foundation) or product-local import lists changed.

## SHARED_FOUNDATION_CHANGE

Any change to design tokens, shared primitives, pattern contracts, or global motion/a11y baselines in:

- `frontend/src/styles/theme.css` and named style contracts  
- `frontend/src/components/ui/**`  
- `frontend/src/components/patterns/**`  
- Shared shell building blocks consumed by multiple products  

requires:

1. **Impact analysis** listing Master, Rental, and Operator consumers (CONFIRMED import graph where possible).  
2. Update to **Shared UI Design Foundation** authority (`CHANGE_LEDGER`, evidence as needed).  
3. **Cross-product validation plan** (tests or explicit manual matrix) before merge when visual behavior may shift.

## NO_SILENT_PROPAGATION

A visual change **intended only for Master** must not rely on unscoped global token edits. Prefer product-scoped CSS, product-local layout components, or explicit tokens documented as Master-only (**ADAPT**), acknowledging current technical debt where global classes still leak.

## PRODUCT_SPECIFIC_EVOLUTION

Master, Rental, and Operator may **diverge visually** where product UX requirements justify it. Divergence must be recorded in the **owning product authority**, not only in shared foundation docs.

## Registry map

| Governance layer | Registry module | Authority path |
|------------------|-----------------|----------------|
| Shared foundation | Shared UI Design Foundation | `architecture/frontend-ui-ux/` |
| Master | Master Admin UI/UX | `architecture/frontend-ui-ux/products/master-admin/` |
| Rental | Rental UI/UX | `architecture/frontend-ui-ux/products/rental/` |
| Operator | Operator UI/UX | `architecture/frontend-ui-ux/products/operator/` |

## Supersession

**SUPERSEDES:** single-module “three profiles only” model (`FEUX-DEC-PLATFORM-PROFILES-001`).  
**Successor decision:** `FEUX-DEC-INDEPENDENT-AUTHORITIES-002`.