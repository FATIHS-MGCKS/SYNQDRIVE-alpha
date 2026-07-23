# Legal Document PDF Validation & Quarantine — Architecture (2026-07-22)

## Upload pipeline

```
Client POST /legal-documents/upload (multer size limit only)
  → LegalDocumentsService.upload
  → LegalDocumentIngestionService.ingest
      1. LegalDocumentPdfValidationService.validate
         - size, magic bytes (file-type), structural probe, security probe, pdf-parse
      2. LegalDocumentMalwareScanService.scanAndStore (optional)
         - quarantine → scan → promote to clean storage
  → Prisma create (scanStatus=SCAN_PASSED, pageCount, checksum, …)
```

## Lifecycle gate

`submitForReview` and `activate` call `assertScanPassed(doc)` — throws `LEGAL_DOCUMENT_SCAN_NOT_PASSED` otherwise.

## Storage zones

| Zone | Path prefix | Purpose |
|------|-------------|---------|
| Clean | `organizations/{orgId}/legal/…` | Served via authenticated download |
| Quarantine | `quarantine/organizations/{orgId}/legal/…` | Pre-scan holding area |

Config: `documents.localStorageDir`, `documents.localQuarantineStorageDir`.

## Data model

`OrganizationLegalDocument` fields: `scanStatus`, `pageCount`, `validationErrorCode`, `validationErrorDetail`, `validatedAt`, `malwareScannedAt`, `malwareScannerId`, `quarantineObjectKey`.

## API projection

`legal-document-api.mapper.ts` exposes `scanStatus` and `pageCount` from DB (no longer hardcoded `NOT_SCANNED`).

## Shared extraction reuse

Structural PDF probing reuses `document-pdf-probe.util` from document-extraction. Malware scanner wiring mirrors `DocumentExtractionModule` factory pattern.

## Legacy behavior

Existing published documents are not deactivated. Legacy drafts require re-upload to pass the new pipeline.
