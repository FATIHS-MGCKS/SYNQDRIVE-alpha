# Agent Contract — Frontend UI/UX & Design System

## Mandatory read-first sequence

1. Root [`AGENTS.md`](../../AGENTS.md)
2. [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) — registry row for this module
3. This authority `README.md`, `CURRENT_STATE.md`, `design-system/SHARED_DESIGN_SYSTEM.md`
4. Product profile for the surface under change: `products/{master-admin|rental|operator}/PRODUCT_PROFILE.md`
5. [`architecture/internationalization/`](../internationalization/) when touching user-visible copy
6. Canonical CSS contracts under `frontend/src/styles/*.md` — **do not contradict**

## Substantive change definition

Substantive for this authority: token semantics, surface levels, shared pattern contracts, cross-product shell boundaries, Master page framework rules, product comparison decisions, animation/a11y baselines, or registry facts.

**Not substantive:** typo in authority-only doc with no contract change.

## Same-PR duties (when product code changes UI)

- Update this authority (relevant artifacts only)
- Cross-check i18n authority if copy/locale affected
- Append `research/CHANGE_LEDGER.md`
- Run `bash architecture/frontend-ui-ux/scripts/validate-graph.sh`
- Run `bash architecture/scripts/validate-module-registry.sh`
- Report `REGISTRY_REVIEWED` for Frontend UI/UX and any other affected modules

## Ownership boundaries

| Owns | Does not own |
|------|----------------|
| Shared tokens/surfaces documentation | Translation catalogs (i18n) |
| Product UI profiles (Master/Rental/Operator) | Backend DTO presentation |
| Pattern/shell dependency matrix | Feature-domain health/trip UI logic |
| Rental↔Master comparison proposals | Implementing redesign unless tasked |

## Prohibited

- Creating parallel CSS or component authorities
- Duplicating i18n authority files or locale registries
- Claiming `AUTHORITY_ACTIVE` without Gate A Production UI evidence
- Silent `AUTHORITY_ACTIVE` promotion
- Auto-copying Rental navigation into Master

## Validation commands

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Completion report (substantive)

Include `ARCHITECTURE_GOVERNANCE` with `registry_review` for **Frontend UI/UX & Design System** and cross-modules (e.g. i18n if copy contract cited).