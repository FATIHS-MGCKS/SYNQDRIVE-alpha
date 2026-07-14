# Invoice Email Audit Trail (V4.9.437)

Extends V4.9.436 invoice send with a full outbound audit model traceable by `invoiceId`.

## Primary relation

- Every invoice send creates `OutboundEmail` with **`invoiceId`** (required for `INVOICE_SINGLE`)
- `bookingId` is copied from invoice when present — **not** the primary lookup key
- Document version: `generatedDocumentId` + `documentVersionNumber` on the row (plus attachment link)

## OutboundEmail audit fields

| Field | Purpose |
|-------|---------|
| `invoiceId` | Primary business link |
| `generatedDocumentId` / `documentVersionNumber` | PDF version sent |
| `toEmail`, `ccEmails`, `bccEmails` | Recipients |
| `subject`, `fromEmail`, `fromName`, `replyToEmail` | Sender identity |
| `provider`, `providerMessageId` | Provider trace |
| `status` | Send lifecycle (`QUEUED` → `SENT` / `FAILED`) |
| `deliveryStatus` | Delivery lifecycle (`PENDING` → `ACCEPTED` → `DELIVERED` / `BOUNCED` / `FAILED`) |
| `errorCode`, `errorMessage` | User-safe, sanitized (no secrets) |
| `requestedAt`, `acceptedAt`, `sentAt`, `deliveredAt`, `failedAt` | Timestamps |
| `sentByUserId` | Triggered by |
| `idempotencyKey` | Client dedup per org |
| `correlationId` | Request trace (`req.requestId`) |

Body content (`bodyText` / `bodyHtml`) is stored once on the row — not duplicated in audit DTOs.

## Idempotency & retry

1. Client sends optional `idempotencyKey`
2. `findFirst(organizationId, idempotencyKey)` → return existing DTO if same invoice
3. Reject if key reused for a different `invoiceId`
4. `isRetryableOutboundEmail()` — retry only when send/delivery failed and not terminal success

## Provider webhooks

`OutboundEmailService.handleResendWebhook`:

- Match by `providerMessageId` or outbound id
- Update `deliveryStatus`, `deliveredAt`, `failedAt`, `bouncedAt`
- Sanitize webhook error payloads

## Invoice detail read model

`GET .../invoices/:id/detail` includes:

- `outboundEmails[]` — legacy summary (backward compatible)
- `emailSendHistory[]` — sorted by `requestedAt` desc, mapped via `invoice-email-send-history.util.ts`

Each history entry: recipient, channel, document version, send/delivery status, timestamps, triggered-by display name, user-safe error, `retryPossible`.

Query: `outboundEmail.findMany({ where: { organizationId, invoiceId } })` — **no booking OR fallback**.

## Tenant scoping

- Invoice load: `orgInvoice.findFirst({ id, organizationId })`
- Document load: `generatedDocument` must match `organizationId` + `invoiceId`
- Cross-tenant invoice/document → `NotFoundException` / `ForbiddenException`

## Schema

Migration `20260714240000_outbound_email_invoice_audit`:

- Enum `OutboundEmailDeliveryStatus`
- FK `outbound_emails.invoice_id` → `org_invoices`
- FK `outbound_emails.generated_document_id` → `generated_documents`
- Indexes on `delivery_status`, `provider_message_id`, `requested_at`

## Tests

- `invoice-document-email.audit.spec.ts` — send lifecycle, idempotency, cross-tenant, no-booking
- `outbound-email.service.spec.ts` — webhook delivery updates
- `invoice-email-send-history.util.spec.ts` — DTO mapping
- `invoice-detail-read.service.spec.ts` — invoiceId-only query + history
