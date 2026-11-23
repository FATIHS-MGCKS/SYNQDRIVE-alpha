# MAUX UX-012 — Master Admin Sidebar V1

**Date:** 2026-11-23  
**Change class:** PRODUCT_LOCAL_CHANGE (Master Admin UI/UX only)  
**Decision:** MAUX-DEC-SIDEBAR-V1-001  
**Registry views:** 24 before / 24 after (unchanged ids)

## Scope

- `frontend/src/master/navigation/master-nav.{config,types,active}.ts`
- `frontend/src/master/components/Sidebar.tsx`
- `frontend/src/master/navigation/master-nav-i18n.ts`
- `frontend/src/i18n/translations/master.sidebar.v1.*.ts` (9 locales)
- Vitest: `master-nav-sidebar-v1.test.ts` + updated nav regression tests

## Owner target structure (summary)

| Group | Default | Notes |
|-------|---------|-------|
| Dashboard | standalone | Top entry |
| Verwaltung | expanded | Orgs, vehicles, users/roles, devices/PDI, logbook |
| Produkte & Business | collapsed | Product, billing, prospects; Partner folder (parts, insurances) |
| Plattform | collapsed | Platform ops; integrations parent + HM / service clients / voice |
| Intelligence | collapsed | VSI, APDS |
| Engineering | collapsed | Tire, battery shadow/HV, architecture, changes |
| Footer | fixed | System status, Support (dynamic badge), account, logout, collapse |

## Billing-only

`getVisibleMasterNavItemIds()` unchanged: `dashboard` + `billing` only; intelligence and other MASTER_ADMIN items denied.

## Validation

- Vitest master nav suites: PASS
- `npm run i18n:check`: PASS
- `npm run build`: PASS
- MAUX `validate-graph.sh`: run at PR SHA
- Playwright sidebar visual: NOT_RUN

## Limitations

- No production authenticated UI session; bounded code + unit evidence only.