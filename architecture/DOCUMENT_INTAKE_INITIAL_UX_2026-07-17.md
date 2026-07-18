# Document Intake Initial UX (V4.9.641)

**Date:** 2026-07-17  
**Scope:** Frontend rental page + vehicle drawer initial states

## Goal

Upload-first intake: users can select a file immediately without pre-filling entity or document-type forms.

## Initially visible

| Surface | Elements |
|---------|----------|
| Page (`DocumentUploadView`) | Upload zone, browse button, supported formats/size, short upload-first hint |
| Drawer (`VehicleDocumentUploadDrawer`) | Same upload zone + static origin context hint (vehicle label, unconfirmed) |

## Hidden until after OCR

- Document type selector (pre-upload)
- Vehicle / booking / customer / driver assignment controls
- Extracted field editors
- Entity resolution preview
- Downstream / follow-up action previews
- Confirm / reextract footer actions (drawer)

Post-OCR states (`awaiting_type`, `ready`, etc.) reveal type correction, vehicle assignment, review panel, and actions.

## Rules implemented

1. **AUTO internal default** — `useDocumentIntakeFlow` and embedded flows use `initialDocType: 'AUTO'`; no visible AUTO dropdown before upload.
2. **No first-vehicle auto-select** — page `selectedVehicleId` starts empty; vehicle chosen in review after OCR or via reassignment API.
3. **Drawer context not confirmed** — `buildOriginContextHint(vehicleLabel, 'Fahrzeugdetail')` suffix `– noch nicht bestätigt`; drawer title no longer shows vehicle as assigned target.
4. **No empty forms** — idle UI is only upload + hints; selectors appear in review/awaiting-type steps.
5. **Org upload on page** — `api.documentExtraction.upload` + org-scoped polling when no `vehicleId` at upload time (aligns with V4.9.625 backend).
6. **Accessibility** — `DocumentIntakeUploadZone`: `role="button"`, keyboard Enter/Space, `aria-disabled`, `role="alert"` / `role="note"` for errors and context.

## Key files

| File | Change |
|------|--------|
| `frontend/src/rental/components/documents/DocumentIntakeUploadZone.tsx` | Shared idle upload UI |
| `frontend/src/rental/hooks/useDocumentIntakeFlow.ts` | Org upload/poll path, AUTO default, `requireVehicle` split |
| `frontend/src/rental/hooks/useDocumentUploadPage.ts` | Upload without pre-selected vehicle |
| `frontend/src/rental/components/DocumentUploadView.tsx` | Upload-first idle layout |
| `frontend/src/rental/components/documents/VehicleDocumentUploadDrawer.tsx` | Remove pre-OCR doc type; context hint |
| `frontend/src/lib/api.ts` | `documentExtraction.upload` |
| `frontend/src/rental/hooks/document-intake-initial-state.test.ts` | Initial-state regression tests |

## Session recovery

`ActiveExtractionPointer` now stores `orgId` + optional `vehicleId` for page reload during org-inbox extractions without assigned vehicle.

## Confirm / apply

Vehicle assignment remains required before confirm (backend `confirm(vehicleId, …)`). Review UI exposes vehicle selector with empty placeholder until user assigns.
