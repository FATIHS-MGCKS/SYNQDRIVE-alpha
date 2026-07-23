# Frozen Deposit Checkout Flow (V4.9.784)

| Field | Value |
|-------|-------|
| **Version** | V4.9.784 |
| **Prompt** | Rental Rules Remediation Prompt 31 |
| **Builds on** | V4.9.783 Canonical Deposit Resolver |

## End-to-end data flow

```
Rental Rules floor + Tariff rate
        ↓
DepositResolverService.resolveDeposit()
        ↓
PricingService.simulateBookingPrice()
        ↓
PricingQuote (totals.frozenDeposit + depositAmountCents)
        ↓
consumeForBooking() → frozen simulation
        ↓
BookingPriceSnapshot (depositAmountCents + pricingInputJson.frozenDeposit)
        ↓
BookingDeposit sync (canonical amount + provenance JSON in reason)
        ↓
BookingWizardCheckoutContext (rental/deposit/paid/due breakdown)
        ↓
confirmDraft() → freezeDepositOnSnapshot() sets frozenAt
```

## Frozen contract (`FrozenBookingDeposit`)

Stored on `BookingPriceSnapshot.pricingInputJson.frozenDeposit`:

| Field | Role |
|-------|------|
| `amountCents` | Canonical deposit in cents |
| `currency` | ISO-4217 |
| `source` | Winning resolver source |
| `ruleRevisionId` | Source entity id |
| `reason` | Human-readable resolver reason |
| `manualOverride` | Approved override flag |
| `calculatedAt` | Resolver timestamp |
| `frozenAt` | Set on wizard confirm — immutable after |

## Immutability rules

1. **Quote consume** — simulation and deposit frozen at quote consumption; no re-resolution on consume.
2. **Snapshot replace** — only via new quote (wizard `updateDraftQuote`) or pre-confirm repricing.
3. **Confirm freeze** — `freezeDepositOnSnapshot()` sets `frozenAt`; syncs `BookingDeposit`.
4. **CONFIRMED repricing guard** — `bookings.service.update()` throws `PRICING_QUOTE_REQUIRED_FOR_REPRICE` without `quoteId`.

## Checkout context breakdown

| Field | Meaning |
|-------|---------|
| `rentalAmountCents` | Gross rental (excludes deposit) |
| `onlineAmountCents` | Stripe-collectable rental portion |
| `depositAmountCents` | Frozen snapshot deposit |
| `rentalPaidCents` | Succeeded rental payment requests |
| `depositPaidCents` | Received booking deposit |
| `depositPreauthorizedCents` | Reserved for future preauth (0 today) |
| `depositDueAtPickupCents` | deposit − paid − preauthorized |
| `frozenDeposit` | Full provenance metadata |

## Tests

- `pricing-deposit-checkout-freeze.spec.ts` — quote → snapshot → checkout alignment
- `booking-deposit-snapshot.service.spec.ts` — freeze on confirm
