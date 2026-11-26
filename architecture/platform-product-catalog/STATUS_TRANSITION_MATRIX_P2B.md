# P2B — Product catalog status transition matrix

**Slice:** `SYNQDRIVE_PRODUCT_CATALOG_V2_P2B_STATUS_LIFECYCLE`  
**Registry:** platform product catalog (`AUDIT_IN_PROGRESS`)

## Allowed transitions (Master Admin)

| From | To | API | Notes |
|------|-----|-----|-------|
| `ACTIVE` | `DISABLED` | `PATCH /admin/products/:slug/catalog-status` | Blocks new admission (P2A); preserves existing org products + grants |
| `DISABLED` | `ACTIVE` | same | Restores admission eligibility; does **not** auto-reactivate suspended org products |
| same | same | — | No-op: HTTP 200, **no** audit row |

Invalid: any value outside `ACTIVE` / `DISABLED`; `TAXI` + `DISABLED → ACTIVE` (retired slug).

## Lock ordering (shared with P2A)

1. `BEGIN`
2. `lockProductCatalogRowBySlug` (`products` row `FOR UPDATE`)
3. CAS on `ifCurrentCatalogStatus`
4. `UPDATE catalog_status`
5. Mandatory `activityLog` in **same** transaction
6. `COMMIT`

Admission mutations (P2A) use the **same** row lock — status transitions serialize with assign / grant / broaden.

## Impact preview

`GET /admin/products/:slug/catalog-status/impact?targetCatalogStatus=…`

Server-derived counts only. Preview may be stale; PATCH re-validates under write lock.

## Distinction from business readiness

`ProductCatalogStatus` is **platform admission policy**. Business launch / roadmap labels in Master UI are informational only (P1 metadata editor).