# Invoice External Send Recording (V4.9.439)

## Endpoint

`POST /api/v1/organizations/:orgId/invoices/:invoiceId/record-external-send`

Roles: `ORG_ADMIN`, `MASTER_ADMIN`, `SUB_ADMIN`

## Purpose

Replace semantically vague “mark as sent” with an explicit **external delivery record** that stores channel, timestamp, optional recipient/note/reference — separate from SynqDrive `OutboundEmail` provider sends.

## Request body

| Field | Required | Notes |
|-------|----------|-------|
| `channel` | Yes | `EXTERNAL_EMAIL`, `POSTAL_MAIL`, `IN_PERSON`, `CUSTOMER_PORTAL`, `OTHER` |
| `sentAt` | Yes | ISO instant; not before issue; not far in future |
| `recipient` | No | |
| `note` | No | |
| `externalReference` | No | e.g. tracking number |
| `idempotencyKey` | No | Unique per org |

## Storage

Prisma `OrgInvoiceExternalSend` — one row per recorded external delivery.

Not an `OutboundEmail` row. Audit distinguishes:

- `SYNQDRIVE_OUTBOUND_EMAIL` — provider send via `send-email`
- `EXTERNAL_RECORDED` — this endpoint

## Invoice status

On first valid external record: `OrgInvoice.status` → `SENT`, `sentAt` = earliest recorded `sentAt`.

Email provider success does **not** auto-promote invoice (V4.9.438).

## Duplicates

- Same `idempotencyKey` → return existing row (`idempotentReplay: true`)
- Same `channel` + `sentAt` + `recipient` → new row with `duplicateOfId` + `possibleDuplicate: true`

## Legacy

`POST .../mark-sent` deprecated — delegates to `record-external-send` with `OTHER` channel and deprecation note.

## Detail read model

`GET .../invoices/:id/detail` includes:

- `externalSendHistory[]`
- `timeline[]` merged with `kind: EXTERNAL_SEND` entries

## Architecture

Builds on `invoice-status.transitions` (V4.9.438) and outbound audit (V4.9.437).
