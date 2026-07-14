# End-customer payments — Stripe Connect adapter layer (Prompt 9)

**Date:** 2026-07-14  
**Architecture:** Prompt 4 verified — Direct Charges + `application_fee_amount`, Accounts v1 Express (v2 stub pending Dashboard).

## Adapter boundary

| Layer | Role |
|-------|------|
| `StripeConnectAdapter` | Port interface — domain never sees Stripe SDK types |
| `StripeConnectV1Adapter` | Express accounts, Account Links onboarding, status retrieve |
| `StripeConnectV2Adapter` | Stub — throws `CONNECT_NOT_CONFIGURED` until v2 enabled |
| `StripeConnectAccountService` | Guards, idempotency, orchestration |
| `OrganizationPaymentAccountService` | Safe DB persistence + sync |

## Internal methods (Stripe-agnostic)

- `createConnectedAccount`
- `getConnectedAccountStatus`
- `createOnboardingSession`
- `refreshConnectedAccount`
- `getSafePayoutSummary`

## Preconditions for create

1. `Organization.paymentsEnabled === true`
2. Permission `payments.connect.manage`
3. No existing `stripeConnectedAccountId` (idempotent refresh otherwise)
4. Org profile: `companyName`, contact email, country
5. `STRIPE_SECRET_KEY` must be **test mode** (`sk_test_*`) in this phase

## Idempotency

- DB unique `(organizationId, provider)` — one account per org
- `pg_advisory_xact_lock` inside transaction for parallel create
- Repeat create → refresh existing account, no second Stripe `accounts.create`

## Persisted fields (safe metadata only)

`stripeConnectedAccountId`, status, `detailsSubmitted`, `chargesEnabled`, `payoutsEnabled`, `disabledReason`, requirements JSON, `country`, `defaultCurrency`, `livemode`, `bankAccountLast4`, `lastSyncedAt`

**Not stored:** KYC documents, full IBAN, person PII beyond Stripe onboarding flow.

## Error codes

`PAYMENTS_FEATURE_DISABLED`, `CONNECT_ACCOUNT_ALREADY_EXISTS`, `CONNECT_NOT_CONFIGURED`, `CONNECT_ACCOUNT_RESTRICTED`, `STRIPE_MODE_MISMATCH`, `CONNECT_PROVIDER_ERROR`
