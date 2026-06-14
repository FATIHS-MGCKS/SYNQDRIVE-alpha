# Changes & Architektur — AI Document Upload pipeline (2026-06-13)

> In-repo record for the SynqDrive AI Document Upload feature. Full feature docs:
> [`docs/ai-document-upload.md`](../docs/ai-document-upload.md).

## Changes

- Converted the AI Document Upload UI from a mock/template flow into a **real**
  upload → private storage → async AI extraction → human-confirmation pipeline.
- Added module `backend/src/modules/document-extraction/` (controller, service,
  apply service, plausibility service, text extractor, BullMQ processor, storage
  adapter, schemas, DTOs, errors, types) + `dimo/dimo-document-agent.service.ts`.
- Frontend: `DocumentUploadView.tsx` now does real multipart upload + status
  polling + server-driven field review and plausibility; `lib/api.ts` gained
  `uploadDocumentExtraction` / `getDocumentExtraction` / `retryDocumentExtraction`.
  Removed all fake AI analysis and field-level confidence.
- Removed the legacy document-extraction routes + inline apply block from
  `VehicleIntelligenceController` (relocated to the new module; no duplicate
  routes).
- Prisma: minimal, backward-compatible additions to `VehicleDocumentExtraction`
  (`objectKey`, `storageProvider`, `mimeType`, `sizeBytes`, `plausibility`,
  `errorMessage`, `queuedAt`, `processedAt`, `createdById`) and new
  `DocumentExtractionStatus` values (`QUEUED`, `PROCESSING`, `READY_FOR_REVIEW`,
  `APPLIED`, `FAILED`). Migration `20260613000000_document_extraction_pipeline`.
- Config: `document-extraction.config.ts`, queue name `document.extraction`,
  `.env.example` + `.gitignore` updates (private storage dirs ignored).
- Tests: 6 new spec files (45 tests) — storage key safety, schema/mime
  validation, plausibility, confirm idempotency + IDOR guard, text extractor,
  DIMO agent (mocked SDK).

## Architektur (signal/data-flow deltas)

- **New async pipeline**: upload endpoint → private `DocumentStoragePort`
  (local-disk impl, S3-ready) → `VehicleDocumentExtraction` (QUEUED) → BullMQ
  `document.extraction` worker → text extraction → vehicle/DIMO context → DIMO
  Agent (structured JSON) → server-side plausibility → `READY_FOR_REVIEW`.
- **DIMO**: reuses the existing `DimoAgentsService` (no changes to DIMO auth,
  telemetry, segments, signals, trips). DIMO is a vehicle-aware reasoning layer,
  **not** raw OCR — text is extracted first. Vehicle `tokenId` (from
  `vehicle_latest_states`) is passed for plausibility context only.
- **Domain application** happens only on human confirm, fanning out to existing
  services (service events, brake/tire lifecycle, battery evidence, damages,
  invoices). No new parallel domain flows.

## Notes

- The external "Synqdrive Code → Changes / Architektur" workspace is outside this
  repository and could not be edited from here; this file is the in-repo
  equivalent.
