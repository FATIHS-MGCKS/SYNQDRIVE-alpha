# End-customer payments — Tenant billing UI (Prompt 11)

**Date:** 2026-07-14  
**Location:** Administration → Billing & Subscription → sub-tab **Customer payments & payouts**

## Separation

| Sub-tab | Purpose |
|---------|---------|
| SynqDrive subscription | Existing SaaS billing (unchanged) |
| Customer payments & payouts | Stripe Connect onboarding + payout metadata |

## UI states

`NOT_STARTED`, `ONBOARDING`, `RESTRICTED`, `ACTIVE`, `DISABLED`, `FEATURE_DISABLED`, `NO_ACCESS`

## Permissions (frontend)

- `payments-connect.read` — view status
- `payments-connect.manage` — setup / continue onboarding / sync
- `ORG_ADMIN` bypass via `hasPermission`

## API wiring

`api.paymentsConnect.*` → `/organizations/:orgId/payments/connect/*`

## Master platform settings

Removed cosmetic Stripe connect/disconnect toggle from `PlatformSettingsView` — replaced with informational notice pointing to Master Billing Control Center and tenant Connect sub-tab.
