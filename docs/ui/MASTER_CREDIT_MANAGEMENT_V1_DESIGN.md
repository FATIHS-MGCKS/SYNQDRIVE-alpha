# Master Credit Management V1 — reviewed design (implementation gate)

**Operation:** `SYNQDRIVE_MASTER_PRODUCT_COMMERCIAL_MANAGEMENT_V1`  
**Status:** DESIGN_REVIEWED — **no Master issuance UI** until owner-approved APIs exist  
**Last updated:** 2026-11-24

## Audit summary (repository baseline)

| Capability | Current state | Evidence |
|------------|---------------|----------|
| Stripe credit note mirror | **IMPLEMENTED** (webhook → ledger) | `credit_note.created` in stripe webhook matrix; `StripePaymentLedgerService` mirror |
| Master credit note list | **IMPLEMENTED** (read-only) | `GET /admin/billing/credit-notes` → `BillingCreditNotesTab` |
| Master credit note **create** | **NOT IMPLEMENTED** | No `POST` admin route; no idempotent issuance service exposed to Master |
| Organization **account credit** (customer balance) | **NOT IMPLEMENTED** | No persisted Master API/DTO for balance credit applicable to future invoices |
| Refunds | **IMPLEMENTED** (separate flow) | Tenant/master refund paths in payment ledger (distinct from credit notes) |
| Recurring contract discounts | **IMPLEMENTED** | `MasterSubscriptionAddDiscountDto` (see PR2) |

## Required product separation

1. **Account credit** — organizational balance applied to future invoices (not the same as a one-off discount).
2. **Invoice credit note** — accounting document tied to a finalized invoice (partial/full), Stripe-issued where provider is canonical.
3. **Refund** — payment ledger reversal against a charge attempt.
4. **Recurring discount** — subscription pricing adjustment (`BillingDiscount` / master subscription discount APIs).

## Safeguards (binding for future implementation)

- Explicit reason and amount; org (+ invoice) association where applicable
- Currency/tax consistency with invoice line items
- Preview + confirmation + **MFA step-up** + `MASTER_BILLING` permission
- Idempotency keys and immutable audit trail (`billing_domain_events` / payment ledger)
- No duplicate financial adjustments; post-create reconciliation vs Stripe mirror
- **No client-side invoice/credit-note numbering** — provider or domain sequencer only
- Sandbox-only integration tests; **no production Stripe writes** from agents

## Proposed minimum API surface (owner decision required)

### A. Account credit

```
POST /admin/billing/organizations/:orgId/account-credits
```

Body: `{ amountCents, currency, reason, effectiveAt?, idempotencyKey, lockVersion? }`  
Effects: customer balance transaction + audit event; **no UI until Stripe/customer-balance contract signed off**.

### B. Invoice credit note

```
POST /admin/billing/invoices/:invoiceId/credit-notes
```

Body: `{ amountCents | lines[], reason, partial, idempotencyKey }`  
Implementation: delegate to Stripe Credit Note API with local mirror row; reject if invoice not finalized or already fully credited.

## UI scope when armed

- Extend `BillingCreditNotesTab` with gated create drawer (disabled until API returns `capabilities.accountCredit` / `capabilities.creditNoteIssue`).
- Link from Product Commercial hub (PR2) to invoices + credit notes list only.

## Owner decisions needed

1. Confirm Stripe Customer Balance vs custom ledger for **account credit**.
2. Confirm partial credit note rules (tax lines, invoice line item mapping).
3. Approve MFA + audit schema for financial mutations above.

## Verdict for V1 delivery

| Item | Supported in UI now |
|------|---------------------|
| Credit note creation | **NO** (design only) |
| Account credit | **NO** (design only) |
| Ledger visibility | **YES** (existing list) |