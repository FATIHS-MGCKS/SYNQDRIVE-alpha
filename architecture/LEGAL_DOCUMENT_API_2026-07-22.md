# Legal Document API — Response & Error Contract

**Date:** 2026-07-22  
**Prompt:** 9/32 (Production readiness — Rechtliche Dokumente)

## Data flow

```
Client (rental admin UI)
  → LegalDocumentsController (OrgScopingGuard + RolesGuard)
  → LegalDocumentsService / LegalDocumentEventsService
  → legal-document-api.mapper (safe DTO projection)
  → Prisma (OrganizationLegalDocument, GeneratedDocument snapshot counts, User actor refs)
```

Private PDF bytes flow only through `GET …/:id/download` → `DocumentStoragePort.getObjectStream` — never via JSON.

## Response projection rules

1. **Never expose** `objectKey`, `storageProvider`, presigned URLs, or internal bucket paths.
2. **Map scope** to API names: `jurisdictionCountry` → `jurisdiction`, `bookingChannel` → `channelScope`, stations → `stationScope`.
3. **Actor refs** resolved in batch from `User` (`id`, `displayName`) for upload/approve/activate audit IDs.
4. **`snapshotCount`** = `COUNT(GeneratedDocument WHERE legalDocumentId = doc.id AND organizationId = orgId)`.
5. **`integrityStatus`** derived from checksum + `sizeBytes`; **`scanStatus`** defaults to `NOT_SCANNED` until a scan pipeline exists.
6. **`pageCount`** reserved (null) for future PDF metadata extraction.

## Pagination conventions

Aligned with `shared/utils/pagination.ts`:

- Default `page=1`, `limit=20`, max `limit=100`.
- List endpoint: unpaginated array when no `page`/`limit` (legacy compat).
- Events: always paginated `{ data, meta }`.

## Error taxonomy

Domain errors live in `legal-documents-api.errors.ts` and extend `HttpException` with `{ message, code }`:

- **409** — lifecycle/activation/scope conflicts (non-retryable without user action)
- **422** — validation and illegal business transitions
- **404** — tenant-scoped not found (generic message)

Scope conflicts thrown from `LegalDocumentScopeService.assertNoScopeConflicts` use `LegalDocumentScopeConflictError`.

## OpenAPI

Project serves Swagger at `/docs` (`main.ts`). DTO classes use `class-validator` decorators; full `@ApiProperty` annotations are deferred to a later prompt unless required by CI.

## Related architecture

- `LEGAL_DOCUMENT_APPLICATION_SCOPE_2026-07-22.md` — scope fields & conflict detection
- `LEGAL_DOCUMENT_LIFECYCLE_EVENTS_2026-07-22.md` — append-only event log
- `LEGAL_DOCUMENT_RESOLVER_2026-07-22.md` — consumer resolution (unchanged by this prompt)
