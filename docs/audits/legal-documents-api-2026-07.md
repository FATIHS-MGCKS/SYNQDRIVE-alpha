# Legal Documents API — Professionalization (Prompt 9/32)

Date: 2026-07-22  
Branch: `cursor/legal-docs-api-28ca`

## Summary

Controller, DTOs, service mapping, and error handling for **Verwaltung → Rechtliche Dokumente** were professionalized. List/detail responses expose a stable, tenant-safe contract without storage paths, public object URLs, or internal provider metadata.

## API structure

### Base path

`GET|POST|PATCH /api/v1/organizations/:orgId/legal-documents…`

Guards: `OrgScopingGuard` + `RolesGuard`. Mutations require `ORG_ADMIN` or `MASTER_ADMIN`.

### List — `GET /organizations/:orgId/legal-documents`

**Backward compatibility:** Without `page`/`limit`, returns a **flat array** of documents (existing frontend continues to work).

**Paginated mode:** With `page` and/or `limit`, returns:

```json
{
  "data": [ /* LegalDocumentApiResponse[] */ ],
  "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

**Query filters (server-side):**

| Param | Description |
|-------|-------------|
| `documentType` | Canonical type filter |
| `status` | Lifecycle status |
| `language` | BCP-47 language code |
| `jurisdiction` | ISO 3166-1 alpha-2 (`jurisdictionCountry`) |
| `customerSegment` | `PRIVATE` / `BUSINESS` / `BOTH` |
| `channelScope` | Maps to `bookingChannel` |
| `search` | Case-insensitive match on `title` or `versionLabel` |
| `sort` | `createdAt` (default), `updatedAt`, `activatedAt`, `versionLabel`, `status`, `documentType` |
| `order` | `asc` / `desc` (default `desc`) |

### Detail — `GET /organizations/:orgId/legal-documents/:id`

Returns a single `LegalDocumentApiResponse` with actor refs and `snapshotCount`.

### Mutations

All mutation endpoints return the **enriched detail** shape (not a minimal subset).

| Method | Path | Body |
|--------|------|------|
| `POST` | `/upload` | multipart: `file`, `documentType`, `versionLabel`, scope fields |
| `POST` | `/:id/submit-for-review` | `{ changeSummary? }` |
| `POST` | `/:id/approve` | `{ changeSummary? }` |
| `POST` | `/:id/schedule` | `{ validFrom, changeSummary? }` |
| `PATCH` | `/:id/application-scope` | `UpdateLegalDocumentScopeDto` |
| `POST` | `/:id/activate` | — |
| `POST` | `/:id/revoke` | `{ statusReason, changeSummary? }` |
| `POST` | `/:id/archive` | `{ statusReason?, changeSummary? }` |
| `GET` | `/:id/download` | Private stream (no URL in JSON) |

### Events

| Endpoint | Pagination | Filters |
|----------|------------|---------|
| `GET …/legal-documents/events` | `page`, `limit` | `legalDocumentId`, `eventType`, `from`, `to`, `sort`, `order` |
| `GET …/legal-documents/:id/events` | `page`, `limit` | `from`, `to`, `sort`, `order` |

## Response fields (`LegalDocumentApiResponse`)

Primary fields (Prompt 9):

- `id`, `documentType`, `documentVariant`, `title`, `versionLabel`, `language`
- `jurisdiction`, `customerSegment`, `channelScope`, `stationScope` (`{ mode, stationIds }`)
- `status`, `isMandatory`, `validFrom`, `validUntil`
- `checksum`, `fileSize`, `pageCount` (null until PDF metadata pipeline exists)
- `scanStatus` (`NOT_SCANNED`), `integrityStatus` (`VERIFIED` / `UNVERIFIED` / `MISSING`)
- `uploadedAt` (= `createdAt`), `uploadedBy`, `approvedAt`, `approvedBy`, `activatedAt`, `activatedBy`
- `changeSummary`, `snapshotCount` (count of `GeneratedDocument` rows linked via `legalDocumentId`)
- `createdAt`, `updatedAt`

**Excluded from all JSON responses:** `objectKey`, `storageProvider`, `mimeType`, signed/public URLs.

**Backward-compat aliases retained:** `legalVariant`, `legacyDocumentType`, `applicationScope`, `fileName`, `sizeBytes`, `activeFrom`, `statusReason`, `legalOwnerName`.

## Error codes

Structured body: `{ message, code, field?, details? }`

| HTTP | Code | When |
|------|------|------|
| 404 | `LEGAL_DOCUMENT_NOT_FOUND` | Document missing or not in tenant (no cross-org leak) |
| 403 | — | `RolesGuard` / `OrgScopingGuard` (framework) |
| 409 | `LEGAL_DOCUMENT_ACTIVE_CONFLICT` | Concurrent activation race / single-active invariant |
| 409 | `LEGAL_DOCUMENT_SCOPE_CONFLICT` | Overlapping application scope at activate or scope PATCH |
| 422 | `LEGAL_DOCUMENT_VALIDATION_FAILED` | Invalid input (type, file, scope, required fields) |
| 422 | `LEGAL_DOCUMENT_NOT_ACTIVATABLE` | Activate from non-activatable status |
| 422 | `LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION` | Illegal lifecycle transition |
| 422 | `LEGAL_DOCUMENT_SCOPE_LOCKED` | Scope change on ACTIVE/SUPERSEDED document |

## Breaking-change risks

| Risk | Mitigation |
|------|------------|
| List returns paginated object when `page`/`limit` sent | Legacy clients omit pagination → still receive array |
| Mutation responses now include many new fields | Additive — existing fields preserved |
| Validation errors are HTTP 422 instead of 400 | Clients should check `code`, not only status 400 |
| Scope/activation conflicts use `details` wrapper | `ACTIVE_CONFLICT` no longer exposes top-level `organizationId` — use `details` |
| `GET :id` is new | No existing client dependency |

Frontend types in `frontend/src/lib/api.ts` were **not** fully updated in this prompt (by design).

## Tests

```
npm test -- --testPathPattern='legal-document|documents.service.spec'
```

Result: **18 suites, 154 tests passed** (2026-07-22).

New suites:

- `legal-documents-api.errors.spec.ts`
- `legal-document-api.mapper.spec.ts`
- `dto/legal-document-api.dto.spec.ts`
- `legal-documents.controller.spec.ts`
- `legal-documents-tenant.spec.ts`

## Key files

- `legal-documents.controller.ts`
- `legal-documents.service.ts`
- `legal-document-api.mapper.ts`
- `legal-documents-api.errors.ts`
- `dto/legal-document-list-query.dto.ts`
- `dto/legal-document-events-query.dto.ts`
- `dto/legal-document-lifecycle.dto.ts`
