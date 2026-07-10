# Document Type Classification (V4.9.328)

## Goal

Separate **classification** from **structured extraction**. `AUTO` is request-only and never reaches apply services.

## Flow

### Manual type
`Upload → OCR/text → extraction → plausibility → review`

### AUTO
`Upload → OCR/text → classification →`
- **High confidence:** set `effectiveDocumentType` → extraction → plausibility → review
- **Medium confidence:** `AWAITING_DOCUMENT_TYPE` with `detectedDocumentType` suggestion
- **Low / UNKNOWN:** `AWAITING_DOCUMENT_TYPE` without suggestion

User selection: `POST .../document-type` → re-enqueue → extraction (OCR cache reused when safe).

## Classification contract

`DocumentClassificationService` (Mistral structured JSON):

| Field | Type |
|-------|------|
| `detectedDocumentType` | canonical `ApplyDocumentExtractionType` or `UNKNOWN` |
| `confidence` | 0–1 |
| `rationale` | short evidence (max 500 chars) |
| `sourcePages` | `number[] \| null` |
| `provider` / `model` / `processingDurationMs` | metadata |

Allowed types: `SUPPORTED_DOCUMENT_TYPES` from `document-extraction.schemas.ts` only.

## Thresholds (env)

| Variable | Default | Semantics |
|----------|---------|-----------|
| `DOCUMENT_CLASSIFICATION_AUTO_CONTINUE_MIN` | 0.85 | Auto-set effective type |
| `DOCUMENT_CLASSIFICATION_SUGGESTION_MIN` | 0.55 | Await user with suggestion |
| `DOCUMENT_CLASSIFICATION_MAX_CHARS` | 24000 | Classifier input budget |
| `DOCUMENT_CLASSIFICATION_TIMEOUT_MS` | 45000 | Provider timeout |

Additional guards: invalid model type → `UNKNOWN`; weak rationale blocks auto-continue.

## OCR cache

`plausibility._pipeline.contentCache` stores OCR output keyed by `objectKey`. Stripped from public API via `stripPipelineFromPlausibility`. Type changes append `documentTypeAudit`.

## API

`POST /vehicles/:vehicleId/document-extractions/:extractionId/document-type`

Body: `{ documentType, reextract? }` — apply-safe types only; `reextract=true` required for `READY_FOR_REVIEW` corrections.

## Status transitions

| From | Event | To |
|------|-------|-----|
| QUEUED | AUTO + low confidence | AWAITING_DOCUMENT_TYPE |
| AWAITING_DOCUMENT_TYPE | user sets type | QUEUED → PROCESSING → READY_FOR_REVIEW |
| READY_FOR_REVIEW | reextract + new type | QUEUED (cleared extractedData) |
| APPLIED | type change | **rejected** |

`AWAITING_DOCUMENT_TYPE` is not `FAILED`.
