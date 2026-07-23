# Legal Documents — PDF Validation & Quarantine (Prompt 11/32)

**Date:** 2026-07-22  
**Status:** Implemented  
**Branch:** `cursor/legal-docs-pdf-validation-28ca`

## Summary

Replaced MIME/extension-only upload checks with a server-side PDF validation and quarantine pipeline. Documents must reach `SCAN_PASSED` before `submitForReview` or `activate`.

## Security decisions

| Decision | Rationale |
|----------|-----------|
| No document bytes in logs | Only safe error codes and short messages are persisted/logged |
| Quarantine before clean storage | When malware scan is enabled, bytes land in `documents-quarantine` until scan passes |
| Fail-closed lifecycle gates | `submitForReview` and `activate` require `scanStatus === SCAN_PASSED` |
| Reject active PDF content | JavaScript, Launch/OpenAction, embedded files blocked at validation |
| Legacy grandfathering | Non-DRAFT documents → `SCAN_PASSED`; legacy DRAFT → `VALIDATION_FAILED` + re-upload required |
| No auto-deactivation | Migration never changes ACTIVE/SUPERSEDED lifecycle status |

## Libraries

| Library | Role |
|---------|------|
| `file-type` (^16.5.4) | Magic-byte MIME detection |
| `pdf-parse` (^2.4.5) | Full PDF parse test (page count, encrypted detection) |
| `document-pdf-probe.util` (shared) | Structural probe: header, trailer, complexity, password markers |
| `legal-document-pdf-security-probe.util` | Active content patterns (JS, Launch, EmbeddedFile) |
| `DocumentMalwareScannerPort` (shared) | Optional malware scan via quarantine promotion |

## Configured limits (env overrides)

| Setting | Default | Env |
|---------|---------|-----|
| Max upload size | 15 MB | `DOCUMENT_LEGAL_UPLOAD_MAX_MB` |
| Validation timeout | 10 s | `DOCUMENT_LEGAL_PDF_VALIDATION_TIMEOUT_MS` |
| Max pages | 200 | `DOCUMENT_LEGAL_PDF_MAX_PAGES` |
| Max PDF objects | 5 000 | `DOCUMENT_LEGAL_PDF_MAX_OBJECTS` |
| Max PDF streams | 2 000 | `DOCUMENT_LEGAL_PDF_MAX_STREAMS` |
| Max decompressed bytes (estimate) | 80 MB | `DOCUMENT_LEGAL_PDF_MAX_DECOMPRESSED_BYTES` |
| Malware scan | disabled | `DOCUMENT_LEGAL_MALWARE_SCAN_ENABLED` |
| Malware scanner | unavailable | `DOCUMENT_LEGAL_MALWARE_SCANNER_PROVIDER` (`mock` for tests) |
| Malware scan timeout | 15 s | `DOCUMENT_LEGAL_MALWARE_SCAN_TIMEOUT_MS` |

## Scan statuses

```
UPLOADED → VALIDATING → (VALIDATION_FAILED | MALWARE_SCAN_PENDING) → SCAN_PASSED | SCAN_FAILED
```

New uploads complete validation synchronously in the upload request; final status is `SCAN_PASSED` (or upload fails with structured error).

## Structured validation error codes

See `legal-document-scan-status.constants.ts` — prefix `LEGAL_PDF_*` (e.g. `LEGAL_PDF_NOT_PDF`, `LEGAL_PDF_PASSWORD_PROTECTED`, `LEGAL_PDF_ACTIVE_JAVASCRIPT`).

API envelope: `LEGAL_DOCUMENT_PDF_VALIDATION_FAILED` / `LEGAL_DOCUMENT_MALWARE_SCAN_FAILED` / `LEGAL_DOCUMENT_SCAN_NOT_PASSED`.

## Legacy migration

Migration `20260722170000_legal_document_pdf_validation`:

1. Adds `scan_status`, `page_count`, validation/malware metadata columns
2. Sets `SCAN_PASSED` for documents in `IN_REVIEW`, `APPROVED`, `SCHEDULED`, `ACTIVE`, `SUPERSEDED`, `REVOKED`, `ARCHIVED`
3. Sets `VALIDATION_FAILED` + `LEGAL_PDF_LEGACY_REVALIDATION_REQUIRED` for legacy `DRAFT` rows

## Test results

Suite: `legal-document-pdf-validation.service.spec.ts`, `legal-documents-scan-gating.spec.ts`, plus existing legal-documents specs.

| Scenario | Result |
|----------|--------|
| Fake `.pdf` (non-PDF bytes) | Rejected `LEGAL_PDF_NOT_PDF` |
| Corrupted PDF | Rejected `LEGAL_PDF_CORRUPT` |
| Encrypted/password PDF | Rejected `LEGAL_PDF_PASSWORD_PROTECTED` |
| PDF with JavaScript | Rejected `LEGAL_PDF_ACTIVE_JAVASCRIPT` |
| PDF with Launch action | Rejected `LEGAL_PDF_ACTIVE_LAUNCH_ACTION` |
| PDF with embedded files | Rejected `LEGAL_PDF_EMBEDDED_FILES` |
| Too large | Rejected `LEGAL_PDF_FILE_TOO_LARGE` |
| Too many pages | Rejected `LEGAL_PDF_TOO_MANY_PAGES` |
| Valid PDF (parse mocked in Jest) | Accepted `SCAN_PASSED` path |
| Scan gating on review/activate | Blocked unless `SCAN_PASSED` |

**200 tests passing** in legal-documents + documents.service.spec pattern (2026-07-22).

## Key files

- `legal-document-pdf-validation.service.ts`
- `legal-document-ingestion.service.ts`
- `legal-document-malware-scan.service.ts`
- `legal-document-pdf-security-probe.util.ts`
- `legal-document-scan-status.constants.ts`
- `storage/local-document-storage.service.ts` (quarantine support)
