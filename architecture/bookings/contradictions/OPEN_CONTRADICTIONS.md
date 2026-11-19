# Bookings — Open Contradictions

| ID | Statement A | Statement B | Resolution |
|----|-------------|-------------|------------|
| BKG-CONTRA-LICENSE-001 | P6-PR3 policy: operational Rental APIs require ACTIVE `RENTAL` via `ProductLicenseGuard` on `BookingsController` (confirmed on `origin/main`). | `DocumentsController` and `LegalDocumentDeliveryEvidenceController` expose booking-scoped HTTP without `ProductLicenseGuard` (confirmed in [`BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19.md`](../evidence/BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19.md)). | **Unresolved policy alignment** — not a Core/Rental boundary violation. **Confirmed missing route-level product guard** on both controllers. **Alternative enforcement:** org scope + RBAC only. **Entitlement bypass:** **not claimed** without HTTP proof; tracked as `BKG-HYP-001`. |

## Out of scope for BKG-CONTRA-LICENSE-001

`LegalDocumentsController` (`organizations/:orgId/legal-documents`) is **Documents** org legal-text administration — not asserted RENTAL-exclusive; separate product-license review belongs to Documents authority (`NOT_STARTED`).

No other contradictions recorded.