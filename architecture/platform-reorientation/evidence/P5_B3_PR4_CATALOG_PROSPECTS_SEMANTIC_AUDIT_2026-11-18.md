# P5-B3-PR4 — Catalog (Prospects, Insurances, Parts) semantic audit

**Date:** 2026-11-18 (Europe/Berlin)  
**Base:** `17fc3bbeea09a213fd83051d1776f7197a8485cc` (post PR3 merge)  
**Gaps:** GAP-H1 (Prospects), GAP-H2 (Insurances + PartsAccessories admin)

## Mutating endpoints covered

| Controller | Mutations |
|------------|-----------|
| `ProspectsController` | create, update, delete, import, convert |
| `InsurancesAdminController` | partner/contact/template CRUD; partner connection test |
| `PartsAccessoriesAdminController` | provider/disclosure CRUD; provider connection test |

## Audit actions

- `MASTER_PROSPECT_CATALOG_MUTATION`
- `MASTER_INSURANCE_CATALOG_MUTATION`
- `MASTER_PARTS_CATALOG_MUTATION`

Metadata: `catalogDomain`, `operation`, `resource`, `outcome`, `entityId` (top-level), sanitized `updatedFieldNames` / `importCount` where applicable. No prospect PII, credentials, or connection error messages in audit rows.

## Dedup

`shouldSkipGenericPrivilegedSuccessAudit` extended for `/admin/prospects`, `/admin/insurances/`, `/admin/parts-accessories/` mutating methods.

## Limitations

- Connection tests record `TEST_SUCCEEDED` / `TEST_FAILED` only (no provider error text).
- Import audit uses aggregate `importCount`, not per-row ids.
- No DELETE endpoints on insurances/parts admin controllers at time of PR.

**REGISTRY_REVIEWED:** UNCHANGED