# Invoice Process Outbox & Reconciliation (V4.9.456)

## Purpose

Durable retry, dead-letter (manual review), and reconciliation for the rental invoice pipeline — aligned with `PaymentEmailOutbox` / `PaymentConnectReconciliation` patterns.

## Model: `OrgInvoiceProcess`

| Field | Notes |
|-------|-------|
| `processType` | Subprocess enum (see below) |
| `entityType` + `entityId` | Scoped anchor (booking, invoice, document, email, task) |
| `status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `RETRY_SCHEDULED`, `MANUAL_REVIEW` |
| `attemptCount`, `lastAttemptAt`, `nextRetryAt` | Retry metadata |
| `lastErrorCode`, `lastErrorMessage` | Sanitized for UI; technical detail in logs |
| `correlationId` | Request/trace correlation |
| `idempotencyKey` | Unique per org — no duplicate jobs |
| `resolvedAt`, `resolvedByUserId` | Completion / manual retry actor |

Migration: `20260715000000_org_invoice_process`

## Process types

- `BOOKING_INVOICE_CREATE`
- `BOOKING_FINANCE_SYNC`
- `INVOICE_DOCUMENT_GENERATE` / `DOCUMENT_STORE`
- `INVOICE_DOCUMENT_LINK`
- `INVOICE_EMAIL_SEND`
- `PROVIDER_STATUS_SYNC`
- `PAYMENT_SYNC`
- `LINKED_TASK_UPDATE`

## Runtime

- **`InvoiceProcessOutboxService`** — enqueue + `recordFailure` (replaces silent `.catch(() => null)`)
- **`InvoiceProcessProcessorService`** — claim, execute, exponential backoff, max attempts → `MANUAL_REVIEW`
- **`InvoiceProcessExecutorService`** — delegates to existing domain services
- **`InvoiceProcessRecoveryScheduler`** — polls due rows every 60s
- **`InvoiceProcessReconciliationService`** — detects inconsistencies, enqueues idempotent repair jobs
- **`InvoiceProcessReconciliationScheduler`** — global reconcile every 15 min

## API (org-scoped, admin roles)

| Route | Action |
|-------|--------|
| `GET .../invoice-processes` | List processes (DTO with German `userMessage`) |
| `GET .../invoice-processes/:id` | Detail |
| `POST .../invoice-processes/:id/retry` | Manual retry |
| `POST .../invoice-processes/reconcile` | On-demand reconciliation |

## Reconciliation findings

1. Booking without `OUTGOING_BOOKING` invoice
2. Issued invoice + `COMPLETE` bundle but no booking invoice document
3. `BOOKING_INVOICE` document without `invoiceId`
4. Invoice-linked `OutboundEmail` stuck in `SENDING` over timeout
5. Payment sum ≠ `paidCents`
6. `PAID` invoice with open payment task

## Config

`INVOICE_PROCESS_*` env vars via `invoice-process.config.ts` (max attempts, backoff, batch size).
