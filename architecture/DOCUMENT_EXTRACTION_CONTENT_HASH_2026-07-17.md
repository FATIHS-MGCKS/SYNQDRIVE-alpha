# Document Extraction Upload Content Hash (V4.9.619)

**Date:** 2026-07-17  
**Prompt:** 44/84 — Stream-based SHA-256 at upload, org-scoped dedup fingerprint

## Scope

| Module | Role |
|--------|------|
| `document-content-hash.util.ts` | Stream-based SHA-256 digest (`computeDocumentContentSha256`) |
| `document-extraction-fingerprint.types.ts` | `DocumentExtractionFileFingerprint` in `plausibility._pipeline.fileFingerprint` |
| `document-extraction.service.ts` | `createFromUpload` — identify → hash → storage → DB → queue |
| Prisma `VehicleDocumentExtraction.contentSha256` | Nullable column + `(organizationId, contentSha256)` index |

## Upload pipeline order

1. Resolve vehicle / `organizationId`
2. **File identification** (`DocumentFileIdentificationService.identify`) — MIME, size, display name
3. **Content hash** — SHA-256 over buffer via stream iterator (before OCR / queue)
4. **Object storage** — only after successful identification + hash
5. **DB create** — `contentSha256` column + `fileFingerprint` in pipeline JSON
6. **Queue enqueue** — only after DB record exists

Identification failures throw `BadRequestException` — no storage write, no queue job.

## Fingerprint model

```ts
plausibility._pipeline.fileFingerprint = {
  algorithm: 'sha256',
  contentSha256: string,      // 64-char hex
  organizationId: string,     // dedup scope
  sizeBytes: number,
  detectedMime: AllowedDocumentMimeType,
  displayFileName: string,
  identifiedAt: ISO8601,
}
```

`contentSha256` is also persisted on `vehicle_document_extractions.content_sha256` for indexed org-scoped lookups.

## Security & compatibility

- Only the hex digest is stored — raw bytes are never logged.
- Legacy rows with `contentSha256 = null` remain fully readable; hash is optional on read paths.
- No hard dedup rejection in this prompt — hash enables future org-scoped duplicate detection.

## Tests

| Scenario | Expectation |
|----------|-------------|
| Identical bytes, same name | Same `contentSha256` |
| Identical bytes, different name | Same `contentSha256` |
| Different content, same name | Different `contentSha256` |
| Parallel uploads | Independent records, correct hashes |
| Identification failure | No `storage.putObject`, no enqueue |

Files: `document-content-hash.util.spec.ts`, `document-extraction-upload-hash.spec.ts`
