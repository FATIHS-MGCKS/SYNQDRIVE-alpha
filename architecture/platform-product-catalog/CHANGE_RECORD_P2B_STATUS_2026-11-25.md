# Change record — P2B catalog status lifecycle

**Date:** 2026-11-25  
**Operation:** `SYNQDRIVE_PRODUCT_CATALOG_V2_P2B_STATUS_LIFECYCLE`

## Implemented

- Dedicated Master Admin routes: impact GET + status PATCH (not metadata PATCH).
- Transactional status toggle with `lockProductCatalogRowBySlug`, CAS, mandatory in-tx audit.
- Impact preview contract with entitlement preservation guarantees.
- Master Admin UI status change dialog (9 locales); metadata edits preserved separately.
- Disposable PostgreSQL gate: P1 (4) + P2A (10) + **P2B (11)**.

## Rollback

Status PATCH failure rolls back `catalog_status` when audit insert fails (same pattern as P1 metadata).

## Non-effects

- No automatic org product reactivation on `DISABLED → ACTIVE`.
- No billing / subscription mutation.
- `ProductLicenseGuard` unchanged (org `ACTIVE` only).