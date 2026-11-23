# Agent Contract — Shared UI Design Foundation

## Mandatory read-first (non-optional)

For **any** frontend/UI work:

1. [`governance/CANONICAL_AUTHORITY_MAP.md`](./governance/CANONICAL_AUTHORITY_MAP.md)
2. [`README.md`](./README.md) (this module)
3. [`design-system/SHARED_DESIGN_SYSTEM.md`](./design-system/SHARED_DESIGN_SYSTEM.md) — **L0–L4** surface semantics
4. [`governance/CROSS_PRODUCT_CHANGE_POLICY.md`](./governance/CROSS_PRODUCT_CHANGE_POLICY.md)
5. [`governance/FIGMA_AND_VISUAL_PRECEDENCE.md`](./governance/FIGMA_AND_VISUAL_PRECEDENCE.md)
6. [`governance/FUTURE_DESIGN_CHANGE_POLICY.md`](./governance/FUTURE_DESIGN_CHANGE_POLICY.md) when task is redesign or shared token change
7. Relevant **product** authority: `products/{master-admin|rental|operator}/AGENT_CONTRACT.md`, `CURRENT_STATE.md`, screen matrix
8. [`architecture/internationalization/`](../internationalization/) when touching user-visible copy

## Before coding (mandatory actions)

- Identify affected product surfaces (Master / Rental / Operator).
- Identify shared token and primitive dependencies (`theme.css`, `ui`, `patterns`).
- Inspect current implementation; do not regenerate screens without cause.
- Preserve light/dark mode and responsive contracts.
- Document justified visual deviations in product evidence or contradictions.
- Classify change: `PRODUCT_LOCAL_CHANGE` vs `SHARED_FOUNDATION_CHANGE`.

## Change routing

| Change type | Update |
|-------------|--------|
| `theme.css`, shared `ui`/`patterns`, global a11y/motion | **This foundation** + impact analysis for all products |
| Master shell, nav, hubs | **Master Admin UI/UX** authority only |
| Rental views, fleet nav | **Rental UI/UX** authority only |
| Operator mobile shell | **Operator UI/UX** authority only |

## Prohibited

- New parallel CSS framework or duplicate design system package without owner approval
- Duplicating i18n authority
- Editing sibling product authority “for convenience” under PRODUCT_LOCAL_CHANGE
- Claiming full visual isolation while shared tokens remain globally scoped (document coupling honestly)
- Using `docs/ui/*` or `frontend/figma-*` as current authority

## Validation

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Substantive change definition

Token semantics, shared primitive contracts, cross-product impact rules, consumer inventory updates, agent routing governance.

## Substantive change reporting

Report `registry_review` / `REGISTRY_REVIEWED: UPDATED|UNCHANGED` for **Shared UI Design Foundation** and every affected product UI/UX module.

## Production mutation prohibition

No Production VPS UI inspection or mutation in default agent scope without explicit owner authorization. Production UI verification status remains **NOT_CLAIMED** unless evidenced in `PRODUCTION_BASELINE.md`.