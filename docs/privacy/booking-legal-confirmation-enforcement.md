# Booking Legal Confirmation Enforcement

Server-side enforcement of mandatory legal confirmations at booking checkout (Prompt 19).

## Technical scope (not legal certification)

SynqDrive enforces a **technical separation** between:

| Category | Examples | Blocks CONFIRMED? |
|----------|----------|-------------------|
| Mandatory contract / notice acceptance | AGB (`TERMS_CONTRACT_ACCEPTANCE`), privacy notice acknowledgment (`PRIVACY_NOTICE_ACKNOWLEDGMENT`) | Yes |
| Mandatory presentation snapshots | Terms, consumer information, privacy policy | Yes |
| Optional consent | Marketing (`MARKETING_CONSENT`) | No |

This document describes **system behavior**, not legal compliance certification.

## Server-side gate

`BookingLegalConfirmationEnforcementService.enforceAndRecordCheckoutConfirmation` runs in `confirmDraft` **before** the booking transitions to `CONFIRMED`.

### Checks (CONFIRMED only)

1. **Acceptance flags** — `agbAccepted` and `privacyAccepted` must be `true` (UI checkbox alone is insufficient without downstream evidence recording).
2. **Bundle pointers** — mandatory legal documents attached to `BookingDocumentBundle`.
3. **Snapshots** — `ensureCheckoutSnapshots` creates/returns immutable `booking_legal_document_snapshots` rows.
4. **Integrity** — snapshots with `CHECKSUM_MISMATCH` or `MISSING_OBJECT` are rejected.
5. **Version match** — snapshot `legalDocumentId` + `renderedVersion` must match current `LegalDocumentResolverService` output for the booking context (org, language, scope).
6. **Evidence recording** — on success, `BookingLegalAcceptanceService.recordCheckoutAcceptancesFromFlags` writes append-only acceptance events linked to snapshots.

### Optional consents

`marketingConsent` may be `false` or omitted — confirmation proceeds.

## Stable error codes

| Code | Meaning |
|------|---------|
| `LEGAL_DOCUMENT_MISSING` | Bundle pointer, snapshot, or resolver gap |
| `LEGAL_ACCEPTANCE_REQUIRED` | Mandatory acceptance flags not `true`, or no acceptance records |
| `LEGAL_DOCUMENT_VERSION_MISMATCH` | Presented snapshot stale vs current org legal version |
| `LEGAL_EVIDENCE_INVALID` | Snapshot integrity failure |

Returned as HTTP 409 `ConflictException` with `{ code, message, ...details }`.

## Bypass protection

| Attack vector | Mitigation |
|---------------|------------|
| Confirm API without `agbAccepted`/`privacyAccepted` | `LEGAL_ACCEPTANCE_REQUIRED` |
| Confirm with flags but no bundle/snapshots | `LEGAL_DOCUMENT_MISSING` |
| Stale document after org legal update | `LEGAL_DOCUMENT_VERSION_MISMATCH` |
| Tampered storage object | `LEGAL_EVIDENCE_INVALID` |
| Direct `PATCH` booking → CONFIRMED without wizard | `assertExistingLegalEvidenceForConfirmation` requires prior snapshots + acceptances |

## Frontend

No visual changes in Prompt 19. Existing checkout error surfaces receive structured `code` values.

## Related code

- `backend/src/modules/bookings/legal-confirmation/`
- `booking-wizard-draft.service.ts` — `confirmDraft`
- `bookings.service.ts` — direct confirm transition guard
