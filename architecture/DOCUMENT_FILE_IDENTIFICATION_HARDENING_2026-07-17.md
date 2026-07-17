# Document File Identification Hardening (V4.9.622)

**Date:** 2026-07-17  
**Prompt:** 47/84 — File identification & preprocessing guards

## Hook point

`DocumentFileIdentificationService.identify()` after MIME whitelist + `file-type` magic-byte detection:

```text
size/MIME/magic → byte-level preprocess probe → identificationStatus → hash/duplicate/storage
```

No PDF decryption or full PDF execution — structure is inspected via byte patterns only.

## Identification statuses

| Status | Upload | Meaning |
|--------|--------|---------|
| `ACCEPTED` | allowed | File passed probes |
| `OCR_REQUIRED` | allowed | EXIF rotation or scanned PDF hint — downstream OCR handles rotation |
| `REQUIRES_PASSWORD` | rejected | `/Encrypt` dictionary detected |
| `REJECTED_CORRUPT` | rejected | Truncated/invalid PDF or image structure |
| `REJECTED_TOO_MANY_PAGES` | rejected | PDF page count over limit |
| `REJECTED_TOO_COMPLEX` | rejected | Object/stream/decompressed-byte or pixel budget exceeded |

## Error codes (400)

| Code | Status |
|------|--------|
| `PDF_PASSWORD_REQUIRED` | `REQUIRES_PASSWORD` |
| `FILE_CORRUPTED` | `REJECTED_CORRUPT` |
| `FILE_TOO_MANY_PAGES` | `REJECTED_TOO_MANY_PAGES` |
| `FILE_TOO_COMPLEX` | `REJECTED_TOO_COMPLEX` |
| `FILE_IDENTIFICATION_TIMEOUT` | resource guard |

`BadRequestException` body includes `errorCode`, `stage`, `identificationStatus`, and safe `message`.

## Limits (defaults)

| Env | Default |
|-----|---------|
| `DOCUMENT_IDENTIFY_TIMEOUT_MS` | 5000 |
| `DOCUMENT_IDENTIFY_MAX_PDF_PAGES` | 50 |
| `DOCUMENT_IDENTIFY_MAX_IMAGE_PIXELS` | 40_000_000 |
| `DOCUMENT_IDENTIFY_MAX_DECOMPRESSED_BYTES` | 80 MB |
| `DOCUMENT_IDENTIFY_MAX_PDF_OBJECTS` | 5000 |
| `DOCUMENT_IDENTIFY_MAX_PDF_STREAMS` | 2000 |

## Pipeline fingerprint

`buildDocumentExtractionFileFingerprint` stores `identificationStatus`, `pageCount`, `pixelCount`, `rotationDegrees` in `plausibility._pipeline.fileFingerprint`.

## Frontend

`document-upload-identification.ts` parses nested Nest 400 bodies and maps German user messages in `useDocumentExtractionFlow`.

## Tests

- `document-file-identification.service.spec.ts` — fixtures + rejection paths
- `document-file-identification.security.spec.ts` — password/complexity/EXIF probes
- `frontend/src/lib/document-upload-identification.test.ts` — 400 parser
