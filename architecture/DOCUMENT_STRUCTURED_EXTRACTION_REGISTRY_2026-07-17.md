# Document Structured Extraction via Schema Registry (V4.9.637)

**Date:** 2026-07-17  
**Scope:** Document Intake V2 — registry-backed structured extraction (no apply execution)

## Goal

Route structured LLM extraction through `DocumentSchemaRegistry` using the confirmed or high-confidence taxonomy subtype, persist a structured extraction contract with provenance, and control re-extraction on document type changes without silently discarding prior runs.

## Contract version

`DOCUMENT_STRUCTURED_EXTRACTION_VERSION = 1.0.0`

## Schema resolution

`resolveExtractionSchema` priority:

1. `_pipeline.documentTaxonomy.documentSubtype` (manual/confirmed type)
2. `plausibility.classification.subtype` when confidence ≥ 0.85 (AUTO high-confidence)
3. Legacy taxonomy fallback from `ApplyDocumentExtractionType`

Fields come from `documentSchemaRegistry.getExtractionFields({ legacyDocumentType, documentSubtype })`.

## Structured field shape

Per field (`StructuredFieldValue`):

| Property | Description |
|----------|-------------|
| `raw` | Value as returned by LLM chunk (before normalization) |
| `normalized` | Schema-bound normalized value for `extractedData` |
| `confidence` | Derived from merge evidence (null when missing) |
| `sourcePages` | 1-based evidence pages |
| `provenance` | `llm` \| `merged` \| `missing` \| `conflict` |
| `conflict` | Cross-chunk disagreement flag |

## Processing run

`structuredExtractionRun` in `_pipeline`:

- `runId`, `schemaVersion`, `documentSubtype`, `legacyDocumentType`
- `trigger`: `auto` \| `type_change` \| `reextract`
- `provider`, `modelVersion`, timestamps
- counts: fields, missing, conflicts

Public plausibility also stores `missingFields`, `extractionFieldConflicts`, `structuredExtraction`, `structuredExtractionRun`.

## Re-extraction policy

`setDocumentType` with re-extract:

1. Archives current run to `_pipeline.supersededExtractionRuns[]` (full structured payload + flat `extractedData`)
2. Clears active `structuredExtraction` / `structuredExtractionRun` and `extractedData`
3. Re-enqueues with `skipOcr: true` when OCR cache exists

No silent overwrite — prior extraction remains auditable.

## Explicit gaps and conflicts

- `missingFields[]` from registry `requiredFields` (no apply defaults invented)
- `STRUCTURED_EXTRACTION_MISSING_REQUIRED` plausibility warnings per missing key
- `conflicts[]` + existing `extractionConflicts` for cross-chunk disagreements

## Key modules

| Module | Role |
|--------|------|
| `document-extraction-schema-resolve.util.ts` | Subtype-aware schema + trigger resolution |
| `document-structured-extraction.util.ts` | Contract builder, supersede archive |
| `document-extraction.processor.ts` | Registry fields → LLM → structured payload |
| `document-extraction.service.ts` | Controlled re-extraction on type change |
| `document-extraction.schemas.ts` | `getFieldSchema` / `buildEmptyExtractedData` delegate to registry |

## Tests

- Structured extraction util: raw/normalized, missing, conflicts, supersede archive
- Schema resolve: taxonomy subtype, high-confidence classification, trigger detection
- Processor: AUTO path stores `structuredExtractionRun`
- Service: re-extract archives prior run to `supersededExtractionRuns`

## Non-goals

- No apply/orchestrator changes
- No frontend review UI in this prompt
