# Booking Legal Acceptance Model

Revision-safe, append-only legal acceptance events for rental bookings.

## Purpose

SynqDrive must prove **what** legal text or contract version a customer accepted, **when**, **by whom**, and under **which legal basis** — without conflating delivery proof with GDPR consent or storing a single `privacyAccepted` boolean.

This model is distinct from:

| System | Role |
|--------|------|
| `LegalDocumentDeliveryEvidence` | Proof that a legal text was presented/delivered (email, UI). Not consent. |
| `BookingLegalAcceptance` | Contract acceptance, privacy **notice acknowledgment**, optional consents, rental contract signing, handover/return signatures. |
| Wizard `privacyAccepted` flag | Deprecated UI signal only. Server writes `PRIVACY_NOTICE_ACKNOWLEDGMENT` when frozen document refs exist. |

## Acceptance types

| `acceptanceType` | Meaning | Default `legalBasis` | Revocable |
|------------------|---------|----------------------|-----------|
| `TERMS_CONTRACT_ACCEPTANCE` | AGB / contract terms accepted for rental formation | `CONTRACT` | No |
| `PRIVACY_NOTICE_ACKNOWLEDGMENT` | Art. 13/14 GDPR notice acknowledged (not Art. 6(1)(a) consent) | `NOTICE_ACKNOWLEDGMENT` | No |
| `MARKETING_CONSENT` | Optional marketing permission | `CONSENT` | Yes |
| `OTHER_CONSENT` | Optional additional permission with explicit `purpose` | `CONSENT` | Yes |
| `RENTAL_CONTRACT_SIGNATURE` | Rental contract signed | `CONTRACT` | No |
| `HANDOVER_SIGNATURE` | Pickup protocol customer/staff signature | `CONTRACT` | No |
| `RETURN_SIGNATURE` | Return protocol customer/staff signature | `CONTRACT` | No |

## Record shape

Each row in `booking_legal_acceptances` is immutable. Required fields:

- `organizationId`, `bookingId`, `customerId`
- `actorType`, `actorId` (when known)
- `documentType`, `documentVersion`, `immutableDocumentHash`, `language`
- `acceptanceType`, `legalBasis`, `purpose` (when applicable)
- `acceptedAt`, `source`
- `eventKind`: `ACCEPTANCE` | `REVOCATION` | `CORRECTION`
- `revokedAt` — only on `REVOCATION` events for revocable consents
- `metadata` — sparse JSON; no PDF bodies, HTML, or raw signature data URLs

Optional foreign keys:

- `legalDocumentId` → `organization_legal_documents`
- `generatedDocumentId` → frozen per-booking `generated_documents`
- `handoverProtocolId` → `booking_handover_protocols`
- `relatedAcceptanceId` → prior event (revocation/correction chain)

## Immutability

- No `UPDATE` or `DELETE` API.
- Corrections append a new `CORRECTION` or `ACCEPTANCE` row with `relatedAcceptanceId`.
- Revocations append a `REVOCATION` row; original acceptance remains unchanged.
- Active consent is derived by reading the latest event per `(acceptanceType, document hash)` chain.

## Tenant and permission model

| Action | Permission |
|--------|------------|
| List / read | `booking_legal_acceptance.read` → `legal-documents-audit` read |
| Record / revoke | `booking_legal_acceptance.record` → `bookings` write |

All endpoints use `OrgScopingGuard` + `PermissionsGuard`.

API:

- `GET /organizations/:orgId/bookings/:bookingId/legal-acceptances`
- `GET /organizations/:orgId/bookings/:bookingId/legal-acceptances/:id`
- `POST /organizations/:orgId/bookings/:bookingId/legal-acceptances`
- `POST /organizations/:orgId/bookings/:bookingId/legal-acceptances/:id/revoke`
- `GET /organizations/:orgId/customers/:customerId/legal-acceptances`

## Indexes

- `(organizationId, bookingId)`
- `(organizationId, customerId)`
- `(organizationId, documentType)`
- `(organizationId, acceptedAt)`
- `(organizationId, acceptanceType, acceptedAt)`
- Unique `(organizationId, requestId)` when `requestId` is set (idempotency)

## Retention

Columns prepared (aligned with legal document retention):

- `retentionClass` default `LEGAL_ACCEPTANCE`
- `retainUntil`, `deletionEligibleAt`
- `legalHold`, `legalHoldReason`, `legalHoldSetAt`, `legalHoldSetByUserId`

Automatic purge is **not** enabled in Prompt 17. Future work can extend `LegalDocumentRetentionService` or a dedicated job to honour holds and reference guards.

## Migration

Migration: `backend/prisma/migrations/20260723500000_booking_legal_acceptance/migration.sql`

Creates enums, table, indexes, and foreign keys. **No data backfill.**

## Backfill strategy

**Do not** backfill historical bookings from:

- `privacyAccepted` wizard booleans
- `documentsAcknowledged` on handover protocols
- unsigned rental contract rows

Those fields may indicate UI state but are **not** audit-grade proof with document version + SHA-256.

If a tenant requires historical import:

1. Obtain verifiable source exports (e.g. signed PDF archive + timestamped audit log).
2. Import via `POST …/legal-acceptances` with explicit `acceptedAt`, document refs, and `metadata.importSource`.
3. Never auto-mark pre-migration rows as proven consent.

## Checkout integration

`BookingWizardDraftService.confirmDraft` calls `recordCheckoutAcceptancesFromFlags`:

- `agbAccepted` → `TERMS_CONTRACT_ACCEPTANCE` when bundle `termsDocumentId` resolves with checksum
- `privacyAccepted` → `PRIVACY_NOTICE_ACKNOWLEDGMENT` (not `CONSENT`) when `privacyDocumentId` resolves
- Optional `marketingConsent` / `otherConsent` when explicitly passed

If frozen pointers or checksums are missing, **no row is written** (fail-safe, no synthetic proof).

## Handover integration

`BookingsHandoverService.createHandover` records `HANDOVER_SIGNATURE` / `RETURN_SIGNATURE` events with signature **names** in metadata only — never `customerSignatureDataUrl` / `staffSignatureDataUrl`.

## Operational queries

**Is marketing consent active for a customer?**

Latest event for `acceptanceType = MARKETING_CONSENT` where no later `REVOCATION` references that acceptance id.

**What AGB version applied to booking X?**

Latest `TERMS_CONTRACT_ACCEPTANCE` for `bookingId`, ordered by `acceptedAt`.

## Related code

- `backend/src/modules/bookings/legal-acceptance/`
- Prisma model `BookingLegalAcceptance`
- Tests: `booking-legal-acceptance.service.spec.ts`
