# Bookings — Open Contradictions

| ID | Statement A | Statement B | Resolution |
|----|-------------|-------------|------------|
| BKG-CONTRA-LICENSE-001 | P6-PR3 requires ACTIVE RENTAL on licensed Rental operational controllers (`BookingsController` included). | `DocumentsController` exposes org booking document routes without `ProductLicenseGuard` in licensed registry (`rental-product-license.controllers.ts`). | **Unresolved** — may be intentional (same JWT session) or oversight; needs independent security review. Not a Core/Rental boundary violation. |

No other contradictions recorded at bootstrap.