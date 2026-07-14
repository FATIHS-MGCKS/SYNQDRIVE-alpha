# Invoice Email Send (V4.9.436)

## Endpoint

`POST /api/v1/organizations/:orgId/invoices/:invoiceId/send-email`

Roles: `ORG_ADMIN`, `MASTER_ADMIN`, `SUB_ADMIN`

## Flow

1. Optional client `idempotencyKey` → return existing `OutboundEmail` if already sent
2. Load `OrgInvoice` (org-scoped)
3. Resolve recipient: explicit `recipient` or customer email
4. `InvoiceDocumentsReadService` → active PDF via `invoiceId` (not `bookingId`)
5. Validate status, document lifecycle, sendable PDF
6. `OutboundEmailPolicyService.resolveIdentity` — org email settings + platform noreply fallback
7. Default subject/body from `invoice-email.template.ts` (overridable)
8. Load PDF buffer from `DOCUMENTS_STORAGE` (authorized path only — no storage URLs in API)
9. Create `OutboundEmail` (`sourceType: INVOICE_SINGLE`, `invoiceId`)
10. Send via existing provider (Resend / dev simulate)
11. Audit: `OUTBOUND_EMAIL` + `INVOICE` activity log entries

## DTO

| Field | Required | Notes |
|-------|----------|-------|
| `recipient` | No | Overrides customer email |
| `cc`, `bcc` | No | Email arrays |
| `subject`, `message` | No | Template defaults when omitted |
| `documentId` | No | Defaults to canonical active document |
| `idempotencyKey` | No | Unique per org |

## Validation (`invoice-send-email.util.ts`)

- Outgoing only (incoming rejected)
- Not `DRAFT` / `CANCELLED` / `VOID` / `CREDITED`
- Issued invoices need `sequenceNumber`
- Active PDF required; distinct errors for generating / failed / unavailable

## Independence from booking

- `bookingId` not required on invoice or request
- `OutboundEmail.bookingId` set when present on invoice (optional)
- Booking document send (`POST .../bookings/:id/documents/send-email`) unchanged

## Schema

- `outbound_emails.idempotency_key` + unique `(organization_id, idempotency_key)`
- Index `(organization_id, invoice_id)`
