# Future Design Change Policy (Approved Redesigns)

**Status:** VALIDATED (governance)  
**Applies to:** token changes, new visual language, hub layout overhauls, cross-product pattern changes

## Pipeline (mandatory)

```
OWNER_APPROVAL
  → IMPACT_ANALYSIS (Master + Rental + Operator consumers)
  → DESIGN_DECISION (DECISION_REGISTER + evidence)
  → AUTHORITY_UPDATE (foundation and/or product authorities, inventories)
  → IMPLEMENTATION (frontend only when scoped)
  → TESTS (product + shared; i18n:check when copy changes)
  → PR_REVIEW
  → MERGE
```

No step may be skipped for **shared foundation** changes. Product-local visual divergence is allowed when documented only in the **owning** product authority.

## Shared token changes

Any edit to `theme.css`, global surface classes, or shared `Button` / `Card` / `StatusChip` / dialog pattern contracts requires:

1. Explicit `SHARED_FOUNDATION_CHANGE` declaration.
2. Foundation `CHANGE_LEDGER` + evidence row when substantive.
3. Listed blast radius for Master, Rental, and Operator (imports from `inventories/SHARED_COMPONENTS.md` where possible).
4. Light/dark and `prefers-reduced-motion` check noted in PR.

## Figma-led redesigns

When owner approves a Figma-led redesign:

1. Name the Figma artifact and scope (product + hubs).
2. Update `FIGMA_AND_VISUAL_PRECEDENCE.md` applicability only if policy itself changes; otherwise record in product evidence.
3. Version the change through `DECISION_REGISTER` (PROPOSED → VALIDATED when merged).
4. Do **not** claim WCAG certification or production UI verification without separate evidence.

## Reversibility

Authority updates are **append-only** for decisions and evidence. Supersede prior docs with explicit `SUPERSEDED` pointers — do not rewrite frozen ledger snapshots in place.

## Validation

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/master-admin/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/rental/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/operator/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```