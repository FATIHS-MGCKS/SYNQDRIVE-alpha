# I18N — Vehicle Documents Upload / Extraction (P2.2.60)

**Date:** 2026-08-28
**Version:** V4.9.989

## Locale flow

`useLanguage().locale` + `t()` → `document-intake-i18n.ts` resolvers → shared intake components (`DocumentIntakeUploadZone`, `DocumentExtractionFlowStatus`, `DocumentExtractionReviewPanel`, …) and `VehicleDocumentUploadDrawer`.

Hook boundary (`useDocumentIntakeFlow`) returns machine codes (`validationErrorCode`, `hostErrorKey`) and raw backend `errorMessage`; presentation resolves at component boundary. `localeRef` prevents `applyRecord` from depending on locale (polling stability).

## Keys

+157 EN+DE keys (9082→9239): `rental.documentIntake.{en,de}.ts` module (`docUpload.drawer.*`, `docUpload.duplicate.*`, `docUpload.extractionField.*`, `docUpload.hostError.*`, semantically distinct `documentExtraction.classification.*` additions) plus reuse of existing `documentExtraction.type.*` (7 exact) and `docUpload.field.description`; also reuses existing `docUpload.flow.*`, `docUpload.validation.*`, `docUpload.processingStep.*`, `common.cancel`, `vehicle.documents.*`.

## Machine values (frozen)

- FlowStatus union, document type IDs, validation codes, allowedActions
- Upload/reupload/retry/confirm payloads and endpoints
- EXTRACTION_TEMPLATES field IDs, order, required flags
- `initialDocType: 'AUTO'`; `categoryId` prop not consumed
- Polling interval/termination; File object identity
- Raw backend/provider/user text (errors, extraction values, reupload reason, filenames)

## Guardrails

P260 enforce-clean exact (16 paths): drawer + shared intake stack + hook/presentation boundaries — 0 findings. `VehicleDocumentUploadDrawer` removed from P22 allowlist.

## Shared surfaces

Same intake components used by `DocumentUploadView` and `OperatorAiUploadFlow`; shared namespaces (`docUpload.*`, `documentExtraction.*`) only.

## Frozen

P259 overview, P216–P259 rental/operator/billing slices.

## Tests

`rental-vehicle-documents-upload-localization.test.tsx` + `useDocumentIntakeFlow.p260-locale-mutation.test.ts` — enforce-clean, FlowStatus/validation/template resolvers, hook contract freeze, true same-mount DE→EN→DE, confirm payload locale parsing, polling lifecycle stability.

## Semantics

Presentation-only; Category E=0.
