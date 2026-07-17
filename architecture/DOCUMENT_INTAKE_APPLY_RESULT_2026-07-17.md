# Document Intake Apply Result (V4.9.647)

Date: 2026-07-17  
Prompt: 72/84 — Apply-Ergebnisdarstellung

## Goal

Clear apply progress and result UI during and after confirm/apply: per-action status, non-cancellable explanation, polling to terminal state, entity deep links, retry for failed actions only, distinct `PARTIALLY_APPLIED`, no premature „Erledigt“.

## Backend

| Piece | Role |
|-------|------|
| `document-apply-result.mapper.ts` | Builds `PublicDocumentApplyResultDto` from `plausibility._pipeline` (execution + lifecycle) |
| `document-apply-result.messages.ts` | German error-code → human text |
| `document-apply-result.service.ts` | Thin builder wrapper |
| `GET .../apply-result` | Dedicated apply snapshot (vehicle + org scope) |
| `POST .../retry-failed-actions` | Re-runs failed actions via `retryFailedApplyActions()` (idempotent skip for succeeded) |

Public extraction GET includes `applyResult` when status is `CONFIRMED`, `APPLIED`, or `PARTIALLY_APPLIED`.

## Frontend flow

```
Confirm → applying (poll) → done | partially_done | apply_failed
```

| Rule | Implementation |
|------|----------------|
| Poll through apply | `pollThroughApply: true` on page + drawer (`useDocumentExtractionFlow`) |
| Terminal poll | `isExtractionPollTerminal()` — `CONFIRMED` until `applyResult.isTerminal` |
| No premature done | `canShowApplyDone()` gates success UI and drawer „Fertig“ |
| PARTIALLY_APPLIED distinct | Flow status `partially_done` + dedicated completion surface |
| Retry failed only | `handleRetryFailedActions` + `retry_failed_actions` allowed action |
| Reload resume | `openExtraction` + session pointer + poll when not terminal |
| No double retry | `applyRetryPending` guard |

## UI

- `DocumentApplyResultPanel` — per-action cards, status chips, entity links, retry CTA
- Wired in `DocumentUploadView`, `VehicleDocumentUploadDrawer`
- i18n: `docUpload.applyResult.*` + error codes (DE/EN)

## Tests

- Backend: `document-apply-result.mapper.spec.ts`
- Frontend: `document-apply-result.test.ts`, `document-apply-result-panel.ui.test.tsx`, intake wiring guards
- E2E: apply polling mock in `document-upload-fixtures.ts`, lifecycle flow spec
