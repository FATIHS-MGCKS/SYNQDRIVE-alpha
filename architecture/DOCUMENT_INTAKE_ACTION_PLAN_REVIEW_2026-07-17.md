# Document Intake Action Plan Review (V4.9.646)

Date: 2026-07-17  
Prompt: 71/84 — „Was soll übernommen werden?“

## Goal

Central review step showing each planned `DocumentAction` as a human-readable card before confirm/apply.

## Rules

| Rule | Implementation |
|------|----------------|
| Preview from server | `GET .../action-plan-preview` builds plan via `DocumentActionOrchestratorService.buildPreviewPlan` + `buildActionPreviewCards` |
| Frontend does not reconstruct actions | Removed `buildDocumentActionPreview` from intake review panel |
| BLOCKED not executable | Preview `canConfirm: false`; confirm validates `assertExecutableActionPlan` |
| Plan fingerprint before apply | `ConfirmExtractionDto.actionPlanFingerprint` compared server-side |
| Optional toggles | `PATCH .../action-plan-preferences` → `confirmedData.actionPlanPreferences.disabledOptionalActions`; skipped at execution |
| Understandable language | `ACTION_CATALOG` German titles + i18n status/requirement labels |

## API

### Vehicle scope

- `GET /vehicles/:vehicleId/document-extractions/:id/action-plan-preview`
- `PATCH /vehicles/:vehicleId/document-extractions/:id/action-plan-preferences`

### Org scope

- `GET /organizations/:orgId/document-extractions/:id/action-plan-preview`
- `PATCH /organizations/:orgId/document-extractions/:id/action-plan-preferences`

### Confirm

- `POST .../confirm` body adds optional `actionPlanFingerprint` (required for executor document types)

## Backend modules

- `document-action-plan-preview.service.ts` — load extraction, gate on saved field review, build public DTO
- `document-action-plan-preview.builder.ts` — card projection (module, entity, writable fields, issues)
- `document-action-plan-preferences.util.ts` — persist toggles in `confirmedData`
- `document-field-review.util.ts` — shared `hasSavedFieldReview` for preview gate

## Frontend

- `DocumentActionPlanReview.tsx` — card UI
- `useDocumentActionPlanPreview.ts` — fetch + toggle optional actions
- `DocumentExtractionReviewPanel` — server preview instead of client reconstruction
- `useDocumentIntakeFlow` — `canConfirmActionPlan`, passes fingerprint on confirm

## Flow position

```
Upload → OCR/Classification → Entity review → Schema field review (save) → Action plan review → Confirm (fingerprint) → Apply
```

## Tests

- Backend: preview builder, preferences util, preview service
- Frontend: `document-action-plan-preview.test.ts`, `document-action-plan-review.ui.test.tsx`, intake wiring test
