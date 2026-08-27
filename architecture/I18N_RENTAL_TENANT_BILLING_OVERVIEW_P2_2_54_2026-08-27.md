# P2.2.54 — Rental Tenant Billing Overview i18n Architecture

**Date:** 2026-08-27
**Baseline:** `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323` (post-P253 merge #1355)
**Pre-flight:** PR #1358 — Verdict B (split; overview selected)

## Runtime flow

```
SettingsView (settingsTab=billing)
  └─ BillingTab (useLanguage)
       ├─ TenantSubscriptionTabBar → resolveTenantBillingTabLabel
       ├─ TenantBillingProblemPanel (host copy only)
       └─ TenantBillingOverviewTab (read-only)
            ├─ tenant-billing-overview.utils (predicates unchanged)
            ├─ billing.utils formatMoneyCents/formatDateDe → rental-tenant-billing-i18n
            └─ API raw: plan.name, statusLabel, billingIntervalLabel, money.formatted, warnings, actions
```

## Scope (P254)

| Path | Role |
|------|------|
| `BillingTab.tsx` | Shell chrome, header badge threading |
| `tenant-billing-navigation.ts` | Machine tab IDs only |
| `TenantSubscriptionTabBar.tsx` | Localized tab labels |
| `TenantBillingOverviewTab.tsx` | Read-only overview presentation |
| `TenantBillingProblemPanel.tsx` | Problem host copy + CTAs |
| `billing.utils.ts` | Locale-threaded money/date fallbacks |
| `tenant-billing-overview.utils.ts` | Badge/invoice helpers with optional `t` |
| `rental-tenant-billing-i18n.ts` | Presentation adapter |

## Frozen

- Tariff/Vehicles, Add-ons, Invoices, Payment Method tabs
- `CustomerPaymentsTab`, legacy unmounted billing components
- P253–P249 invoice surfaces
- Subscription machine IDs, problem predicates, Stripe callbacks, permissions
- API/provider raw labels (`statusLabel`, `billingIntervalLabel`, `warning.message`, `availableActions[].label`, `money.formatted`)

## Keys

- **New:** 35 `tenantBilling.*` (+8802 → 8837 EN+DE)
- **Reused:** `invoiceLineItem.summary.{net,tax,gross}`, `tenantBilling.tab.paymentMethod`, `billing.customerPayments.orgMissingTitle`, `common.{retry,loading,noData}`

## Guardrails

`P254_ENFORCE_CLEAN_EXACT` — 8 paths, 0 findings target.

## Tests

`rental-tenant-billing-overview-localization.test.tsx` — enforce-clean, tab IDs, raw provider fields, money/date locale, same-mount DE↔EN.

## P255 forecast

Tenant Billing — Tariff & Vehicles (`TenantBillingTariffVehiclesTab` and children).
