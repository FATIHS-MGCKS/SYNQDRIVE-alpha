# BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19

**Type:** CURRENT_CODE inspection (independent review F1)  
**Repository SHA:** `41fd912aacbefeb20ec238bc481b5505f943b65e`  
**Captured:** 2026-11-19

## DocumentsController

- **File:** `backend/src/modules/documents/documents.controller.ts`
- **Base path:** `organizations/:orgId` (booking routes under `bookings/:bookingId/...`)
- **Guards:** `@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)` — **no** `ProductLicenseGuard`, **no** `@RequireProduct`
- **Authorization:** `@RequirePermission('bookings', read|write|manage)` on booking document routes; `@Roles` on mutating bundle/generation routes
- **Service layer:** no `organizationProduct` / `ProductSlug` / entitlement-policy usage under `backend/src/modules/documents/` (repo-wide grep)

## LegalDocumentDeliveryEvidenceController

- **File:** `backend/src/modules/documents/legal-document-delivery-evidence.controller.ts`
- **Base path:** `organizations/:orgId/bookings/:bookingId/legal-delivery-evidence`
- **Guards:** `@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)` — **no** `ProductLicenseGuard`
- **Authorization:** `@RequireLegalDocumentPermission(...)` (legal document permission module, not product license)

## LegalDocumentsController (ownership note — not F1 scope)

- **File:** `backend/src/modules/documents/legal-documents.controller.ts`
- **Base path:** `organizations/:orgId/legal-documents` — org-level legal text lifecycle (not classified as RENTAL-exclusive booking ops)
- **Guards:** `OrgScopingGuard, RolesGuard, PermissionsGuard` only — also **no** `ProductLicenseGuard` (not evaluated as booking product-license bypass)

## Comparison (BookingsController)

- `backend/src/modules/bookings/bookings.controller.ts`: `OrgScopingGuard`, `ProductLicenseGuard`, `RolesGuard`, `PermissionsGuard` + `@RequireProduct(ProductSlug.RENTAL)` (P6-PR3 on main)

## F1 classification summary

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Missing route-level `ProductLicenseGuard` on DocumentsController and LegalDocumentDeliveryEvidenceController | **CONFIRMED** |
| 2 | Alternative enforcement (OrgScopingGuard, PermissionsGuard, RolesGuard, service org/booking scoping) | **CONFIRMED** — does **not** include RENTAL operational product entitlement |
| 3 | Confirmed entitlement bypass (TRIAL / non-ACTIVE product still reaches booking document HTTP) | **NOT PROVEN** — parallel HTTP surface is **INFERRED** risk; no HTTP matrix executed in this remediation |