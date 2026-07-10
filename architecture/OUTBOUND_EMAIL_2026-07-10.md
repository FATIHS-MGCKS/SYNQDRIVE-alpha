# Outbound Email — Document Delivery (2026-07-10)

## Scope

Transactional outbound email for booking document PDFs, org sender configuration, custom domain verification (Resend), audit trail, and administration UI.

## Data model

- `OrgEmailSettings` — mode (`SYNQDRIVE_DEFAULT` | `CUSTOM_DOMAIN`), from name, reply-to, HTML signature
- `OrgEmailDomain` — domain, DNS records JSON, provider domain id, verification status, active flag
- `OutboundEmail` — full send record with from/reply/to, status, provider message id
- `OutboundEmailAttachment` — links to `GeneratedDocument`
- `OutboundEmailEvent` — queued/sent/failed/delivered/bounced/etc.

Activity audit: `ActivityAction.SEND` + `ActivityEntity.OUTBOUND_EMAIL`.

## Provider

- `EMAIL_PROVIDER=auto`: Resend when `RESEND_API_KEY` set, else dev simulate (`SENT_SIMULATED`)
- Attachments read from private document storage (`DOCUMENTS_STORAGE.getObject`) — never public URLs

## From / Reply-To policy

1. **From**: `EMAIL_DEFAULT_FROM` unless `CUSTOM_DOMAIN` + verified active domain → `{fromLocalPart}@{domain}`
2. **Reply-To** chain: settings.replyTo → org.invoiceEmail → org.email → org.managerEmail → `EMAIL_DEFAULT_REPLY_TO`

## API

| Method | Path | Role |
|--------|------|------|
| POST | `/organizations/:orgId/bookings/:bookingId/documents/send-email` | ORG_ADMIN |
| GET/PUT | `/organizations/:orgId/email/settings` | read / ORG_ADMIN write |
| GET/POST | `/organizations/:orgId/email/domains` | read / ORG_ADMIN |
| POST | `.../domains/:id/verify` | ORG_ADMIN |
| POST | `.../domains/:id/activate` | ORG_ADMIN |
| GET | `/organizations/:orgId/email/history` | org-scoped |
| POST | `/webhooks/resend/outbound-email` | public webhook |

## Frontend

- `SendDocumentsEmailModal` — booking document send with attachment picker
- Administration tab **E-Mail & Versand** (`EmailVersandTab`)
- Entry points: `BookingDocumentsSection`, `InvoicesView` (when booking + generated PDF linked)
