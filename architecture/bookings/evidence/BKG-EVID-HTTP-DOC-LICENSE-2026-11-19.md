# BKG-EVID-HTTP-DOC-LICENSE-2026-11-19

**Type:** CURRENT_TEST (HTTP integration)  
**Repository SHA:** post P6-PR4A fix on branch  
**Test file:** `backend/src/shared/guards/booking-document-product-license.http-security.integration.spec.ts`

## Pre-fix observation (Phase 1)

Without `ProductLicenseGuard` on target controllers, authenticated `MASTER_ADMIN` with **TRIAL**, **missing**, **SUSPENDED**, or **CANCELLED** `RENTAL` received **HTTP 200** on:

- `GET /api/v1/organizations/:orgId/bookings/:bookingId/documents`
- `GET /api/v1/organizations/:orgId/bookings/:bookingId/legal-delivery-evidence`

**Verdict:** Product entitlement bypass **CONFIRMED** (8 failing expectations before fix).

## Post-fix matrix (Phase 3 — reads)

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

## Mutation matrix (P6-PR4A review — POST)

| Mutation | TRIAL product | ACTIVE + MA | Service not called on deny |
|----------|---------------|-------------|----------------------------|
| `POST …/documents/generate-initial-bundle` | 403 | 200/201 | `enqueueInitialBundle` |
| `POST …/documents/:id/void` | 403 | 200/201 | `voidDocument` |
| `GET …/documents/:id/metadata` | 403 | 200 | `getById` |
| `POST …/legal-delivery-evidence` | 403 | 201 | `recordPresentation` |

## F2 — `documents/:documentId/*` ownership (independent review)

| Route | Permission | Service | Ownership verdict |
|-------|------------|---------|-------------------|
| `GET documents/:documentId/metadata` | `bookings.read` | `GeneratedDocumentsService.getById` | **RENTAL-operational** — generated PDFs for booking/invoice/handover/rental-contract lifecycle (`GeneratedDocument` bookingId/invoiceId links); frontend callers are rental/operator booking document flows only |
| `GET documents/:documentId/download` | `bookings.read` | `getDownload` | Same |
| `POST documents/:documentId/void` | `bookings.manage` | `voidDocument` | Same |

**Decision (repository audit):** All `DocumentsController` routes use the `bookings` permission module and serve the booking document engine described in module header. No non-RENTAL product HTTP consumer found for these org-scoped generated-document endpoints. **Class-level `@RequireProduct(RENTAL)` retained.**

## Out of scope

`LegalDocumentsController` (`/legal-documents`) — no `ProductLicenseGuard` added (org legal-text admin).