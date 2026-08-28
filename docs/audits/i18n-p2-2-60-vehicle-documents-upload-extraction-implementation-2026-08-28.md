# P2.2.60 — Vehicle Documents Upload / Extraction Implementation Audit

**Date:** 2026-08-28
**Branch:** `cursor/p2260-documents-upload-extraction-i18n-3c10`
**Baseline:** `2586c202564f8b10c0c48b5717ea8bf339138da1` (P2.2.59 merge, PR #1390)
**Pre-flight:** PR #1397 (not merged; audit-only)

## Scope

Production mount: `/rental` → vehicle → Documents → upload/review CTA → `VehicleDocumentUploadDrawer` → shared document intake stack.

### In scope (localized)

- `VehicleDocumentUploadDrawer`
- `DocumentIntakeUploadZone`, `DocumentExtractionFlowStatus`, `DocumentUploadDuplicatePanel`, `DocumentIntakeProcessingSteps`
- `DocumentClassificationResultPanel`, `DocumentExtractionReviewPanel` (+ entity/schema/action-plan children)
- `DocumentApplyResultPanel`, `DocumentFollowUpSuggestionsPanel`
- `document-intake-i18n.ts`, `rental.documentIntake.{en,de}.ts`
- `useDocumentIntakeFlow` presentation boundary (`validationErrorCode`, `hostErrorKey`)
- `OperatorAiUploadFlow` shared resolver wiring

### Out of scope (unchanged)

- `DocumentsView` / `DocumentComplianceSummaryCard` (P259)
- `DocumentArchivePanel`, `DocumentReviewInboxPanel`, `LegalDocumentsTab`, `CustomerDocumentUploadBox`
- Backend, endpoints, payloads, permissions, polling semantics

## categoryId / initialDocType

- `DocumentsView` passes `categoryId` to drawer; drawer does **not** consume it.
- `initialDocType` remains `'AUTO'`. No behavior change.

## Key accounting

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 9082 |
| Final EN/DE | 9239 |
| New keys | +157 |
| Parity | 100% |
| Orphans | 0 |

## Key reuse correction (post-audit)

Removed 8 exact-reuse duplicates after reassessment PR #1402:

- 7× `documentExtraction.classification.*` → reuse `documentExtraction.type.*`
- 1× `docUpload.extractionField.description` → reuse `docUpload.field.description`

Retained semantically distinct classification keys: TIRE, BRAKE, BATTERY, FINE, TUV_REPORT, VEHICLE_CONDITION.

## Behavioral evidence

- `useDocumentIntakeFlow.p260-locale-mutation.test.ts`: confirm payload locale parsing (DE `01.02.2026` vs EN `01/02/2026`) and polling lifecycle stability across locale switch.

## Scanner accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| Global | 1382 | 1375 |
| Rental | 285 | 278 |
| P260 enforce-clean paths | — | 0 findings (16 exact paths incl. hook boundaries) |

## Mutation freeze verification

- Hook returns machine validation codes; no translated strings in API payloads.
- `localeRef` in `applyRecord`; locale switch tests assert zero upload/reupload/retry/set-type/reextract/confirm/schema/reset deltas after mount.
- Raw fixtures preserved: filenames, backend errors, provider messages, reupload reason textarea.

## Verdict

**A — IMPLEMENTATION COMPLETE — P2.2.60 READY FOR INDEPENDENT RE-AUDIT**

Active mounted Vehicle Documents upload/extraction flow is i18n-clean. P216–P259 remain frozen.
