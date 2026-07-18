# Document Invoice Extraction — Production Schema (V4.9.605)

**Date:** 2026-07-17  
**Prompt:** 29/84 — structured invoice schema for production use

## Scope

Central module: `backend/src/modules/document-extraction/document-invoice-extraction.rules.ts`

Finance planner assessment: `backend/src/modules/document-extraction/document-action-planner.invoice-rules.ts`

## Canonical fields

| Field | Aliases | Notes |
|-------|---------|-------|
| `invoiceNumber` | `creditNoteNumber`, `documentNumber` | Required for apply |
| `invoiceDate` | `eventDate` | |
| `dueDate` | | Must not precede invoice date (WARNING) |
| `currency` | | ISO 4217; required for apply — no silent EUR default |
| `supplier` | `vendorName`, `supplierName`, `workshopName` | |
| `customer` | `customerName`, `addressee`, `billTo` | |
| `subtotalNet` | `netCents`, `subtotalNetCents` | Cents |
| `totalTax` | `taxCents`, `totalTaxCents` | Cents |
| `totalGross` | `grossCents`, `totalGrossCents`, `totalCents` | Cents |
| `taxExemptReason` | `taxExemptionReason` | |
| `reverseCharge` | | Treated as tax-free semantics |
| `lineItems` | | Per-line `taxRate` / amounts |
| `taxLines` | | Multi-rate tax groups |
| `creditNoteReference` | `referencedInvoiceNumber` | Credit notes |
| `originalInvoiceReference` | `originalInvoiceNumber` | Credit notes |
| `amountSemantics` | | `EXPLICIT` / `UNCLEAR` — unclear blocks apply |
| `taxSemantics` | | `EXPLICIT` / `TAX_FREE` / `UNCLEAR` |

## Rules

- **No 19% default** — planner and apply never assume VAT rate.
- **Multiple tax rates** — via `taxLines` or per-line `taxRate` in `lineItems`.
- **Tax-free / reverse charge** — `taxSemantics: TAX_FREE`, `reverseCharge`, or `taxExemptReason`.
- **Net/gross consistency** — `subtotalNet + totalTax ≈ totalGross`; tolerance 2 cents → WARNING; beyond → BLOCKER.
- **Apply gate** — blocks unclear amount/tax semantics, missing currency, net/gross mismatch, positive credit-note amounts.
- **Apply line items** — built from `lineItems`, `taxLines`, or explicit net+tax; removed `/1.19` hack in `DocumentExtractionApplyService`.

## Tests

- `document-invoice-extraction.rules.spec.ts` — readers, semantics, plausibility, apply gate, line-item builder
- `document-action-planner.invoice-rules.spec.ts` — finance profile routing, draft requirements
- `document-extraction.schemas.spec.ts` — INVOICE field declarations
- `document-extraction-plausibility.service.spec.ts` — INVOICE integration

Fixtures: `__fixtures__/document-invoice-fixtures.ts`
