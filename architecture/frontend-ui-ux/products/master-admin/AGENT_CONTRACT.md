# Agent Contract — Master Admin UI/UX

## Mandatory read-first sequence

1. `../../governance/CROSS_PRODUCT_CHANGE_POLICY.md`
2. `../../README.md` (Shared UI Design Foundation)
3. This authority: `README.md`, `CURRENT_STATE.md`, `inventories/MASTER_SCREEN_MATRIX.md`
4. `architecture/internationalization/` when touching user-visible Master chrome copy

## Substantive change definition

Substantive for Master UI/UX: shell/nav contract, hub URL params, page framework rules, Master-local component ownership, accessibility/i18n remediation in Master tree, screen matrix updates, graph/decisions.

Not substantive: typo-only authority edits.

## Same-PR duties

- Update this authority (relevant artifacts)
- If shared tokens/primitives touched: update **Shared UI Design Foundation** + impact note
- Append `research/CHANGE_LEDGER.md`
- Run `bash architecture/frontend-ui-ux/products/master-admin/scripts/validate-graph.sh`
- Run `bash architecture/scripts/validate-module-registry.sh`

## Registry synchronization duty

Re-read registry overview row **Master Admin UI/UX** + detail section. Update registry only when module metadata facts change.

## Mandatory final registry-review result

Report `REGISTRY_REVIEWED: UPDATED|UNCHANGED` with before/after `AUDIT_IN_PROGRESS` and reason for **Master Admin UI/UX** and **Shared UI Design Foundation** when shared contracts change.

## Ownership boundaries

| Owns | Does not own |
|------|----------------|
| Master shell, sidebar, hubs, page framework | `theme.css`, shared `ui`/`patterns` (foundation) |
| Master screen matrix, Master UX gaps | Rental/Operator nav |
| Master UX decisions | i18n catalogs |

## Prohibited

- Silent edits to sibling product authorities under PRODUCT_LOCAL_CHANGE
- Claiming Production verification without `PRODUCTION_BASELINE.md` evidence
- Copying Rental sidebar/layout wholesale (see MAUX-DEC-CONTROL-PLANE-001)

## Production mutation

Production UI reads require separate owner authorization; default **read-only** audit only.

## Validation commands

```bash
bash architecture/frontend-ui-ux/products/master-admin/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Completion report

Include `ARCHITECTURE_GOVERNANCE` with `registry_review` for affected UI modules.