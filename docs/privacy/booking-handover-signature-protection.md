# Booking handover signature protection (Prompt 20)

Handover signatures are sensitive legal evidence. They are no longer stored or
returned as embedded data-URLs in booking list, calendar, timeline, or summary
API responses.

## Storage model

Table `booking_handover_signatures` stores per protocol + role (`CUSTOMER` |
`STAFF`):

- `object_key`, `storage_provider`, `content_hash`, `mime_type`, `size_bytes`
- `signed_at`, `signer_name`
- retention columns (`retention_class`, `deletion_eligible_at`, `deleted_at`)
- migration audit (`storage_status`, `migrated_at`, `legacy_cleared_at`, `migration_run_id`)

Blobs live in the existing private document storage port (local dev / encrypted
S3-compatible production). The protocol table keeps legacy `*_signature_data_url`
columns only until the idempotent migration clears them after verified storage.

## API surface

### Summary fields (list / detail / handover GET)

Per role:

- `signaturePresent`
- `signedAt`
- `signatureReferenceId`

Protocol level:

- `protocolCompleted`

No `customerSignatureDataUrl` / `staffSignatureDataUrl` in responses.

### Ingest (handover POST)

Create payloads may still send data-URLs. The server validates MIME + size,
writes encrypted objects, and persists secure references only.

### Authorized view URL

Permission: `booking.signature.read` → `legal-documents-audit` read.

```
POST /api/v1/organizations/:orgId/bookings/:bookingId/handover/signatures/:signatureReferenceId/view-url
→ { signatureReferenceId, viewUrl, expiresAt }
```

`viewUrl` points to an opaque token route (default TTL 300s):

```
GET /api/v1/booking-signature-access/:token
```

Tokens are stored hashed; URLs are not guessable.

## Migration

Script: `backend/scripts/booking-handover-signature-migration.ts`

- Resumable via `--checkpoint`
- Idempotent (`protocolId + role` unique)
- Audited in `booking_handover_signature_migration_events`
- Clears legacy data-URL columns only after storage hash verification

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/booking-handover-signature-migration.ts --org <uuid> --dry-run
npx ts-node -r tsconfig-paths/register scripts/booking-handover-signature-migration.ts --org <uuid> --apply
```

Prisma migration: `backend/prisma/migrations/20260723700000_booking_handover_signature/`

## Retention

`BookingHandoverSignatureService.markDeletionEligible` and
`purgeEligibleSignatures` support technical deletion after retention policy
eligibility.
