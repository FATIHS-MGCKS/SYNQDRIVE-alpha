# End-customer payments — application fee policy (Prompt 8)

**Date:** 2026-07-14  
**Scope:** Server-side fee basis and calculation from `BookingPriceSnapshot` line items only.

## Provisionable line items (positive list)

| Type | Description |
|------|-------------|
| `BASE_RENTAL` | Grundmiete |
| `INSURANCE` | Versicherungen |
| `EXTRA` | Extras |
| `MILEAGE_PACKAGE` | Kilometerpakete |
| `EXTRA_KM` | Zusätzliche Kilometer |

`DISCOUNT` adjusts the commissionable base (negative) but is not a separate provisionable product.

## Excluded types

| Type | Reason |
|------|--------|
| `DEPOSIT` | Kaution — never online-collected or commissioned in MVP |
| `TAX` | Pure tax line — excluded from fee base |
| `MANUAL_ADJUSTMENT` | Non-commissionable manual changes |

**Never used:** `totalDueNowCents`, `depositAmountCents` header, frontend amounts.

## Fee basis (configurable)

- `GROSS_RENTAL_EXCL_DEPOSIT` (default via `PAYMENT_FEE_BASIS`)
- `NET_RENTAL_EXCL_DEPOSIT`

Policy version: `PAYMENT_FEE_POLICY_VERSION` (`2026-07-14-v1`)

## Formula

```
commissionable = Σ lineItemAmount(basis) for provisionable + DISCOUNT lines
variableFee = round(commissionable × feeRateBps / 10000)
applicationFee = clamp(variableFee + fixedFeeCents, minFee, maxFee)
```

Rounding: integer cents, `Math.round` on percentage portion.

## Refund rule

Proportional application-fee refund:

```
refundFee = round(originalFee × refundAmount / originalRentalPayment)
```

Full refund returns remaining fee after prior partial refunds.

## Immutable snapshot on `BookingPaymentRequest`

`commissionableAmountCents`, `applicationFeeAmountCents`, `feeRateBps`, `fixedFeeCents`, `feePolicyVersion`, `feeBasis`, `amountCents` (= rental only, no deposit).

## Services

- `PaymentPolicyService` — policy resolution, line-item rules, pure calculators
- `PaymentFeeService` — loads snapshot, builds fee snapshot, refund adjustments
