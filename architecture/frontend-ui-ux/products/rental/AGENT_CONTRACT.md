# Agent Contract — Rental UI/UX

## Mandatory read-first

1. `../../governance/CROSS_PRODUCT_CHANGE_POLICY.md`
2. `CURRENT_STATE.md`, `inventories/RENTAL_SCREEN_MATRIX.md`
3. `architecture/internationalization/` for user-facing copy

## Substantive change definition

View union, sidebar sections, fleet/vehicle chrome, finance/settings surfaces, pattern usage conventions, responsive rules. Non-substantive: typo-only docs.

## Same-PR duties

Update this authority; update foundation if shared contracts change; run rental + registry validators.

## Registry review

Mandatory: report `REGISTRY_REVIEWED: UPDATED|UNCHANGED` for **Rental UI/UX** (+ foundation if applicable).

## Ownership

| Owns | Does not own |
|------|----------------|
| Rental sidebar, view state, fleet hub UX | Master control plane |
| Rental screen matrix | Global tokens (foundation) |

## Prohibited

Silent cross-product doc edits; implying Master must adopt Rental layout without PROPOSED matrix entries.

## Production mutation prohibition

No production mutation without explicit authorization. Production UI status remains UNKNOWN until Gate A.

## Validation

```bash
bash architecture/frontend-ui-ux/products/rental/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```