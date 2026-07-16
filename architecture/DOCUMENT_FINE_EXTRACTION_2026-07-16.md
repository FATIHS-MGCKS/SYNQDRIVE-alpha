# Bußgeld (FINE) Document Extraction — 2026-07-16

## Problem

Bußgeld uploads via AI Document Upload had four UX/data gaps:

1. **Wrong vehicle** — upload bound to UI-selected vehicle; first fleet vehicle auto-selected; no plate extraction or matching.
2. **ISO dates** — review showed `YYYY-MM-DD` instead of locale format (e.g. `24.10.2025`).
3. **Unstructured Grund** — single free-text `description` blob.
4. **Amount in cents** — review displayed `1750` instead of `17,50 €`.
5. **Apply no-op** — confirm did not create a `Fine` record in the Bußgelder module.

## Changes

### Backend

| Area | Change |
|------|--------|
| `document-extraction.schemas.ts` | FINE fields: `licensePlate`, `offenseType`, `location`, `issuingAuthority`, `feeBreakdown`, `dueDate`, structured hints |
| `document-extraction-plausibility.service.ts` | `PLATE_MISMATCH` → **BLOCKER** for `FINE` |
| `document-extraction-apply.service.ts` | `applyFine()` → `FinesService.create()` |
| `document-extraction.service.ts` | `reassignVehicleForOrg()` |
| `document-extraction-org.controller.ts` | `PATCH .../document-extractions/:id/vehicle` |

### Frontend

| Area | Change |
|------|--------|
| `document-extraction-field-format.ts` | Date/currency display + confirm parsing; plate normalization + fleet match |
| `document-extraction.shared.ts` | FINE review template; `buildReviewFields` / `parseReviewFieldsForConfirm` |
| `useDocumentUploadPage.ts` | No auto-select first vehicle; auto-reassign by plate; editable vehicle on review |
| `DocumentUploadView.tsx` | Vehicle dropdown with plates; multiline fee breakdown |

## Flow (Bußgeld)

```
Upload (vehicle pre-selected) → AI extracts plate + structured fields
  → Plausibility: plate mismatch = BLOCKER
  → Auto-reassign to fleet vehicle matching extracted plate (if found)
  → Review: dates in de-DE, amount as €, fee breakdown multiline
  → Confirm → Fine record + task in Bußgelder module
```
