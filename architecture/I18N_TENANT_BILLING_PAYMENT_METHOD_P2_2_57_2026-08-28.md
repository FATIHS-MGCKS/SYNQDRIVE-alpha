# I18N — Tenant Billing Payment Method (P2.2.57)

**Date:** 2026-08-28
**Baseline:** `9b466c4ac930afe752dcd14a872b320f240537f3` (P2.2.56 merge)
**Branch:** `cursor/p2257-tenant-billing-payment-method-i18n-3c10`

## Mount topology

```
Settings → Billing → billingSubTab=payment-method
  → BillingTab
    → TenantBillingPaymentMethodTab
      → useBillingPaymentMethodActions (setDefault, detach)
      → TenantPaymentMethodsSection
        → billing-stripe-ui (not_configured panel)
        → rental-tenant-billing-i18n display/state adapters
  Data: useBillingPaymentMethods → GET /billing/payment-methods
  Portal: BillingTab → useBillingStripeActions → POST /billing/stripe/customer-portal → location.assign
```

## Locale flow

`useLanguage().locale` + `t()` → `rental-tenant-billing-i18n.ts`:

- `resolvePaymentMethodBillingStateLabel`
- `formatPaymentMethodDisplayLocalized`
- `resolveStripeStateLabel` / `resolveStripeStateHint`
- `resolvePaymentMethodActionErrorMessage` / `resolveStripePortalActionErrorMessage`

## Frozen semantics (Category E = 0)

| Domain | Freeze |
|--------|--------|
| Payment method `id` | React key + mutation path param |
| `brand`, `last4`, `typeLabel`, `bankName`, `mandateStatusLabel` | Raw provider display |
| `expMonth` / `expYear` | Raw; host expiry prefix only localized |
| `billingState` machine + tone | Unchanged |
| `isDefault` / detach eligibility | Unchanged |
| Set-default | `POST .../set-default`, `{}` payload |
| Detach | `DELETE .../payment-methods/{id}` |
| Portal | `returnUrl = origin + pathname + ?settingsTab=billing`; opaque `res.url` |
| Permissions | `billing.read` / `billing.write` predicates unchanged |

## Error ownership

| Action | Strategy |
|--------|----------|
| Set-default | `mapBillingLoadError` — raw when unmapped |
| Detach | `getErrorMessage` raw wins; host `detachFailed` fallback |
| Portal | Host codes `notConfigured` / `openFailed` (baseline flattening preserved) |

## Enforce-clean scope (6 paths)

- `TenantBillingPaymentMethodTab.tsx`
- `TenantPaymentMethodsSection.tsx`
- `tenant-payment-methods.utils.ts`
- `billing-stripe-ui.ts`
- `useBillingPaymentMethodActions.ts`
- `useBillingStripeActions.ts`

## Tests

- `rental-tenant-billing-payment-method-localization.test.tsx`
- `useBillingPaymentMethodActions.test.ts`
- `useBillingStripeActions.test.ts`
- `tenant-payment-methods.utils.test.ts`
