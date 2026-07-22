# Legal Document Delivery Evidence — Architecture (2026-07-22)

## Context

Prompt 18/32 introduces booking-scoped delivery evidence for legal texts. Complements Prompt 17 (frozen contract snapshots) and feeds future Prompt 20 (pickup gate).

## Signal flow

```
LegalDocumentDeliveryEvidenceController
  → LegalDocumentDeliveryEvidenceService
    → recordPresentation (server presentedAt, actor from auth)
    → updateDeliveryStatus (email lifecycle only, until terminal)
    → recordAcknowledgment (seals row)
```

- Pickup gate (Prompt 20) reads evidence for presentation/acknowledgment — **email send now populates EMAIL channel evidence**

Future producers (partially addressed Prompt 21):
- `BookingDocumentEmailService` → EMAIL channel evidence ✅
- Checkout wizard → PORTAL + EXPLICIT_CHECKBOX acknowledgment
- Handover → IN_PERSON (Prompt 20 gate)

## Immutability contract

```
mutable:   deliveryStatus, deliveredAt, outboundEmailId (until terminal or acknowledged)
immutable: presentedAt, checksum, versionLabel, documentType, recipientSnapshot at creation
sealed:    acknowledgedAt set OR deliveryStatus ∈ {DELIVERED, FAILED, BOUNCED}
```

## Consent boundary

```
LegalDocumentDeliveryEvidence     → legal TEXT delivery + receipt acknowledgment
WhatsAppConsent                   → marketing/transactional messaging
CustomerVerificationCheck         → KYC identity decision
OrgDataAuthorization              → data processing scope
VehicleProviderConsent            → telematics
```

## Related

- Prompt 17: `RentalContract.legalRefsSnapshot`
- Prompt 16: `DELIVERY_PENDING` / `ACKNOWLEDGMENT_PENDING` completeness
- `docs/audits/legal-documents-delivery-evidence-2026-07.md`
