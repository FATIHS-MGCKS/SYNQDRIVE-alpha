# Document OCR Routing (2026-07-10)

## Routing table

| Detected kind | Condition | Method | Provider |
|---------------|-----------|--------|----------|
| plain-text | Valid UTF-8, no magic bytes | TXT_DIRECT | Local |
| pdf | Text layer passes quality gate | TEXT_LAYER | pdf-parse |
| pdf | No/insufficient text layer | OCR | MistralOcrService |
| jpeg/png/webp | Always | OCR | MistralOcrService |

## Identification

- `file-type@16.5.4` `fromBuffer()` for magic-byte detection
- Client MIME normalized (e.g. `image/jpg` → `image/jpeg`)
- Dangerous MIME/content mismatches → `MIME_MISMATCH`
- Filename sanitized via `path.basename`

## PDF quality gate

Configurable via `DOCUMENT_PDF_MIN_TEXT_CHARS`, `DOCUMENT_PDF_MIN_SENSIBLE_RATIO`, `DOCUMENT_PDF_MAX_REPEATED_LINE_RATIO`.

## Processor

`DocumentExtractionProcessor` → `DocumentContentExtractorService` → `DocumentAiExtractionService`

Persists `sourceMethod` in plausibility JSON; OCR provider/model/pageCount on extraction record.
