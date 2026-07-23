# Legal Document Privacy Pointers — Schema (2026-07-22)

> Prompt 2/32 — Production-Readiness „Verwaltung → Rechtliche Dokumente“.  
> Detail: [`docs/audits/legal-documents-schema-privacy-pointers-2026-07.md`](../docs/audits/legal-documents-schema-privacy-pointers-2026-07.md)

## Changes

- Prisma migration `20260722100000_legal_document_privacy_pointers`: nullable
  `privacy_document_id` on `booking_document_bundles` and `rental_contracts`.
- Explicit Prisma relations from legal snapshot pointers (`termsDocumentId`,
  `withdrawalDocumentId`, `privacyDocumentId`) on `BookingDocumentBundle` and
  `RentalContract` to `GeneratedDocument` with `onDelete: SetNull`.
- Indexes on all three legal pointer columns (bundle + contract).
- DB FKs to `generated_documents` with `ON DELETE SET NULL`; existing
  terms/withdrawal FKs added as `NOT VALID` for backward compatibility.

## Architektur (data-model delta)

- Legal STATIC_LEGAL snapshots in bundles/contracts are now first-class relation
  targets on `GeneratedDocument` (reverse arrays on document side).
- `OrganizationLegalDocument` remains the org-level upload source; bundle/contract
  pointers still reference per-booking `GeneratedDocument` rows, not org uploads
  directly.
- **No service-layer changes** in this prompt — `BookingDocumentBundleService`
  still does not set `privacyDocumentId` until a follow-up prompt.

## Notes

- Backfill of `privacy_document_id` from existing `generated_documents` rows is
  deferred (ops script / service wiring in Prompt 3+).
