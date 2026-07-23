# Legal Documents — Consumer Information (Prompt 6/32)

**Date:** 2026-07-22  
**Scope:** Neutralize prescriptive `WITHDRAWAL_INFORMATION` / „Widerrufsbelehrung“ into administratively configurable `CONSUMER_INFORMATION` + `legalVariant`.

## Disclaimer

SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch keine juristische Prüfung oder Rechtsberatung. Keine rechtsverbindlichen Standardtexte werden generiert; vorhandene Kundendokumente (PDF-Inhalte) werden nicht verändert.

## Problem

The legacy model used `documentType = WITHDRAWAL_INFORMATION`, implying that every rental necessarily includes a statutory withdrawal right. That is a legal determination the software must not make.

## New type structure

| Layer | Field | Values |
|-------|-------|--------|
| Category | `documentType` | `CONSUMER_INFORMATION` (canonical) |
| Variant | `legalVariant` | `WITHDRAWAL_RIGHT_NOTICE`, `NO_WITHDRAWAL_RIGHT_NOTICE`, `OTHER_CONSUMER_INFORMATION` |

`TERMS_AND_CONDITIONS` and `PRIVACY_POLICY` are unchanged. `WITHDRAWAL_INFORMATION` remains accepted on API **input** only (deprecated alias).

## Migration (`20260722140000_legal_document_consumer_information`)

- Adds nullable `legal_variant` to `organization_legal_documents`, `generated_documents`, `organization_legal_document_events`.
- Adds `document_type` snapshot on events (backfilled from parent document).
- Updates rows where `document_type = 'WITHDRAWAL_INFORMATION'` → `CONSUMER_INFORMATION` + `legal_variant = 'WITHDRAWAL_RIGHT_NOTICE'`.
- Does **not** modify object keys, PDF bytes, or bundle pointer field names (`withdrawalDocumentId` unchanged).

## Compatibility mapping

| Direction | Behavior |
|-----------|----------|
| Write (upload) | `documentType: WITHDRAWAL_INFORMATION` normalized to `CONSUMER_INFORMATION`; default variant `WITHDRAWAL_RIGHT_NOTICE` unless `legalVariant` provided |
| Read (DTO) | `legacyDocumentType: WITHDRAWAL_INFORMATION` when canonical type is `CONSUMER_INFORMATION` and variant is `WITHDRAWAL_RIGHT_NOTICE` |
| Lookup | `legalDocumentLookupKeys()` / `hasOrgActiveLegalDocument()` resolve both canonical and legacy keys for bundle/org maps |

Module: `backend/src/modules/documents/legal-document-type.compat.ts`

## Impact on existing data

- All historical org legal uploads and generated customer documents keep their PDF content.
- Storage keys and bundle pointers are untouched.
- Migrated rows gain explicit `legal_variant` for audit clarity.
- Event log rows receive `document_type` / `legal_variant` snapshots on backfill and on new writes.

## Tests

| Suite | Coverage |
|-------|----------|
| `legal-document-type.compat.spec.ts` | Legacy mapping, migration defaults, API read/write compat, new variants, historical lookup |
| `documents.service.spec.ts` | Legacy upload normalization |
| `booking-document-phase.util.spec.ts` | Phase requirements use `CONSUMER_INFORMATION`; legacy org map keys |
| `booking-document-org-legal-notification.service.spec.ts` | Neutral notification copy |
| `frontend/.../legal-document-types.test.ts` | UI grouping + variant labels |

**Backend (targeted):** 95 tests passed (10 suites) as of 2026-07-22.  
**Frontend:** 2 tests passed.

## Files changed

- `backend/prisma/schema.prisma` + migration
- `backend/src/modules/documents/legal-document-type.compat.ts`
- `backend/src/modules/documents/documents.constants.ts`
- `backend/src/modules/documents/legal-documents.service.ts`
- `backend/src/modules/documents/booking-document-*.ts`
- `frontend/src/rental/lib/legal-document-types.ts`
- `frontend/src/rental/components/LegalDocumentsTab.tsx`
