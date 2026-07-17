# Document Intake V2 — Classification Result UI (V4.9.643)

**Date:** 2026-07-17  
**Scope:** Prompt 68 — replace static classification copy with per-document classification contract display.

## Goal

Show concrete classification output from `plausibility.classification` (taxonomy contract 2.0.0) instead of generic AUTO banners:

- Detected category + subtype
- User-friendly confidence band (high / medium / low / unknown)
- Top recognition reasons (identifiers + rationale hints)
- Alternative types when uncertain
- **Change document type** with re-extraction + action-plan invalidation hint
- Technical model/contract versions only in expandable details

## Frontend

| Module | Role |
|--------|------|
| `document-classification-result.ts` | Parse `plausibility.classification` + DTO fallbacks; confidence bands; reason keys |
| `DocumentClassificationResultPanel.tsx` | Review + `AWAITING_DOCUMENT_TYPE` UI |
| `DocumentUploadView.tsx` | Replaces static AUTO banner and separate type-correction block |
| `useDocumentUploadPage.ts` | Org-scoped `setDocumentTypeByOrg` when no vehicle yet |

i18n: DE/EN keys for categories, subtypes, confidence bands, recognition reasons.

## Backend

| Change | Role |
|--------|------|
| `applySetDocumentType` refactor | Shared vehicle + org type change path |
| `POST /organizations/:orgId/document-extractions/:id/document-type` | AWAITING_DOCUMENT_TYPE operable for org upload-first flow |

Type change clears extracted data and re-queues extraction (existing behavior) — action plan invalidated via superseded run / cleared extraction state.

## Tests

- `document-classification-result.test.ts` — parser, confidence, reasons, display label
- `document-classification-result.ui.test.tsx` — fine notice review + uncertain awaiting-type markup

## Rules preserved

- No false certainty (bands + uncertain state + alternatives)
- Model names only in technical details
- DIMO / taxonomy contract unchanged — UI reads public `plausibility.classification`
