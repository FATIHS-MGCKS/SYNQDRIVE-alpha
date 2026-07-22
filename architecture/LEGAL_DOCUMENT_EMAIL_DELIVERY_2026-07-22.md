# Legal Document Email Delivery — Architecture (2026-07-22)

**Version:** V4.9.760 (Prompt 21/32)

## Components

| Component | Role |
|-----------|------|
| `BookingLegalDocumentEmailService` | Frozen bundle resolution, idempotency, evidence recording |
| `BookingDocumentEmailService` | PDF attachment send via Resend (private storage) |
| `LegalDocumentDeliveryEvidenceService` | Presentation + webhook status propagation |
| `ResendWebhookService` | Provider events → OutboundEmail + evidence |
| `OutboundEmailPolicyService` | Org sender identity |

## Data

- Migration `20260722240000_outbound_email_send_idempotency` — `OutboundEmail.sendIdempotencyKey`
- Evidence linked via `outboundEmailId` + `requestId`

## Related

- Prompt 15 bundle pointers, Prompt 18 delivery evidence, Prompt 19 generation workflow, Prompt 20 pickup gate
