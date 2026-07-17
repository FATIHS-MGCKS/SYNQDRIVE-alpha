# Document Field Provenance (V4.9.638)

**Date:** 2026-07-17  
**Scope:** Document Intake V2 — per-field provenance, review corrections, action-plan confirmed values

## Goal

Persist auditable provenance for every extracted field: AI raw/normalized values, bounded text evidence, user confirmations/corrections, and correction metrics for future Field Correction Rate analytics. Action plans consume only confirmed values.

## Contract version

`DOCUMENT_FIELD_PROVENANCE_VERSION = 1.0.0`

## Per-field shape (`DocumentFieldProvenance`)

| Property | Description |
|----------|-------------|
| `fieldKey` | Registry/schema field key |
| `rawValue` | LLM/OCR value before normalization |
| `normalizedValue` | Schema-normalized AI value |
| `confidence` | Extraction confidence (null when missing) |
| `page` | Primary evidence page (1-based) |
| `textEvidence` | Bounded OCR snippet around value (max ~120 chars) |
| `sourceType` | `ai_extraction` \| `ai_merged` \| `ai_conflict` \| `missing` \| `user_correction` \| `user_confirmed` |
| `manuallyEdited` | User changed value during review |
| `confirmedValue` | User-confirmed value (separate from AI values) |
| `confirmedBy` | User id on confirm |
| `confirmedAt` | ISO timestamp on confirm |

## Registry (`DocumentFieldProvenanceRegistry`)

Stored in `plausibility._pipeline.fieldProvenance`:

- `fields[]` — per-field provenance rows
- `correctionCount` — number of corrected fields (for Field Correction Rate)
- `correctedFieldKeys[]` — keys where `confirmedValue` ≠ `normalizedValue`

## Text evidence policy

- `extractTextEvidenceSnippet` locates value on source page with ±24 char context
- `sanitizeTextEvidence` masks plates, VIN, IBAN, email, phone for sensitive fields (`isSensitiveDocumentField`)
- No full document text in API standard payload — snippets capped at 120 characters

## Lifecycle

1. **Extraction (processor):** `buildFieldProvenanceFromStructuredFields` maps `StructuredFieldValue[]` + OCR pages → registry in `_pipeline`
2. **Review (public API):** `toPublicDocumentExtraction` exposes `fieldProvenance[]` and `fieldCorrectionCount` at DTO top level (pipeline stripped from public `plausibility`)
3. **Confirm (service):** `applyFieldProvenanceConfirmations` sets `confirmedValue`, tracks corrections vs confirmations, updates `correctionCount`
4. **Action plan:** `buildDocumentActionPlan` uses `resolveConfirmedValuesForActionPlan(confirmedData)` — never raw `extractedData`
5. **Re-extraction:** prior `fieldProvenance` archived in `supersededExtractionRuns[]` with structured run

## Review UX contract

- `normalizedValue` / `rawValue` = AI extraction
- `confirmedValue` = user input at confirm
- `manuallyEdited` + `sourceType: user_correction` = explicit correction
- `sourceType: user_confirmed` = user accepted AI value unchanged

## Key modules

| Module | Role |
|--------|------|
| `document-field-provenance.types.ts` | Contract types |
| `document-field-provenance.util.ts` | Build, confirm, sanitize, public projection |
| `document-extraction.processor.ts` | Registry creation after structured extraction |
| `document-extraction.service.ts` | Provenance update on `confirm()` |
| `document-action-plan.builder.ts` | Confirmed values only for planners |
| `document-extraction-public.mapper.ts` | DTO `fieldProvenance` + `fieldCorrectionCount` |

## Tests

- `document-field-provenance.util.spec.ts` — evidence bounds, sensitive sanitization, correction tracking
- `document-action-plan.field-provenance.spec.ts` — action plan from confirmed data
- `document-extraction-public.mapper.spec.ts` — review projection (AI vs user values)
- Structured extraction supersede archives `fieldProvenance`

## Non-goals (this release)

- No apply/orchestrator execution changes beyond confirmed-data contract
- No frontend review UI (backend contract only)
