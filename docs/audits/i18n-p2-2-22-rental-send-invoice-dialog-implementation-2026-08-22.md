# P2.2.22 — Rental Send Invoice Dialog Localization Implementation

**Date:** 2026-08-22  
**Baseline:** `59b01928a09598f36045a61fad031f0e44dcc1fc` (PR #1167 / P2.2.21)  
**Pre-flight:** PR #1171 — GO  
**Branch:** `cursor/p2222-rental-send-invoice-dialog-i18n-3c10`

## Target

| Path | Role |
|------|------|
| `frontend/src/rental/components/invoices/SendInvoiceDialog.tsx` | Primary UI |
| `frontend/src/rental/lib/send-invoice-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/invoices.send.{en,de}.ts` | +5 EN+DE keys |

**Host:** `InvoiceDetail.tsx` → `SendInvoiceDialog` with `documents.sendEmail` and `documents.defaultEmailSubject`.

## Inventory classification

| String | Class | Action |
|--------|-------|--------|
| Dialog title / description | D | `invoices.send.title`, `invoices.send.description` |
| Default body template | D | `invoices.send.defaultBody` via adapter |
| Field labels | D | Reuse `email.send.modal.*` |
| Cancel / Send actions | D | `common.cancel`, `email.send.modal.send` |
| CC placeholder | D | `invoices.send.ccPlaceholder` |
| Recipient validation toast | D | `invoices.send.error.recipientRequired` |
| Invoice number in description/body | B | Dynamic via `displayNumber` |
| `defaultSubject` from host | B | Unchanged (out of dialog scope) |
| Email addresses / customer data | B | Never translated |

## Machine / payload freeze

`SendInvoiceEmailPayload` unchanged:

- `toEmail`, `subject`, `bodyText`, `ccEmails`, `bccEmails`, `documentId`
- Field names, types, and send callback order preserved
- `locale` excluded from open-reset `useEffect` deps (user edits survive locale switch)

## Keys

+5 EN+DE under `invoices.send.*` (8230 → 8235).

## Validation

- `npm run i18n:check` — PASS
- P222 scoped debt — 0
- P221–P216 freezes — 0
- EN/DE parity — 100%

## Verdict

**A — IMPLEMENTATION COMPLETE**
