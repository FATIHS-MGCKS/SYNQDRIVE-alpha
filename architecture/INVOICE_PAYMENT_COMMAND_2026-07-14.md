# Invoice Payment Command (V4.9.440)

## Endpoints

| Route | Purpose |
|-------|---------|
| `POST .../invoices/:id/payments` | Record partial or full payment with explicit `paymentMethod` |
| `PATCH .../invoices/:id/pay` | **Deprecated** — records remaining balance; requires `paymentMethod` in body |

Roles: `ORG_ADMIN`, `MASTER_ADMIN`, `SUB_ADMIN`

## Central command

`InvoicePaymentService.recordPayment(orgId, invoiceId, userId, command)`

### Required inputs

| Field | Notes |
|-------|-------|
| `amountCents` | Integer minor units; must be > 0 |
| `paymentMethod` | `BANK_TRANSFER`, `CARD`, `CASH`, `STRIPE`, `OTHER` |

### Optional inputs

| Field | Notes |
|-------|-------|
| `currency` | Defaults to invoice currency; must match |
| `paidAt` | ISO instant; defaults to now |
| `reference` | Free text |
| `note` | Free text |
| `providerTransactionId` | Sets `source=PROVIDER` when present |
| `idempotencyKey` | Unique per org |

## Rules

- No overpayment unless product explicitly enables credit (`allowOverpayment` — not default).
- Partial payment → `PARTIALLY_PAID`.
- Full settlement → `PAID`; `invoice.paidAt` = completing payment's `paidAt`.
- Cancelled/void/credited/rejected invoices cannot accept payments.
- Linked `OrgTask` rows close only when outstanding balance reaches zero.
- Manual vs provider payments distinguished via `InvoicePaymentSource` (`MANUAL` | `PROVIDER`).
- DTOs expose `methodLabel` (German) — never raw enum as display text.

## Idempotency

- Same `idempotencyKey` per org → replay existing payment (`idempotentReplay: true`).
- Same `providerTransactionId` per org → replay (webhook-safe).

## Schema

`OrgInvoicePayment` extended:

- `currency`
- `source` (`InvoicePaymentSource`)
- `providerTransactionId`
- `idempotencyKey`

Unique indexes: `(organizationId, idempotencyKey)`, `(organizationId, providerTransactionId)`.

Migration: `20260714260000_invoice_payment_command`.

## Breaking change

`markPaid` / `PATCH .../pay` no longer defaults to `BANK_TRANSFER`. Clients must send `paymentMethod`.

## Detail read model

`payments[]` includes `methodLabel`, `source`, `currency`, `providerTransactionId`.
