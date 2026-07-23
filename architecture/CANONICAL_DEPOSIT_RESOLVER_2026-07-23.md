# Canonical Deposit Resolver (V4.9.783)

| Field | Value |
|-------|-------|
| **Version** | V4.9.783 |
| **Prompt** | Rental Rules Remediation Prompt 30 |
| **Date** | 2026-07-23 |

## Goal

Rental Rules, Pricing, Quote Simulation, Booking Price Snapshot, Checkout, and Payment Provider must use the same deposit truth.

## Module

`backend/src/modules/deposit/`

| File | Role |
|------|------|
| `deposit-resolver.types.ts` | `ResolvedDeposit`, sources, inputs |
| `deposit-resolver.util.ts` | Pure `resolveDeposit()` — priority logic, currency guards |
| `deposit-resolver.service.ts` | Loads rental rules floor + tariff, orchestrates resolution |
| `deposit-resolver.module.ts` | Nest module exported to Pricing |

## Priority (ascending specificity for minimum floor)

1. **Organization minimum** (`ORGANIZATION_MINIMUM`) — org-wide rental rules default
2. **Category minimum** (`CATEGORY_MINIMUM`) — vehicle category override
3. **Vehicle override minimum** (`VEHICLE_OVERRIDE_MINIMUM`) — per-vehicle rental rules override
4. **Tariff rate** (`TARIFF_RATE`) — pricing tariff `depositAmountCents`; wins when ≥ floor
5. **Manual override approved** (`MANUAL_OVERRIDE_APPROVED`) — explicit approval reference required

## Resolution rules

- `effectiveMinimum = rentalRulesFloor` (cascade via `RentalEffectiveRulesService`)
- Without manual override: `final = max(effectiveMinimum, tariffDeposit)`
- Tariff below minimum → raised to minimum (`raisedToMinimum: true`, warning in simulation)
- Manual override below minimum → only with `approvalReferenceId` (no silent undercut)
- Currency mismatch → `DEPOSIT_CURRENCY_MISMATCH` (no silent FX)

## `ResolvedDeposit` contract

```typescript
{
  amount: number;           // cents
  currency: string;         // ISO-4217
  source: DepositSource;
  ruleRevisionId: string | null;  // winning layer entity id
  reason: string;
  manualOverride: boolean;
  calculatedAt: string;     // ISO timestamp
  components: { rentalRulesFloorCents, tariffDepositCents, effectiveMinimumCents, raisedToMinimum }
}
```

## Integration points

| Consumer | Change |
|----------|--------|
| `PricingService.simulateBookingPrice` | Resolves deposit before calculation |
| `pricing-calculation.util` | DEPOSIT line item via `DEPOSIT_RESOLVER` metadata |
| `PricingContextDto` | `resolvedDeposit` + canonical `depositAmountCents` |
| `BookingPriceSnapshot` | `pricingInputJson.resolvedDeposit` |
| `BookingWizardCheckoutContextService` | Uses snapshot deposit (unchanged path, now canonical) |
| `BookingRentalEligibilityService` | Uses max(rules, snapshot) for deposit warning |
| `BookingDocumentBundleService` | `BookingDeposit` from snapshot first |

## Tests

- `deposit-resolver.util.spec.ts` — all priority combinations
- `deposit-resolver.service.spec.ts` — service integration
- Pricing specs use `createTariffPassthroughDepositResolver()` stub
