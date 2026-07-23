# Booking Legal Document Snapshots

Immutable presentation snapshots binding legal documents to bookings with cryptographic integrity.

## Purpose

Before checkout confirmation or signature, SynqDrive freezes the **exact document bytes** presented to the customer into an append-only `booking_legal_document_snapshots` row. `BookingLegalAcceptance` references this snapshot — not live template state.

## Stored fields

| Field | Meaning |
|-------|---------|
| `templateKey` / `templateVersion` | Source template identity (generated PDFs) |
| `renderedVersion` | Frozen legal version label shown to customer |
| `hashAlgorithm` | Always `sha256` today |
| `contentHash` | SHA-256 over stored object bytes |
| `language` | Presentation language |
| `generatedDocumentId` | Frozen per-booking `generated_documents` row |
| `legalDocumentId` | Source org legal master (STATIC_LEGAL) |
| `presentationContext` | `CHECKOUT`, `RENTAL_CONTRACT`, `HANDOVER`, `STATIC_LEGAL_ATTACH` |
| `integrityStatus` | `VERIFIED`, `UNVERIFIED`, `CHECKSUM_MISMATCH`, `MISSING_OBJECT` |

## Flow

```
attachLegalDocuments → create STATIC_LEGAL GeneratedDocument
  → create BookingLegalDocumentSnapshot (idempotent)
checkout confirm → ensureCheckoutSnapshots
  → record BookingLegalAcceptance with legalDocumentSnapshotId
download → verify checksum against storage (STATIC_LEGAL + legal types)
```

## Immutability guarantees

1. Snapshots are append-only — new template version → new `contentHash` → new snapshot row.
2. `assertNoSilentRegeneration` blocks same `renderedVersion` with different checksum without explicit `force`.
3. Old bookings keep old snapshot rows; template changes do not mutate historical records.
4. Legal acceptance FK `legalDocumentSnapshotId` binds consent to the frozen snapshot.

## Audit events

`booking_legal_document_snapshot_events` (append-only):

- `SNAPSHOT_CREATED`
- `SNAPSHOT_INTEGRITY_VERIFIED`
- `SNAPSHOT_INTEGRITY_FAILED`
- `SNAPSHOT_RETRIEVAL_BLOCKED`
- `SNAPSHOT_SILENT_REGENERATION_BLOCKED`

## API

- `GET /organizations/:orgId/bookings/:bookingId/legal-document-snapshots`
- `GET …/legal-document-snapshots/:id`
- `POST …/legal-document-snapshots/:id/verify-integrity`

Permission: `legal_documents.audit_view`

## Related code

- `backend/src/modules/documents/legal-document-snapshot/`
- Migration: `20260723600000_booking_legal_document_snapshot`
- Prompt 17: `booking_legal_acceptances.legal_document_snapshot_id`
