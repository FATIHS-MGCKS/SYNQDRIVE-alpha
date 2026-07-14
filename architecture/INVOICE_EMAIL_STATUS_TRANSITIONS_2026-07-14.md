# Invoice Email Status Transitions (V4.9.438)

## Two separate truths

| Layer | Enum / model | Purpose |
|-------|----------------|---------|
| **Invoice business** | `OrgInvoiceStatus` | Fälligkeit, Zahlung, Buchhaltung |
| **Communication** | `OutboundEmail.status` + `deliveryStatus` | E-Mail-Versand & Provider-Zustellung |

Email success does **not** auto-set `OrgInvoice.status = SENT`. Manual external send uses `POST .../mark-sent` only.

## Canonical communication phases

Derived via `deriveOutboundCommunicationPhase()` (not a separate DB column):

| Phase | Persisted state |
|-------|-----------------|
| `PREPARING` | `SENDING` + `PENDING` |
| `QUEUED` | `QUEUED` + `PENDING` |
| `PROVIDER_ACCEPTED` | `SENT`/`SENT_SIMULATED` + `ACCEPTED` |
| `DELIVERED` | any send + `DELIVERED` |
| `FAILED` | `FAILED` + `FAILED` |
| `BOUNCED` | `FAILED` + `BOUNCED` |

Backward compatible: `SENDING` → `PREPARING`, `SENT_SIMULATED` → `PROVIDER_ACCEPTED`.

## Answers (explicit rules)

1. **Ausgestellt?** — `issue()`: `ISSUED` + `sequenceNumber` + `issuedAt`
2. **Rechnung SENT?** — Only `markSent()` (external) or re-mark from `ISSUED`/`PARTIALLY_PAID`/`OVERDUE`; never from failed email
3. **Provider acceptance vs send** — `acceptedAt`/`sentAt` set together on provider success (`ACCEPTED`); `DELIVERED` only via webhook
4. **DELIVERED** — Does not change `OrgInvoice.status`
5. **Bounce after SENT** — Outbound → `BOUNCED`; invoice unchanged; audit events append-only
6. **Retry** — New `OutboundEmail` row (or idempotency key returns prior); invoice unchanged
7. **Multiple recipients** — One row (`to` + `cc`/`bcc`); one phase per attempt
8. **External send** — `markSent` only; no outbound row required
9. **Compatibility** — Existing Prisma enums unchanged; phases are derived

## Central modules

- `outbound-email-status.transitions.ts` — send/delivery graphs, webhook patches, `sentAt` guard
- `invoice-status.transitions.ts` — invoice graph, `validateExternalMarkSent`
- `invoice-outbound-status-coordinator.util.ts` — activity log on communication phase change

## sentAt rule

`sentAt` is set only when `acceptedAt` is set (provider acceptance). DELIVERED webhook sets `deliveredAt` only (backfills `sentAt` from `acceptedAt` if missing).
