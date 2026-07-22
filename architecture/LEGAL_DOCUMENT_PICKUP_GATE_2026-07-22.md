# Legal Document Pickup Gate — Architecture (2026-07-22)

**Version:** V4.9.759 (Prompt 20/32)

## Components

| Component | Role |
|-----------|------|
| `BookingPickupGateService` | Orchestrates pre-pickup checks |
| `BookingPickupGateAuditService` | Append-only `booking_pickup_gate_audit_events` |
| `BookingDocumentCompletenessService` | Bundle + legal slot evaluation |
| `LegalDocumentDeliveryEvidence` | Presentation / acknowledgment proof |
| `BookingDocumentGenerationJob` | Blocks while mandatory generation active |
| `BookingsHandoverService` | Invokes gate; derives actor from auth |

## Signal flow

1. `POST …/handover/pickup` → `resolveHandoverActor(CurrentUser)`
2. `BookingPickupGateService.assertPickupAllowed`
3. On success → `$transaction`: protocol, booking `ACTIVE`, vehicle `RENTED`, optional override audit
4. Post-commit → enqueue pickup protocol PDF generation

## Auth model

- `performedByUserId` / `performedByName` removed from trusted client contract
- Legacy client fields trigger `PICKUP_GATE_ACTOR_MANIPULATION`
- Override requires `legal_documents.override_handover`

## Persistence

Migration `20260722230000_booking_pickup_gate_audit` — `BookingPickupGateAuditEvent`.

## Related docs

- `docs/audits/legal-documents-pickup-gate-2026-07.md`
- Prompt 16 completeness, Prompt 18 delivery evidence, Prompt 19 generation workflow
