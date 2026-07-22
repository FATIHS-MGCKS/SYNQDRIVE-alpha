# Legal Document Private Storage Architecture

**Date:** 2026-07-22  
**Prompt:** 13/32 — Storage abstraction and private object storage

## Overview

Private booking PDFs and legal documents use `DocumentStoragePort` (`DOCUMENTS_STORAGE` token) in `DocumentsModule`. The port is separate from public `StorageService` (`/uploads` static assets).

## Signal flow

```
Upload / PDF generation
  → LegalDocumentIngestionService / GeneratedDocumentsService
  → DocumentStoragePort.putObject | putQuarantineObject
  → promoteQuarantineToClean (after scan)
  → DB row: objectKey, storageProvider, contentHash

Download (authorized)
  → LegalDocumentsController / DocumentsController
  → service.getDownload(orgId, id)  [tenant check in service]
  → storage.getObjectStream(objectKey)
  → StreamableFile + Content-Disposition (no redirect to bucket URL)
```

## Provider binding

`documents.module.ts` factory:

- `DOCUMENT_STORAGE_PROVIDER=s3` → `S3PrivateDocumentStorageService`
- otherwise → `LocalDocumentStorageService`

`DocumentStorageStartupService` validates config on boot.

## S3 adapter design

- Lazy `@aws-sdk/client-s3` via `document-private-s3.client.ts`
- `DocumentPrivateS3Operations` interface for test doubles
- SSE on every write (`AES256` or `aws:kms`)
- Metadata: `content-sha256`, `organization-id`, `document-type`, `original-name`
- `getInternalPath()` returns `null` (no filesystem path)

## Health

`DocumentStorageHealthService`:
- Local: writable check on clean + quarantine dirs
- S3: `HeadBucket`
- ALERT log after `DOCUMENT_STORAGE_HEALTH_ALERT_THRESHOLD` consecutive failures

## Compatibility

- Existing local files: unchanged on disk; DB rows with `storageProvider=local` continue to work with local adapter.
- Download API contract unchanged (`DocumentDownload` stream + mime + fileName).
- `PutDocumentResult` extended with `contentHash` and `etag` (backward-compatible for callers ignoring new fields).

## Related modules

- Document-extraction module has its own `DOCUMENT_STORAGE` port (same key patterns, separate binding) — future alignment optional.
- Malware scanner (Prompt 12) uses quarantine methods on the same port.

## Configuration reference

See `docs/audits/legal-documents-private-storage-2026-07.md` for env vars, bucket policy, versioning, backup, and migration runbook.
