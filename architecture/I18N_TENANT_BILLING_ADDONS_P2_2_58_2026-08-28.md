# I18N — Tenant Billing Add-ons (P2.2.58)

**Date:** 2026-08-28
**Baseline:** `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` (P2.2.57 merge)
**Branch:** `cursor/p2258-tenant-billing-addons-i18n-3c10`

## Mount topology

```
Settings → Billing → billingSubTab=addons
  → TenantBillingAddOnsTab
      ← overview.addOns from useBillingSubscriptionOverview
      ← api.billing.orgSubscriptionOverview
      ← resolveAddOnDtos(entitlements)
```

## DTO additive status exposure

Backend `TenantSubscriptionAddOnDto` adds read-only `status` (existing `BillingEntitlementAccessStatus` machine). Preserves `name`, `statusLabel`, `active`.

## Frontend presentation

- Known add-on keys (`VOICE_AGENT`, `AI_PACKAGE`, `WHATSAPP`) → `tenantBilling.addons.key.*`
- Known statuses → `tenantBilling.addons.status.*`
- Unknown key → raw `name`, then `key`
- Unknown status → raw `statusLabel`, then `status`
- Load error title localized; `overviewQuery.error` raw pass-through
- Empty state localized; `common.retry` reused

## Frozen semantics

- `addon.active` filter unchanged
- Ordering unchanged
- No mutations, pricing, provider flows, or entitlement logic in frontend

## Guardrails

- P258 enforce-clean: `TenantBillingAddOnsTab.tsx` — 0 findings
- Category E = 0

## Completion

Active mounted Tenant Billing sub-tabs (Overview, Tariff & Vehicles, Invoices, Payment Method, Add-ons) are localized. Dead legacy billing cards remain out of scope.
