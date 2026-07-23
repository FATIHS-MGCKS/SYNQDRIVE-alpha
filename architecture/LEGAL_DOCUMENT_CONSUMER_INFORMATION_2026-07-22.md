# Legal Document Consumer Information — Architecture Record

**Date:** 2026-07-22  
**Prompt:** 6/32

## Summary

Legal document types separate **category** (`documentType`) from **administratively chosen variant** (`legalVariant`). The prescriptive `WITHDRAWAL_INFORMATION` type is replaced by neutral `CONSUMER_INFORMATION` with explicit variants. SynqDrive does not determine which variant applies — the rental company selects and approves content.

> SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch keine juristische Prüfung oder Rechtsberatung.

## Data model

```
OrganizationLegalDocument
  documentType: CONSUMER_INFORMATION | TERMS_AND_CONDITIONS | PRIVACY_POLICY
  legalVariant: WITHDRAWAL_RIGHT_NOTICE | NO_WITHDRAWAL_RIGHT_NOTICE | OTHER_CONSUMER_INFORMATION | null

GeneratedDocument
  documentType + legalVariant (snapshot at generation time)

OrganizationLegalDocumentEvent
  documentType + legalVariant (snapshot at event time)
```

## Compatibility layer

`legal-document-type.compat.ts` (no circular import with `documents.constants`):

- `normalizeLegalDocumentType()` — `WITHDRAWAL_INFORMATION` → `CONSUMER_INFORMATION`
- `resolveLegalVariantInput()` — legacy upload defaults to `WITHDRAWAL_RIGHT_NOTICE`
- `toLegacyDocumentType()` — read-path alias for API clients expecting `WITHDRAWAL_INFORMATION`
- `legalDocumentLookupKeys()` / `hasOrgActiveLegalDocument()` — historical bundle/org resolution

## Service integration

```
LegalDocumentsService.upload
  └─ normalize type + resolve variant → persist canonical values

LegalDocumentsService.toDto
  └─ documentType (canonical) + legalVariant + legacyDocumentType (optional)

BookingDocumentBundleService
  └─ BUNDLE_FIELD uses CONSUMER_INFORMATION; withdrawalDocumentId pointer name unchanged

booking-document-missing-slots.util
  └─ hasOrgActiveLegalDocument for legacy-keyed org maps
```

## API contract (backward compatible)

**Upload:** accepts `documentType: WITHDRAWAL_INFORMATION` or `CONSUMER_INFORMATION`; optional `legalVariant`.

**List/detail response:**

```json
{
  "documentType": "CONSUMER_INFORMATION",
  "legalVariant": "WITHDRAWAL_RIGHT_NOTICE",
  "legacyDocumentType": "WITHDRAWAL_INFORMATION"
}
```

Clients that only read `documentType` should migrate to `legalVariant`; `legacyDocumentType` is transitional.

## Migration

`20260722140000_legal_document_consumer_information`:

1. Add `legal_variant` columns
2. Remap `WITHDRAWAL_INFORMATION` rows (content unchanged)
3. Backfill event snapshots from parent documents

## References

- `docs/audits/legal-documents-consumer-information-2026-07.md`
- `backend/src/modules/documents/legal-document-type.compat.ts`
- `frontend/src/rental/lib/legal-document-types.ts`
