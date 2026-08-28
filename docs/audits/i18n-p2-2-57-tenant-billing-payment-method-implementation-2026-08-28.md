# P2.2.57 — Tenant Billing Payment Method — Implementation Audit

**Date:** 2026-08-28
**Verdict:** A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RE-AUDIT
**Branch:** `cursor/p2257-tenant-billing-payment-method-i18n-3c10`
**Baseline:** `9b466c4ac930afe752dcd14a872b320f240537f3`
**Pre-flight:** PR #1376 (verdict A — GO)

## Summary

Localized production-mounted **Tenant Billing Payment Method** tab on Settings → Billing → `billingSubTab=payment-method`. Presentation-only; payment method identity, provider raw fields, billingState/default machines, mutation endpoints/payloads, portal URL/return URL, and permissions frozen.

| Metric | Baseline | P257 final |
|--------|----------|------------|
| EN keys | 8915 | **8942** |
| DE keys | 8915 | **8942** |
| New keys | — | **27** |
| Reused keys | — | **5** |
| Global scanner | 1413 | **1407** (−6) |
| Rental scanner | 316 | **310** (−6) |
| Finance/Billing scanner | 33 | **27** (−6) |
| P257 enforce-clean (6 paths) | ~21 active | **0** |
| P256 enforce-clean | 0 | **0** |

## Key accounting

**New (`tenantBilling.paymentMethod.*`):** 27 EN+DE keys

- `section.*` (2), `header.defaultConfigured`, `empty.*` (2), `action.*` (2), `badge.default`, `attention.updateRequired`, `loadErrorTitle`
- `state.*` (4): ready, missing, requiresAction, failed
- `stripe.*` (6): configured/prepared/notConfigured label + hint
- `display.*` (4): expiryPrefix, mandatePrefix, fallback card/bank
- `error.*` (3): detachFailed, portalNotConfigured, portalOpenFailed

**Reused (5):** `common.retry`, `common.loading`, `common.remove`, `tenantBilling.problem.openPortal`, `tenantBilling.tab.paymentMethod`

**Key budget note:** 27 keys — one above ideal (≤20) and acceptable (21–26) band; justified by 4 billingState labels + 6 stripe state strings + 2 distinct portal host errors that cannot merge without semantic loss.

## Scope

**Included:**

- `TenantPaymentMethodsSection.tsx` — section chrome, cards, actions
- `TenantBillingPaymentMethodTab.tsx` — load error + action error resolution
- `tenant-payment-methods.utils.ts` — tone/attention predicates only
- `billing-stripe-ui.ts` — optional `t` param; legacy German path for dead components
- `useBillingPaymentMethodActions.ts` — detach error discriminated union
- `useBillingStripeActions.ts` — portal error discriminated union
- `rental-tenant-billing-i18n.ts` — payment method adapters
- `BillingTab.tsx` — portal error resolution only (minimal threading)

**Frozen / excluded:**

- P256 invoices, P255A/B tariff/vehicles, P254 overview/shell
- `TenantBillingAddOnsTab`, dead legacy payment cards, `CustomerPaymentsTab`

## Freeze certifications

- `id` / `brand` / `last4` / `typeLabel` / `bankName` / `mandateStatusLabel` — raw
- `billingState` machine + `paymentMethodBillingStateTone` — unchanged
- `isDefault` badge + sole-default detach disable — unchanged
- Set-default / detach endpoints + IDs — unchanged
- Portal `returnUrl` + `window.location.assign(url)` — unchanged
- Detach raw provider error preserved; host detach/portal fallbacks localized
- Same-mount DE→EN→DE — subTab, raw fields, loadingId preserved; 0 locale-triggered mutations
- P256 semantic diff — zero on invoice paths
- Category E — **0**

## Tests

- `rental-tenant-billing-payment-method-localization.test.tsx` — enforce-clean, raw fixtures, same-mount, React identity
- `useBillingPaymentMethodActions.test.ts` — exact IDs, raw detach error, host fallback
- `useBillingStripeActions.test.ts` — exact portal URL, host errors, loading
- Updated `tenant-payment-methods.utils.test.ts`
- P256 invoice regression tests — pass

## Progress (recomputed)

| Methodology | Estimate |
|-------------|----------|
| Legacy campaign (total scanner debt vs ~2044 P2.2.8 baseline) | **~31.2% debt cleared** |
| Mounted-production weighted (#1376 methodology) | **~93.8%** |
| Recommended canonical metric | **Mounted-production weighted** — reflects enforce-clean slice completion on active rental surfaces |

**Remaining mounted Tenant Billing debt:** ~2 (Add-ons)
**Next slice:** P2.2.58 — Tenant Billing Add-ons

## Changes / Architektur

**Updated:** `ChangesView.tsx`, `ArchitekturView.tsx`, `architecture/I18N_TENANT_BILLING_PAYMENT_METHOD_P2_2_57_2026-08-28.md`
