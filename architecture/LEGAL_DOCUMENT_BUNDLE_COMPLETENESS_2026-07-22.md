# Booking Document Bundle Completeness — Architecture (2026-07-22)

## Context

Prompt 16/32 centralizes all booking document package completeness evaluation. Prior prompts (8 resolver, 15 pointers) provided inputs; this prompt unifies status derivation.

## Signal flow

```
BookingDocumentBundleService.refreshBundleStatus / getBundleView
  → BookingDocumentCompletenessService.evaluateForBooking
    → batch load: bundle, generatedDocuments, handoverProtocols, outboundEmail attachments, org active legal
    → LegalDocumentResolverService.resolveForBooking
    → evaluateBookingDocumentCompleteness (pure engine)
  → persist legacyBundleStatus + warnings
  → syncMissingDocumentTasks (phases from completeness)
  → BookingDocumentOrgLegalNotificationService (orgConfigurationGaps)
```

## Single evaluation contract

All consumers read from `BundleCompletenessResult`:

- Bundle view API (`completeness` field on `BundleView`)
- Persisted `BookingDocumentBundle.status` via `legacyBundleStatus`
- Task automation (`phases[].missingDocuments`)
- Org notifications (`orgConfigurationGaps`)
- Booking detail (`completenessStatus`, document slots)

## No parallel derivations

Removed: `requiredTypesForStage`, inline `legalMissing` pointer checks, divergent `DOC_SLOTS` without privacy.

## Mandatory legal rule

`COMPLETE` is impossible when AGB, Verbraucherinformation, or Datenschutzhinweis is absent — regardless of org configuration gaps (those drive org-level notifications, not false `COMPLETE`).

## Performance

Single `evaluateForBooking` call batches:
- bundle + generated docs + handover + resolver + org active legal (parallel)
- legal rows by ID (one query)
- delivery proofs via `outboundEmailAttachment` (one query)

No per-document N+1.

## Related

- Prompt 8: `LegalDocumentResolverService`
- Prompt 15: `booking-document-bundle-pointer.mapping.ts`
- `docs/audits/legal-documents-bundle-completeness-2026-07.md`
