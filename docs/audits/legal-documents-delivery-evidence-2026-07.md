# Legal Documents — Delivery Evidence Audit (Prompt 18/32)

**Date:** 2026-07-22  
**Scope:** Append-only proof model for customer contact with legal texts.

## Problem

SynqDrive had no dedicated booking-level evidence for legal text presentation, delivery, and acknowledgment. Delivery proof for completeness was inferred from `OutboundEmail` attachments (invoice-only). Checkout `agbAccepted`/`privacyAccepted` were not persisted as evidence.

## Solution

### Model: `LegalDocumentDeliveryEvidence`

Append-only table recording:

| Field | Purpose |
|-------|---------|
| `presentedAt` | Server time when legal text was shown/sent |
| `deliveryChannel` | How the text reached the customer |
| `deliveryStatus` | Delivery lifecycle (updatable for email) |
| `deliveredAt` | Confirmed delivery time |
| `acknowledgedAt` | Customer receipt confirmation (NOT consent) |
| `acknowledgmentMethod` | How receipt was confirmed |
| `recipientSnapshot` | Minimal recipient identity at presentation time |
| `checksum` + `versionLabel` | Frozen legal version reference |

No document content stored in evidence rows.

### Controlled vocabularies

**deliveryChannel:** `PORTAL`, `EMAIL`, `IN_PERSON`, `DOWNLOAD`, `PRINT`

**deliveryStatus:** `PENDING`, `PRESENTED`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `OPENED`

**acknowledgmentMethod:** `EXPLICIT_CHECKBOX`, `ELECTRONIC_SIGNATURE`, `IN_PERSON_CONFIRMATION`, `EMAIL_CONFIRMATION`

### API

```
GET  /organizations/:orgId/bookings/:bookingId/legal-delivery-evidence
GET  /organizations/:orgId/bookings/:bookingId/legal-delivery-evidence/:evidenceId
POST /organizations/:orgId/bookings/:bookingId/legal-delivery-evidence
PATCH …/:evidenceId/delivery-status
POST …/:evidenceId/acknowledge
```

Actor from `@CurrentUser('id')` — no client-supplied actor or timestamps.

## Nachweisarten (evidence types)

| Type | Recorded via | Meaning |
|------|--------------|---------|
| **Presentation** | `recordPresentation()` | Legal text was shown to customer |
| **Delivery** | `deliveryStatus` progression | Transport confirmed (esp. email) |
| **Acknowledgment** | `recordAcknowledgment()` | Customer confirmed receipt |

## Abgrenzung zu Consent

| This model | Separate domains |
|------------|------------------|
| AGB / Verbraucherinfo / Datenschutz**hinweis** delivery & receipt | Marketing consent (`WhatsAppConsent`) |
| Acknowledgment = "received/read" | KYC decisions (`CustomerVerificationCheck`) |
| NOT data-processing consent | Org data auth (`OrgDataAuthorization`) |
| NOT pickup gate (Prompt 20) | Vehicle telematics consent |

**Kenntnisnahme ≠ Einwilligung.** Privacy notice acknowledgment does not grant marketing or processing consent.

## Unveränderlichkeit

- Rows have no `updatedAt` — mutations only via controlled service methods
- `acknowledgedAt` set → immutable
- Terminal `deliveryStatus` (`DELIVERED`, `FAILED`, `BOUNCED`) → immutable
- Email `deliveryStatus` may progress (`SENT` → `DELIVERED`) until terminal
- Idempotent `requestId` per organization prevents duplicate presentation records

## Datenminimierung

`recipientSnapshot` allows only: `customerId`, `displayName`, `email`, `language`, `country`.

Forbidden in snapshot: document content, consent types, marketing flags.

## Test results

```
legal-document-delivery-evidence.service.spec.ts     — unit tests (presentation, idempotency, immutability, tenant, privacy parity)
legal-document-delivery-evidence.integration.spec.ts — controller wiring
```

Full legal/booking suite: run `npm test -- --testPathPattern="legal-document|booking-document|rental-contract"`

## Not in scope (Prompt 20)

Pickup gate enforcement — evidence API is ready but not wired to handover blocking.
