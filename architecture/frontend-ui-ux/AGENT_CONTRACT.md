# Agent Contract — Shared UI Design Foundation

## Mandatory read-first

1. [`governance/CROSS_PRODUCT_CHANGE_POLICY.md`](./governance/CROSS_PRODUCT_CHANGE_POLICY.md)
2. Product authority under change: `products/{master-admin|rental|operator}/README.md`
3. [`architecture/internationalization/`](../internationalization/) when touching user-visible copy

## Change routing

| Change type | Update |
|-------------|--------|
| `theme.css`, shared `ui`/`patterns`, global a11y/motion | **This foundation** + impact analysis for all products |
| Master shell, nav, hubs | **Master Admin UI/UX** authority only |
| Rental views, fleet nav | **Rental UI/UX** authority only |
| Operator mobile shell | **Operator UI/UX** authority only |

## Prohibited

- New parallel CSS framework or duplicate design system package
- Duplicating i18n authority
- Editing sibling product authority “for convenience” under PRODUCT_LOCAL_CHANGE
- Claiming full visual isolation while shared tokens remain globally scoped (document coupling honestly)

## Validation

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Substantive change reporting

Report `registry_review` for **Shared UI Design Foundation** and every affected product UI/UX module.