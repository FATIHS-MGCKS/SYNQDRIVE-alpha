# Document Classification Taxonomy Contract (V4.9.636)

**Date:** 2026-07-17  
**Scope:** Document Intake V2 — classification service + processor contract extension (no apply execution)

## Goal

Extend document classification with a structured taxonomy contract so downstream review can see category/subtype, confidence, competing alternatives, evidence, and sanitized identifiers — while preserving legacy `DocumentExtractionType` compatibility and AUTO as the default pipeline mode.

## Contract version

`DOCUMENT_CLASSIFICATION_CONTRACT_VERSION = 2.0.0`

## Output fields

| Field | Description |
|-------|-------------|
| `category` | Primary taxonomy category (`FINANCE`, `TECHNICAL`, …) |
| `subtype` | Primary taxonomy subtype (`INVOICE`, `SERVICE_REPORT`, …) |
| `confidence` | Model confidence 0–1 |
| `alternatives` | Up to 5 competing category/subtype candidates with confidence + rationale |
| `rationale` | Evidence-based justification (max 500 chars) |
| `evidencePages` | 1-based pages supporting the primary classification |
| `detectedIdentifiers` | Sanitized visible identifiers (plate, VIN, invoice #, …) |
| `modelVersion` | LLM model id used for classification |

Additional pipeline metadata stored in `plausibility.classification`:

- `contractVersion`, `taxonomyVersion`, `legacyDocumentType`, `detectedDocumentType`
- `provider`, `hasSuggestion`, `processingDurationMs`, `decisionAction`
- Legacy aliases: `documentCategory`, `documentSubtype`, `sourcePages`, `model`

## Decision rules (AUTO remains default)

`evaluateClassificationDecision` applies legacy confidence thresholds first, then taxonomy guards:

1. **Unclear subtype** (`OTHER` below suggestion threshold or missing subtype) → `AWAIT_USER` → status `AWAITING_DOCUMENT_TYPE`
2. **Competing high-confidence alternative** (gap ≤ 0.15, alt ≥ 0.55, different subtype) → `AWAIT_USER` even when primary would AUTO_CONTINUE
3. **General correspondence forced as SERVICE** (letter cues + correspondence alternative or rationale mismatch) → `AWAIT_USER`
4. Otherwise legacy rules: high confidence + evidence → `AUTO_CONTINUE`; medium → suggestion await; low/UNKNOWN → manual

## LLM schema

`buildDocumentClassificationResponseSchema` requires:

- `detectedDocumentType` (legacy apply type or `UNKNOWN`)
- `documentCategory` + `documentSubtype`
- `alternatives[]`, `detectedIdentifiers[]`
- `confidence`, `rationale`, `sourcePages`

Prompt instructs: do not force general letters as SERVICE; include alternatives when plausible.

## Key modules

| Module | Role |
|--------|------|
| `document-classification-contract.types.ts` | Contract + pipeline payload types |
| `document-classification-taxonomy.util.ts` | Contract builder, identifier sanitization, taxonomy guards |
| `document-classification-pipeline.util.ts` | Processor plausibility payload builder |
| `document-classification-decision.util.ts` | AUTO vs AWAIT with taxonomy overrides |
| `DocumentClassificationService` | LLM call → contract enrichment |
| `DocumentExtractionProcessor` | Stores full contract in `plausibility.classification` |

## Tests

Sanitized fixtures in `__fixtures__/document-classification-fixtures.ts`:

- General correspondence (not forced SERVICE)
- High-confidence SERVICE with INVOICE alternative → await user
- Clear FINE → auto continue
- Unclear subtype → await user
- Forced SERVICE on general letter → await user

## Non-goals (this prompt)

- No apply/orchestrator execution changes
- No frontend UI changes beyond existing plausibility readers
