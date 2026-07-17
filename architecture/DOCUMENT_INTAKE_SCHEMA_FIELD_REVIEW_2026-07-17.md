# Document Intake V2 — Schema-Driven Field Review (V4.9.645)

**Date:** 2026-07-17  
**Scope:** Prompt 70 — schema-driven field review with explicit save + re-check.

## Goal

Replace duplicated `EXTRACTION_TEMPLATES` field lists with registry-driven review:

- Fields grouped by `uiGroup` from document schema registry
- Required / missing markers, per-field blockers and warnings
- Confidence only when AI context is helpful (< 90 %, not user-confirmed)
- Optional source/page + text evidence (sensitive masking)
- Editable values with localized dates and currency
- Explicit **Speichern und erneut prüfen** — no silent autosave
- Action plan preview only after saved confirmed values

## Rules enforced

| Rule | Implementation |
|------|----------------|
| Fields only after extraction | Review enabled for `READY_FOR_REVIEW` with resolved schema |
| Schema-driven, not templates | `GET /document-extractions/schemas/resolve` + `buildSchemaReviewGroups` |
| No silent autosave | Local dirty state; save only via button → `POST .../save-review` |
| Action plan from saved values | `hasSavedFieldReview(confirmedData)` gates preview + confirm |
| Confirm requires saved review | `handleConfirm` rejects when no persisted field review |
| Sensitive data | `maskSensitiveValue` in read-only; provenance snippets already masked server-side |
| Plan invalidation on field save | `invalidateDocumentActionPlan(CONFIRMED_DATA_CHANGED)` in `persistReview` |

## Backend

| Endpoint | Role |
|----------|------|
| `POST /vehicles/:vehicleId/document-extractions/:id/save-review` | Persist `confirmedData`, update provenance, re-run plausibility, stay `READY_FOR_REVIEW` |
| `POST /organizations/:orgId/document-extractions/:id/save-review` | Org-scoped equivalent |
| `GET /document-extractions/schemas/resolve` | Resolve `PublicDocumentSubtypeSchema` for UI |

`DocumentExtractionService.persistReview()` shares sanitization + provenance logic with `confirm()` but does not apply.

## Frontend modules

| Module | Role |
|--------|------|
| `document-schema-field-review.ts` | Build grouped fields, parse save payload, saved-review detection |
| `DocumentSchemaFieldReview.tsx` | Grouped UI, badges, source toggle, save button |
| `useDocumentSchemaReview.ts` | Schema fetch, dirty tracking, save API |
| `DocumentExtractionReviewPanel.tsx` | Wires schema review; legacy flat list fallback without `t` |
| `api.ts` | `resolveSchema`, `saveReviewByOrg`, `saveDocumentReview` |

## Tests

- `document-schema-field-review.test.ts` — **INVOICE**, **FINE**, **SERVICE** grouping/format/save
- `document-schema-field-review.ui.test.tsx` — grouped render, save disabled when clean
- `document-extraction.service.spec.ts` — `saveReview` stays `READY_FOR_REVIEW`
