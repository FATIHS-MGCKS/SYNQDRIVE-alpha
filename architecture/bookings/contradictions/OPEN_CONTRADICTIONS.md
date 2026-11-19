# Bookings — Open Contradictions

| ID | Statement A | Statement B | Resolution |
|----|-------------|-------------|------------|
| BKG-CONTRA-LICENSE-001 | P6-PR3 policy vs booking-document HTTP without product guard | HTTP tests **confirmed bypass** pre-fix ([`BKG-EVID-HTTP-DOC-LICENSE-2026-11-19.md`](../evidence/BKG-EVID-HTTP-DOC-LICENSE-2026-11-19.md)); **remediated** P6-PR4A — `ProductLicenseGuard` + `@RequireProduct(RENTAL)` on `DocumentsController` and `LegalDocumentDeliveryEvidenceController`. `LegalDocumentsController` unchanged. |

## Out of scope for BKG-CONTRA-LICENSE-001

`LegalDocumentsController` (`organizations/:orgId/legal-documents`) is **Documents** org legal-text administration — not asserted RENTAL-exclusive; separate product-license review belongs to Documents authority (`NOT_STARTED`).

No other contradictions recorded.