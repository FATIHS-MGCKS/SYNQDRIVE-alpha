# Agent Contract — Operator UI/UX

## Mandatory read-first

1. `../../governance/CANONICAL_AUTHORITY_MAP.md`
2. `../../governance/FIGMA_AND_VISUAL_PRECEDENCE.md`
3. `../../design-system/SHARED_DESIGN_SYSTEM.md`
4. `../../governance/CROSS_PRODUCT_CHANGE_POLICY.md`
5. `CURRENT_STATE.md`, `inventories/OPERATOR_SCREEN_MATRIX.md`

## Substantive change definition

Bottom nav, mobile shell, sheet flows, touch/safe-area contracts, operator-local components.

## Same-PR duties

Update this authority; foundation if shared UI touched; `validate-graph.sh` + `validate-module-registry.sh`.

## Registry review

Mandatory: report `REGISTRY_REVIEWED: UPDATED|UNCHANGED` for **Operator UI/UX**.

## Ownership

| Owns | Does not own |
|------|----------------|
| Operator shell, tabs, handover/damage UX | Rental desktop fleet UI |
| Mobile responsive rules | Master hubs |

## Prohibited

Treating Operator as miniature Rental; undocumented global token changes.

## Production mutation prohibition

No Production writes without separate owner authorization.

## Validation

```bash
bash architecture/frontend-ui-ux/products/operator/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```