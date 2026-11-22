# Billing (SynqDrive SaaS) — Architecture authority (bootstrap, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Logical domain** | **Core** platform (tenant SaaS subscription, metering, Stripe catalog — distinct from Rental booking collections) |
| **Registry coverage status** | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-11-22 — P6C2 seal) |
| **Authority-native status** | Bootstrap V0.1 · repository index **PARTIAL** |
| **Production baseline** | **NOT_STARTED** |

## Mandatory entry documents (partial)

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
2. [`CHANGE_RECORD_P6C2_2026-11-22.md`](CHANGE_RECORD_P6C2_2026-11-22.md)
3. Product/commercial policy (cross-cutting): [`../platform-reorientation/evidence/P6C_PRODUCT_ENTITLEMENT_COMMERCIAL_POLICY_RECORD_2026-11-22.md`](../platform-reorientation/evidence/P6C_PRODUCT_ENTITLEMENT_COMMERCIAL_POLICY_RECORD_2026-11-22.md)

## Runtime boundaries (P6C2, repository-confirmed)

- **Commercial terms / subscription dates / purchased limits:** `BillingSubscription` + price books + Stripe mappings (when armed).
- **Operational product access (routes, guards, vehicle activation):** `OrganizationProduct.status` and vehicle grant/access modes — **not** billing resolver gates today.
- **Future direction:** `BillingEntitlementResolver` + projection to `organization_products` (`entitlement-migration.registry.ts`) — **not** sole runtime gate.

## Validation commands (non-exhaustive)

```bash
cd backend && npm test -- billing-product-price.schema
cd backend && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
  bash scripts/test/vo5b-vehicle-onboarding-postgres-ci.sh
```

Disposable Postgres only; never production URLs.