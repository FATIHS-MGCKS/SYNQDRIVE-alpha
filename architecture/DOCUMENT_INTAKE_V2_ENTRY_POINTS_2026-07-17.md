# Document Intake V2 Entry Points (V4.9.654)

**Date:** 2026-07-17  
**Prompt:** 79/84 — Migrate all relevant document entry points to canonical Document Intake V2

## Contract

All rental/operator surfaces launch the **same** `useDocumentIntakeFlow` pipeline with optional unconfirmed context via `document-intake-entry.ts`:

| URL param | Purpose |
|-----------|---------|
| `intakeContextType` | `VEHICLE` \| `BOOKING` \| `CUSTOMER` \| `DRIVER` \| `FINE` \| `INVOICE` |
| `intakeContextId` | Entity id (candidate only) |
| `intakeVehicleId` | Pre-select vehicle on page flow |
| `intakeSourceSurface` | Origin surface for resolver + banner |
| `intakeReturnView` / `intakeReturnEntityId` | Back navigation after intake |

`RentalEntityNavigationContext.openDocumentIntake()` pushes URL state and switches to `document-upload`.

## Migrated surfaces

| Surface | Mechanism | Context |
|---------|-----------|---------|
| Central document page | Existing `DocumentUploadView` | URL entry + back button |
| Vehicle documents drawer | `VehicleDocumentUploadDrawer` | `VEHICLE` optional context |
| Invoices KI-Upload | `DocumentIntakeLaunchAiButton` | `INVOICE` — **not** `invoices.uploadFile` attachment |
| Fines KI-Upload | Launch button; `AIUploadFlow` stub removed | `FINE` |
| Booking detail | `BookingFinanceDocumentsTab` CTA | `BOOKING` |
| Customer detail | `CustomerDocumentsTab` CTA (separate from KYC boxes) | `CUSTOMER` |
| Health (brake/tire) | `openDocumentIntake` | `VEHICLE` + `health_page` |
| Damages | `DamageAiIntakeDialog` link | `VEHICLE` + `damage_page` |
| Operator AI Upload | `OperatorAiUploadFlow` org context upload | `BOOKING` / `CUSTOMER` / `VEHICLE` |

## Rules preserved

- **No duplicate OCR** — legacy `InvoiceExtractionUpload` and `FinesView.AIUploadFlow` removed from routing
- **No default SERVICE** — page `pendingTypeSelection` and operator service default → `AUTO`
- **Invoice public attachment** — `CreateInvoiceDialog` / `api.invoices.uploadFile` unchanged (not document intake)
- **KYC customer documents** — `CustomerDocumentUploadBox` unchanged
- **Embedded org upload** — non-`VEHICLE` optional context uses org upload API in embedded mode (`useOrgContextUpload`)

## Tests

- `document-intake-entry.test.ts`
- `document-intake-entry-points.test.ts` (source guards per surface)
