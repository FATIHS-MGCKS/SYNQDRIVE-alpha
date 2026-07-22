# Legal Document Bundle Pointers — Architecture (2026-07-22)

## Context

Prompt 15/32 completes type-safe wiring of legal document bundle pointers for the booking document lifecycle. Prior migrations added `privacyDocumentId` columns; this change connects runtime logic.

## Signal flow

```
Booking confirmed
  → BookingDocumentBundleService.generateInitialBundle
    → LegalDocumentResolverService.resolveForBooking (Prompt 8)
    → attachLegalDocuments (per slot: TERMS, CONSUMER_INFORMATION, PRIVACY_POLICY)
      → create STATIC_LEGAL GeneratedDocument (frozen version snapshot)
      → setBundlePointer (idempotent, no overwrite unless force)
    → ensureRentalContract (uses frozen pointers first, then resolver)
    → refreshBundleStatus (requires all three legal pointers for COMPLETE)
```

## Central mapping module

`booking-document-bundle-pointer.mapping.ts` is the compile-time source of truth:

- `BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES` — exhaustive legal slots
- `BUNDLE_LEGAL_POINTER_FIELD` — `satisfies Record<Slot, keyof BookingDocumentBundle>`
- `resolveBundlePointerField()` — no loose string compares at call sites
- Legacy `WITHDRAWAL_INFORMATION` canonicalized to consumer slot

## DTO extension

`BundleLegalPointerView`:

- `termsAttached`, `privacyAttached`, `consumerAttached`
- `termsDocumentId`, `privacyDocumentId`, `consumerDocumentId`
- `withdrawalAttached` — deprecated alias for API compatibility

## Monitoring

`BookingDocumentBundleMonitoringService` emits structured logs:

- `ALERT` — mapping missing, resolver conflicts
- `WARN` — missing mandatory selection (org config gap)

## Historical bundles

Pointer immutability rules:

1. Existing non-null pointer + non-VOID document → skip re-attach
2. `setBundlePointer` returns `false` without DB write when value unchanged
3. `setBundlePointer` refuses overwrite when `force` is false
4. Contract/rental snapshots reference resolved `legalDocumentId`, not live ACTIVE row

## Phase requirements

`DOCUMENT_PHASE_REQUIREMENTS.CONFIRMED` includes `PRIVACY_POLICY` alongside AGB and Verbraucherinformation.

## Related

- Prompt 8: `LegalDocumentResolverService`
- Migration `20260722100000_legal_document_privacy_pointers`
- Migration `20260722140000_legal_document_consumer_information`
