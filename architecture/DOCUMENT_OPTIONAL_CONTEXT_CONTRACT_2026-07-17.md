# Document OptionalContext Contract (V4.9.626)

**Date:** 2026-07-17  
**Prompt:** 51/84 — Optional upload context as unconfirmed candidate with resolver visibility

## Context types

| Type | Meaning |
|------|---------|
| `VEHICLE` | Upload opened from a vehicle surface |
| `BOOKING` | Upload linked to a booking |
| `CUSTOMER` | Upload linked to a customer |
| `DRIVER` | Upload linked to a driver |
| `FINE` | Upload linked to a fine |
| `INVOICE` | Upload linked to an invoice |
| `NONE` | Explicit opt-out (no context candidate) |

## Candidate shape

Stored in `plausibility._pipeline.uploadContext`:

```json
{
  "candidate": {
    "entityType": "VEHICLE",
    "entityId": "…",
    "sourceSurface": "vehicle_detail",
    "providedAt": "ISO-8601",
    "providedByUserId": "…",
    "confirmationStatus": "CANDIDATE"
  },
  "searchScope": {
    "entityType": "VEHICLE",
    "entityId": "…",
    "narrowsSearch": true
  },
  "resolver": {
    "status": "PENDING | ALIGNED | CONFLICT | NO_SIGNAL",
    "evaluatedAt": "ISO-8601",
    "conflicts": []
  }
}
```

Legacy DB columns `upload_context_type` / `upload_context_id` mirror the candidate for queries but do **not** imply confirmation.

## Rules

1. **Candidate only** — `confirmationStatus` is always `CANDIDATE`; confirm/apply still requires explicit user action.
2. **Visible origin** — Public DTO exposes `uploadContext.label` (German): `Aufgerufen aus … – noch nicht bestätigt`.
3. **OCR may contradict** — After extraction, `evaluateUploadContextResolver` compares OCR hints vs. org-scoped entity snapshot; `CONFLICT` surfaces field-level messages.
4. **Search narrowing** — `narrowEntitySearchCandidates` may filter entity-link search results by `searchScope`; if narrowing would empty the list, the original candidates are returned (no invented entities).
5. **VEHICLE vs other types** — Only `VEHICLE` context sets `vehicleId` on the extraction row; `BOOKING`/`CUSTOMER`/etc. keep `vehicleId=null` until reassignment.

## Surfaces

| `sourceSurface` | Typical origin |
|-----------------|----------------|
| `vehicle_detail` | Vehicle upload drawer / vehicle route |
| `org_inbox` | Org-wide inbox upload |
| `rental_ui` | Rental document upload page |
| `operator_ai_upload` | Operator AI upload |
| `api` | Direct API call |

## API

Org upload DTO accepts `optionalContextType`, `optionalContextId`, `sourceSurface`.

Public extraction DTO adds `uploadContext: PublicUploadContextDisplayDto | null`.

## UI

- `DocumentUploadView` and `VehicleDocumentUploadDrawer` show the context banner during processing and review.
- Conflict state uses warning styling and lists resolver conflict messages.

## Tests

- `document-upload-context.util.spec.ts` — aligned + conflicting resolver, search narrowing
- `document-upload-context.service.spec.ts` — entity types, tenant checks
- `document-extraction-upload-org.spec.ts` — org upload with optional context
- `frontend/src/lib/document-upload-context.test.ts` — banner + conflict helpers
