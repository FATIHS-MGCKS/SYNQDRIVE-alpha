# Document Intake Unified Flow (V4.9.640)

**Date:** 2026-07-17  
**Scope:** Frontend consolidation — canonical hook + shared review/status for all document extraction surfaces

## Goal

Consolidate `DocumentUploadView`, `VehicleDocumentUploadDrawer`, `OperatorAiUploadFlow`, and related embedded flows onto one canonical state machine with shared polling, error handling, review UI, action preview, and entity resolution preview.

## Canonical hook

`useDocumentIntakeFlow` (`frontend/src/rental/hooks/useDocumentIntakeFlow.ts`)

| Option | Embedded (drawer/operator) | Page (`DocumentUploadView`) |
|--------|---------------------------|----------------------------|
| `mode` | `embedded` | `page` |
| `pollThroughApply` | `false` | `true` |
| `respectAllowedActions` | `false` | `true` |
| Duplicate/rate-limit/identification errors | yes | yes (via shared hook) |

### Wrappers (no parallel state machines)

- `useDocumentExtractionFlow` → `useDocumentIntakeFlow` (embedded preset)
- `useDocumentUploadPage` → `useDocumentIntakeFlow` + org inbox/history/session extensions

## Shared client state machine (`FlowStatus`)

```
idle → validating → uploading → queued/processing substates →
ready | awaiting_type | failed | duplicate_blocked → applying → done | cancelled
```

Mapped from server via `mapServerToFlowStatus` in `document-extraction-lifecycle.ts`.

Polling: `createExtractionPoller` — single-flight, backoff 2s → 5s → 10s.

## Shared UI components

| Component | Role |
|-----------|------|
| `DocumentExtractionFlowStatus` | Busy spinner, failed retry, duplicate blocked, upload context banner |
| `DocumentExtractionReviewPanel` | Plausibility, fields, entity resolution preview, action preview |
| `document-extraction-action-preview.ts` | Read-only semantic action list per document type |

Drawer is presentation-only — same hook contract, different shell (`DetailDrawer` vs full page vs operator sheet).

## Surfaces

| Surface | Hook | Review component |
|---------|------|------------------|
| `DocumentUploadView` | `useDocumentUploadPage` | `DocumentExtractionReviewPanel` |
| `VehicleDocumentUploadDrawer` | `useDocumentExtractionFlow` | `DocumentExtractionReviewPanel` |
| `OperatorAiUploadFlow` | `useDocumentExtractionFlow` | via `OperatorAiUploadReview` → panel |

## Out of scope (this release)

- `InvoiceExtractionUpload` / `FinesView` invoice stubs — separate later wiring
- Live schema registry fetch for field templates (still `EXTRACTION_TEMPLATES` fallback)
- Action plan apply lifecycle UI (backend-only today)

## Tests

- `useDocumentIntakeFlow.test.ts` — lifecycle mapping, poller contract, wiring guards
- `document-upload-page.test.tsx` — page renders shared review + action preview
- `useDocumentExtractionFlow.test.ts` — backward-compatible contract
