# Phase 3 E3 — Money Migration Validation

Base main SHA: `6acdb24eb84986b25789c01fb544645231c53dc5`
Branch: `integration/evaluations-e3-money-finance-correctness-2026-08`
Change-set: `cs-evaluations-money-migration`

## Outcome

**SCHEMA_CHANGE = NO. MIGRATION = NO.** `cs-evaluations-money-migration` is
classified `NOT_REQUIRED_ON_CURRENT_MAIN`.

`git diff --stat origin/main...HEAD -- backend/prisma/schema.prisma backend/prisma/migrations`
is empty — E3 adds no schema change and no migration file.

## Money-field inventory (why no migration is required)

E3 requires canonical money to be exact integer minor units with an explicit
currency. Every canonical finance source on current main already satisfies this
invariant, so there is no field to add or retype.

| model | field | current_type | current_unit | currency_source | nullable | target_representation | backfill_rule | ambiguity | index | constraint |
|---|---|---|---|---|---|---|---|---|---|---|
| OrgInvoice | totalCents | Int | minor | OrgInvoice.currency | no | (unchanged) integer minor + currency | none | none | existing | existing |
| OrgInvoice | outstandingCents | Int | minor | OrgInvoice.currency | no (default 0) | (unchanged) | none | none | existing | existing |
| OrgInvoice | paidCents | Int | minor | OrgInvoice.currency | no (default 0) | (unchanged) | none | none | existing | existing |
| OrgInvoice | currency | String | ISO code | self | no (default "EUR") | (unchanged) | none | legacy default "EUR"/lowercase possible | — | — |
| OrgInvoicePayment | amountCents | Int | minor | parent invoice.currency | no | (unchanged) | none | none | existing | existing |
| PaymentTransaction | amountCents | Int | minor | PaymentTransaction.currency | no | (unchanged) | none | none | existing | existing |
| BookingDeposit | amountCents | Int | minor | BookingDeposit.currency | no | (unchanged, not used by E3) | none | none | existing | existing |

## FX / reporting-currency storage decision

- **No FX rate table is introduced.** Current main has no historical FX rate
  source. Inventing one would require rate provenance and backfill authority
  that does not exist, violating the "no guessed backfill" rule (SCHRITT 22).
  FX provenance is modeled as response-time metadata
  (`shared/evaluations-finance/evaluations-fx.ts`) and only applied when an
  authoritative rate is supplied by a caller.
- **No new reporting-currency settings table** (SCHRITT 49). Reporting currency
  is read from the existing `OrganizationPaymentAccount.defaultCurrency`. When it
  is absent the metric is UNAVAILABLE — never defaulted to EUR.

## Decimal → minor conversion safety (available for future migrations)

Although no migration ships, E3 provides a deterministic, float-free
`decimalStringToMinor(decimal, currency)` used by tests to prove backfill safety
for any future money migration:

- `0.01/0.1/0.10/19.99` EUR → `1/10/10/1999`
- `-20.00` EUR → `-2000`; `1000` JPY (0-decimal) → `1000`; `1.234` KWD (3-decimal) → `1234`
- `100.005` EUR → **throws** (precision loss; never silently rounded / guessed)
- Currency/unit ambiguity ⇒ throw (`AMBIGUOUS_BACKFILL` behaviour), never a guess.

Evidence: `backend/src/modules/evaluations-finance/evaluations-money.spec.ts`
("decimal → minor conversion" block).

## Current-main migration chain dry run

Per E2 findings, the current-main Prisma migration chain contains a known
baseline defect (`P3018` around the `vehicle_trips` migration). This is
`PRE_EXISTING_MIGRATION_BASELINE` and is unrelated to E3. Because E3 adds no
migration, there is nothing for E3 to apply on top of the chain.

- `npx prisma validate` (with a dummy `DATABASE_URL`) ⇒ schema is valid; the only
  warning is the pre-existing `SetNull`-on-required relation warning, unrelated
  to E3.

## Production safety

- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DATA_BACKFILL_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
