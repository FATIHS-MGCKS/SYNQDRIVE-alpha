# Document Follow-Up Suggestion Domain (V4.9.648)

Date: 2026-07-17  
Prompt: 73/84 — zentrale DocumentFollowUpSuggestion-Domain

## Goal

Central, idempotent follow-up suggestions generated after action plan persistence — suggestions only, no automatic execution or outreach.

## Domain model

Stored in `plausibility._pipeline.followUpSuggestions[]`.

| Field | Purpose |
|-------|---------|
| `suggestionId` | Stable id from `actionPlanId + generatedByRule` |
| `extractionId` | Source extraction |
| `actionPlanId` | Linked action plan |
| `type` | `CREATE_TASK`, `PREPARE_CUSTOMER_CONTACT`, `PREPARE_DRIVER_CONTACT`, `REVIEW_DEADLINE`, `VEHICLE_INSPECTION`, `WORKSHOP_APPOINTMENT`, `INSURANCE_REVIEW`, `PAYMENT_REVIEW`, `ASSIGN_RESPONSIBLE_USER`, `NO_FOLLOW_UP` |
| `title` / `rationale` | Human-readable copy |
| `suggestedDueAt` | Optional deadline hint |
| `targetEntity` | Entity type/id/label for navigation |
| `status` | `SUGGESTED` → `ACCEPTED` / `DISMISSED` / `SUPERSEDED` |
| `generatedByRule` | `semantic:*`, `registry:*`, `metadata:deadline:*` |
| `acceptedByUserId` / `resultingEntityId` | Set on explicit accept |

## Generation (after action plan)

Hook: `DocumentActionOrchestratorService.prepareConfirmedPlan()` → `DocumentFollowUpSuggestionService.syncForActionPlan()`.

Sources:

1. Optional/informational semantic actions in plan (`SUGGEST_DRIVER_ASSIGNMENT`, `SUGGEST_PAYMENT_REVIEW`, …)
2. Schema registry `followUpSuggestionRules` triggers (`missing_driver`, `deadline_detected`, …)
3. Plan metadata `deadlineSuggestions`

Idempotency: `mergeFollowUpSuggestionsIdempotent()` preserves `ACCEPTED`/`DISMISSED`; regenerates `SUGGESTED` by stable `suggestionId`.

Invalidation: `invalidateDocumentActionPlan()` supersedes open suggestions.

## Accept semantics (explicit only)

- **Not an executed action** until user accepts
- **No automatic contacts** — `PREPARE_*_CONTACT` creates task with `metadata.preparedOnly: true` (workflow notification.prepare pattern)
- **Task domain reuse** — `TasksService.upsertByDedup` with key `document-follow-up:{extractionId}:{suggestionId}`
- `NO_FOLLOW_UP` is informational only (not acceptable)

## API

- `GET .../follow-up-suggestions`
- `POST .../follow-up-suggestions/:suggestionId/accept`
- `POST .../follow-up-suggestions/:suggestionId/dismiss`

Vehicle + org scope.

## Tests

- `document-follow-up-suggestion.generator.spec.ts`
- `document-follow-up-suggestion.service.spec.ts`
