# P2.2.58 — Tenant Billing Add-ons — Implementation Audit

**Date:** 2026-08-28
**Verdict:** A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RE-AUDIT
**Branch:** `cursor/p2258-tenant-billing-addons-i18n-3c10`
**Baseline:** `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f`
**Pre-flight:** PR #1382

## Summary

Localized production-mounted Tenant Billing Add-ons tab (read-only). Extended adapter with add-on name/status resolvers. Backend DTO additively exposes existing `status` machine. +12 EN/DE keys (8942→8954).

## Changed paths

| Path | Change |
|------|--------|
| `TenantBillingAddOnsTab.tsx` | Localized host chrome + adapter resolvers |
| `rental-tenant-billing-i18n.ts` | `resolveTenantBillingAddonName/StatusLabel` |
| `billing.types.ts` | Add `status` to addOns DTO |
| `tenant-subscription-overview.dto.ts` | Add `status` to backend DTO |
| `tenant-subscription-overview.mapper.ts` | Expose `status` in `resolveAddOnDtos` |
| `en.ts` / `de.ts` | +12 keys |
| `hardcoded-copy-guard.test.ts` | P258 enforce-clean |
| `rental-tenant-billing-addons-localization.test.tsx` | New |
| `tenant-subscription-overview.mapper.spec.ts` | New |
| `ChangesView.tsx` / `ArchitekturView.tsx` | Bookkeeping |

## Keys (+12)

`tenantBilling.addons.loadErrorTitle`, `empty.title`, `empty.body`, `key.VOICE_AGENT`, `key.AI_PACKAGE`, `key.WHATSAPP`, `status.ACTIVE`, `status.TRIALING`, `status.GRACE_PERIOD`, `status.SCHEDULED_CANCEL`, `status.PAUSED`, `status.INACTIVE`

Reused: `common.retry`, `tenantBilling.tab.addons`

## Scanner

Global 1407→1405, Rental 310→308, Finance/Billing 27→25 (−2 visible)

## Tenant Billing completion

Active mounted Tenant Billing i18n debt = **0**

Dead legacy Billing debt remains separately (BillingPaymentMethodCard, BillingStatusHero, etc.)

## Category E

**0** — presentation-only; additive DTO status exposure is non-semantic.
