# BKG-EVID-HTTP-DOC-LICENSE-2026-11-19

**Type:** CURRENT_TEST (HTTP integration)  
**Repository SHA:** post P6-PR4A fix on branch  
**Test file:** `backend/src/shared/guards/booking-document-product-license.http-security.integration.spec.ts`

## Pre-fix observation (Phase 1)

Without `ProductLicenseGuard` on target controllers, authenticated `MASTER_ADMIN` with **TRIAL**, **missing**, **SUSPENDED**, or **CANCELLED** `RENTAL` received **HTTP 200** on:

- `GET /api/v1/organizations/:orgId/bookings/:bookingId/documents`
- `GET /api/v1/organizations/:orgId/bookings/:bookingId/legal-delivery-evidence`

**Verdict:** Product entitlement bypass **CONFIRMED** (8 failing expectations before fix).

## Post-fix matrix (Phase 3)

| Case | DocumentsController | LegalDocumentDeliveryEvidenceController |
|------|---------------------|----------------------------------------|
| ACTIVE RENTAL + MA | 200 | 200 |
| Missing product | 403 | 403 |
| TRIAL | 403 | 403 |
| SUSPENDED | 403 | 403 |
| CANCELLED | 403 | 403 |
| Cross-org JWT | 403 | 403 |
| WORKER no bookings.read + ACTIVE | 403 (RBAC) | 403 (RBAC) |

Denied paths: service mocks **not** invoked on product-deny cases (`getBundleView` / `listForBooking`).

## Out of scope

`LegalDocumentsController` (`/legal-documents`) — no `ProductLicenseGuard` added (org legal-text admin).