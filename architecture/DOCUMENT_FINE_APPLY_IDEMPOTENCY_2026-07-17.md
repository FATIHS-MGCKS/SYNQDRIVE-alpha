# Document Fine Apply Idempotency (V4.9.612)

**Date:** 2026-07-17  
**Prompt:** 37/84 — Idempotent, extraction-linked fine apply

## Scope

| Module | Role |
|--------|------|
| `document-fine-extraction.rules.ts` | Fine apply gate, payload builder, confirmed entity-link resolution |
| `document-action-planner.fine-rules.ts` | `CREATE_FINE_DRAFT` action plan |
| `executors/create-fine-document-action.executor.ts` | Executes fine draft creation via `FinesService` |
| `fines.service.ts` | `createFromDocumentExtraction()` — idempotent create + task dedup |
| Prisma `Fine.documentExtractionId` | Tenant-unique extraction linkage |

## Rules

1. **Idempotent by extraction** — unique `(organizationId, documentExtractionId)`; retry returns existing fine.
2. **Reference duplicate check** — blocks apply when `fineNumber` already exists for org (different extraction).
3. **No defaults** — offense type and amount required; zero amount blocked.
4. **Draft status** — extraction apply creates `UNDER_REVIEW` fine drafts, not auto-final `MATCHED`.
5. **Confirmed links only** — `bookingId` / `customerId` / driver link from `acceptedEntityLinks` only (no auto `matchBooking`).
6. **Task dedup** — `document-extraction:fine:{extractionId}` via `upsertByDedup`.
7. **Result entity ID** — `CREATE_FINE_DRAFT` stores `resultEntityId = fine.id` on action execution record.
8. **No backfill** — existing fines without `documentExtractionId` remain unchanged.

## Confirm / apply wiring

- `FINE` documents route through `DocumentActionOrchestratorService` (with archive types).
- Legacy `DocumentExtractionApplyService.applyFine()` removed.

## Tests

- `document-fine-extraction.rules.spec.ts`
- `document-action-planner.fine-rules.spec.ts`
- `fines.service.spec.ts` — retry + parallel race
- `executors/create-fine-document-action.executor.spec.ts`
