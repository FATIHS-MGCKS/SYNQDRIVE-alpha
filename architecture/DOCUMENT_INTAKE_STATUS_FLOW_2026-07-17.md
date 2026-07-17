# Document Intake User-Facing Status Flow (V4.9.642)

**Date:** 2026-07-17  
**Scope:** Processing UX across page, drawer, shared flow status

## Goal

Replace technical processing labels (OCR, QUEUED, `processingStage` enums in UI) with a clear six-step user flow driven by real server status/stage/errorPhase values.

## User-facing steps

| Step | Label (DE) | Driven by |
|------|------------|-----------|
| `file_check` | Datei wird geprüft | Client `validating`/`uploading`; `PROCESSING`+`UPLOAD`; `errorPhase` UPLOAD |
| `file_stored` | Datei wurde sicher gespeichert | `stored`, `queued`, `retrying`; `STORAGE`/`QUEUE`; error STORAGE/QUEUE |
| `text_recognition` | Text wird erkannt | `ocr`; `OCR`; error OCR |
| `classification` | Dokument wird eingeordnet | `classifying`, `awaiting_type`, `AWAITING_DOCUMENT_TYPE`; `CLASSIFICATION` |
| `data_preparation` | Daten und Zuordnungen werden vorbereitet | `extracting`, `validating_plausibility`; `EXTRACTION`/`VALIDATION` |
| `ready_for_review` | Bereit zur Prüfung | `ready`, `READY_FOR_REVIEW`, `REVIEW` |

## Rules

- **No invented progress %** — step list only; active/complete/failed/pending from real signals.
- **Errors on correct step** — `errorPhase` maps to step; prior steps complete, failed step red, later steps stay pending (not green).
- **Retry** — button references failed step label; `retrying` shows detail on active storage step.
- **AWAITING_DOCUMENT_TYPE** — classification step active with explicit detail + type form below on page.
- **Long running** — elapsed time from `processingStartedAt` / record timestamps; separate safe-leave hint when long-running threshold fires.
- **Removed** — sidebar marketing box „KI-gestützte Klassifikation“ on `DocumentUploadView`.

## Key files

| File | Role |
|------|------|
| `document-intake-processing-steps.ts` | Step resolution + tests (success/failure/retry) |
| `DocumentIntakeProcessingSteps.tsx` | Accessible step list UI |
| `DocumentExtractionFlowStatus.tsx` | Integrates steps for busy/failed/retry/awaiting |
| `DocumentUploadView.tsx` | Uses shared flow status; removes AI marketing panel |

## Architecture reuse

Builds on `mapServerToFlowStatus` (V4.9.640) and unified intake hook — no duplicate polling or status machines.
