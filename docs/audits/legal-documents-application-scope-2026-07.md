# Legal Documents — Application Scope (Prompt 7/32)

**Date:** 2026-07-22  
**Scope:** Explicit application-scope dimensions for organization legal documents.

## Disclaimer

SynqDrive stores administratively approved scope rules. It does not determine which legal rule applies to a booking — resolution follows in Prompt 8.

## Model decisions

### Scope on `OrganizationLegalDocument`

| Field | Type | Default (legacy) | Notes |
|-------|------|------------------|-------|
| `language` | string | `de` | ISO 639-1 (+ optional region, e.g. `de-DE`) |
| `jurisdictionCountry` | string | `DE` | ISO 3166-1 alpha-2 |
| `customerSegment` | enum | `BOTH` | `B2C`, `B2B`, `BOTH` |
| `bookingChannel` | enum | `ALL` | `MANUAL`, `WEBSITE`, `API`, `OPERATOR_APP`, `ALL` |
| `productScope` | `BusinessType?` | `null` | `null` = all business types |
| `stationScopeMode` | enum | `ORGANIZATION_WIDE` | `ORGANIZATION_WIDE` or `STATION_SPECIFIC` |
| `priority` | int | `0` | Higher wins when scopes overlap (Prompt 8 resolver) |
| `isMandatory` | boolean | `true` | Drives readiness rules (Prompt 8+) |
| `noticePurpose` | enum | derived | Mirrors document type / consumer variant |
| `validFrom` / `validUntil` | datetime | existing | Already present; validated on input |

### Normalized station relation

`OrganizationLegalDocumentStation` junction table — no JSON station lists.

### Single-ACTIVE index removed

Migration drops `organization_legal_documents_single_active_key`. Multiple ACTIVE documents are allowed when application scopes differ. Conflicts are detected explicitly — never silently resolved via `findFirst`.

### Priority model

- Overlapping scopes with **different** priorities: allowed (deterministic resolution by priority in Prompt 8).
- Overlapping scopes with **same** priority: `LEGAL_DOCUMENT_SCOPE_CONFLICT` at activation / scope update.
- Identical scope fingerprint among ACTIVE candidates: conflict regardless of priority.

### Conflict detection

Module: `legal-document-scope.conflicts.ts`  
Service: `LegalDocumentScopeService.assertNoScopeConflicts()`

Checked on:
- `PATCH …/legal-documents/:id/application-scope`
- `POST …/legal-documents/:id/activate`

## Migration (`20260722150000_legal_document_application_scope`)

1. Adds Prisma enums + scope columns with documented defaults.
2. Backfills `jurisdictionCountry` from `language` (`de`→`DE`, `at`→`AT`, `ch`→`CH`).
3. Backfills `noticePurpose` from `documentType` / `legalVariant`.
4. Creates `organization_legal_document_stations` junction table.
5. Backfills event scope snapshots.
6. Adds resolver query index `organization_legal_documents_resolver_scope_idx`.
7. **Drops** legacy partial unique index on `(org, type, language)`.

### Legacy document defaults

```text
language=de, jurisdictionCountry=DE, customerSegment=BOTH, bookingChannel=ALL,
productScope=null, stationScopeMode=ORGANIZATION_WIDE, priority=0, isMandatory=true
```

Existing ACTIVE rows remain ACTIVE with these defaults — no PDF or lifecycle status changes.

## API

| Endpoint | Scope |
|----------|-------|
| `POST …/upload` | Accepts scope fields (multipart body) |
| `PATCH …/:id/application-scope` | Update scope on non-ACTIVE documents |
| `GET …/` | Returns `applicationScope` in DTO |

DTO validation: `dto/legal-document-scope.dto.ts` (class-validator).

## Open migration / follow-up cases (Prompt 8+)

| Case | Status |
|------|--------|
| Booking bundle resolver (`getActiveByType`) | Still language-only — **Prompt 8** |
| `isMandatory` enforcement in missing-slot logic | **Prompt 8+** |
| UI for scope editing | Admin UI prep only |
| Re-introducing DB uniqueness for identical fingerprints among ACTIVE | Consider partial unique on scope fingerprint hash |
| Cross-variant ACTIVE `CONSUMER_INFORMATION` under old single-active model | Now allowed with distinct `legalVariant` / `noticePurpose` |
| Harness tests | Still simulate legacy type+language ACTIVE invariant for activation races |

## Tests

| Suite | Coverage |
|-------|----------|
| `legal-document-scope.validation.spec.ts` | Invalid language/country codes, legacy defaults, station scope |
| `legal-document-scope.conflicts.spec.ts` | Overlapping validity, B2B/B2C, stations, priorities |
| `legal-document-scope.legacy.spec.ts` | Migrated legacy row shape |

**Scope tests:** 23 passed (3 suites)  
**Full legal-documents target:** 116 passed (12 suites)

## Files

- `backend/prisma/schema.prisma` + migration
- `legal-document-scope.constants.ts`
- `legal-document-scope.validation.ts`
- `legal-document-scope.conflicts.ts`
- `legal-document-scope.service.ts`
- `dto/legal-document-scope.dto.ts`
