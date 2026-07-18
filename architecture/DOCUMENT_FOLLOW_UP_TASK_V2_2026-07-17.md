# Document Follow-Up Task V2 Materialization (V4.9.649)

Date: 2026-07-17  
Prompt: 74/84 — bestätigte Follow-up-Vorschläge → Task Domain V2

## Goal

Wire explicit user acceptance of `DocumentFollowUpSuggestion` rows into the existing Task Domain V2 stack: templates, dedup, entity links, automation metadata, action result IDs, and outbox failure enqueue.

## Accept flow (user-confirmed only)

`POST .../follow-up-suggestions/:suggestionId/accept` → `DocumentFollowUpSuggestionService.acceptSuggestion()`:

1. Resolve apply **action result IDs** from `plausibility._pipeline.actionPlanExecution` (`document-follow-up-action-results.util.ts`)
2. Build task payload via `document-follow-up-task.materializer.ts`
3. `TasksService.upsertByDedup` with V2 checklist seeds (`checklistForType`)
4. On failure → `TaskAutomationOutboxEnqueueService.enqueueFailure` (existing outbox)

Dismiss remains explicit — no task created.

## Materialization rules

| Suggestion type | Task type | Dedup (priority) | Automation catalog |
|-----------------|-----------|------------------|------------------|
| `PAYMENT_REVIEW` | `INVOICE_REQUIRED` | `invoice:payment-check:{invoiceId}` when apply result exists | `INVOICE_PAYMENT_CHECK` |
| `REVIEW_DEADLINE` (fine) | `DOCUMENT_REVIEW` | `document-extraction:fine:{extractionId}` when `fineId` present | — |
| `VEHICLE_INSPECTION` | `VEHICLE_INSPECTION` | `document-follow-up:{extractionId}:{suggestionId}` | `VEHICLE_INSPECTION_TUV_DUE` |
| `WORKSHOP_APPOINTMENT` / `INSURANCE_REVIEW` | `REPAIR` | per-suggestion key | `REPAIR_REQUIRED` |
| `CREATE_TASK` / `ASSIGN_RESPONSIBLE_USER` | `DOCUMENT_REVIEW` | per-suggestion key | `DOCUMENT_PACKAGE_INCOMPLETE` |
| `PREPARE_*_CONTACT` | `CUSTOMER_FOLLOWUP` | per-suggestion key | — (`preparedOnly`, no auto outreach) |

## Entity links

Tasks receive links from confirmed extraction data (`acceptedEntityLinks`) plus apply results:

- `documentId` → extraction id
- `vehicleId`, `bookingId`, `customerId` / driver, `vendorId`
- `fineId`, `invoiceId` from action plan execution

`metadata.actionResultIds` and `metadata.documentFollowUp` persist the full apply result snapshot.

## Due date policy

- `dueDateConfirmed: true` only when `suggestedDueAt` comes from **user-confirmed** `confirmedData.dueDate`
- Detected `metadata.deadlineSuggestions` remain visible on the suggestion but **do not** set task `dueDate`
- Missing deadlines are never invented

## German titles (generator)

Semantic actions map to operator-facing titles, e.g. Bußgeldfrist prüfen, Rechnung freigeben, TÜV-Mangel beseitigen, Fahrzeug prüfen, Werkstatttermin vereinbaren, fehlende Dokumentdaten ergänzen.

## Tests

- `document-follow-up-task.materializer.spec.ts` — dedup, links, due date, checklist
- `document-follow-up-suggestion.service.spec.ts` — accept, dismiss, dedup, outbox on failure
- `document-follow-up-suggestion.generator.spec.ts` — titles, `dueDateConfirmed`

## Files

- `document-follow-up-action-results.util.ts`
- `document-follow-up-task.materializer.ts`
- `document-follow-up-suggestion.service.ts` (materializer + outbox)
- `document-follow-up-suggestion.generator.ts` (titles + `dueDateConfirmed`)
- `document-follow-up-suggestion.types.ts`
