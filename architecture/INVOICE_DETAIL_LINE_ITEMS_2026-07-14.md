# Invoice Detail — Line Items & Totals (V4.9.463)

## Scope

Line items and totals section on invoice detail only. `CreateInvoiceDialog` edit flow unchanged.

## Frontend

- `invoiceLineItems.mapper.ts` — normalizes stored line JSON (`netCents`/`taxCents`/`grossCents` preferred), infers unit (`Tage`, …), tax breakdown by rate, reconciles with invoice totals
- `InvoiceLineItems` — desktop `table-fixed` (no horizontal scroll); mobile cards per position; summary block (net, tax split, gross, paid, outstanding, credits)
- i18n: `invoiceLineItem.*` — explicit labels for net unit price vs gross line total
- `InvoiceDetail` passes full `invoice` (currency + payment amounts + credited status)

## Display rules

- Money via `formatAmount(cents, currency)`
- Line gross = stored `grossCents` or `netCents + taxCents` (never `unitNet × qty` as gross)
- Summary uses invoice-level `subtotalCents` / `taxCents` / `totalCents` when present
- Credits: negative/discount lines or `status === CREDITED` / `creditedAt`

## Regression: 5 Tage × 100,84 € netto → 600,00 € brutto

`rentalDaysLineItemExample()` in mapper tests documents expected booking-invoice math.

## Tests

- `invoiceLineItems.mapper.test.ts`
- `InvoiceLineItems.test.tsx` (single/many/long/multi-tax/tax-free/credit/narrow widths)
