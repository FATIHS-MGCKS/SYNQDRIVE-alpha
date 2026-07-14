# End-customer payments — Stripe Connect onboarding API (Prompt 10)

**Date:** 2026-07-14  
**Depends on:** Prompt 9 Connect adapter (`StripeConnectAccountService`)

## Routes

| Method | Path | Permission |
|--------|------|------------|
| `POST` | `/api/v1/organizations/:orgId/payments/connect/account` | `payments.connect.manage` |
| `POST` | `/api/v1/organizations/:orgId/payments/connect/onboarding-link` | `payments.connect.manage` |
| `GET` | `/api/v1/organizations/:orgId/payments/connect/status` | `payments.connect.read` |
| `POST` | `/api/v1/organizations/:orgId/payments/connect/refresh` | `payments.connect.manage` |

Guard stack: `OrgScopingGuard` → `PaymentsFeatureGuard` → `PaymentsPermissionGuard`

## Return URL protection

- Optional `returnUrl` / `refreshUrl` in onboarding-link body
- Validated via `resolveAllowedConnectRedirectUrl` against `app.corsOrigins` and configured `STRIPE_CONNECT_*_URL` / portal fallback
- Arbitrary client origins rejected (`BadRequestException`)
- Account Link URL returned ephemerally — not persisted or logged

## Status semantics

- `GET status` reads **persisted** `OrganizationPaymentAccount` only (no live Stripe on read)
- `POST refresh` syncs from Stripe API and updates DB
- Stripe redirect alone does **not** mark account ACTIVE — status mapping requires `chargesEnabled`/`payoutsEnabled`/`detailsSubmitted` from Stripe sync

## Response fields (safe subset)

`onboardingStatus`, `detailsSubmitted`, `chargesEnabled`, `payoutsEnabled`, `disabledReason`, `requirementsCurrentlyDue`, `requirementsPastDue`, `bankAccountLast4`, `country`, `defaultCurrency`, `lastSyncedAt`

**Not exposed:** `stripeConnectedAccountId`, KYC payloads, full IBAN, raw Stripe account object
