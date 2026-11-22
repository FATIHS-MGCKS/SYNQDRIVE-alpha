# P6C2 — Disposable PostgreSQL evidence

**Date:** 2026-11-22  
**Host:** `127.0.0.1:5432` (local disposable only)  
**Migration procedure:** `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash backend/scripts/test/prisma-migrate-deploy-resilient.sh`  
**Forbidden:** `prisma db push` shortcut for catalog/VO5B evidence

## product-catalog-foundation

| Field | Value |
|-------|-------|
| Opt-in | `PRODUCT_CATALOG_FOUNDATION_POSTGRES_INTEGRATION=1` |
| Database | `synqdrive_product_catalog_p2_pr1` |
| Result | **PASS** (2 tests) |

## vehicle-product-grant.postgres

| Field | Value |
|-------|-------|
| Opt-in | `VEHICLE_PRODUCT_GRANT_POSTGRES_INTEGRATION=1` |
| Database | `synqdrive_product_catalog_p2_pr1` (post-migrate) |
| Result | **PASS** (4 tests) |

## product-vehicle-access.postgres

| Field | Value |
|-------|-------|
| Opt-in | `PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION=1` |
| Database | `synqdrive_product_catalog_p2_pr1` (post-migrate) |
| Result | **PASS** (8 tests) |

## VO5B billing bridge

| Field | Value |
|-------|-------|
| Opt-in | `VO5B_REGISTRY_BILLING_PG=1` |
| Database | Ephemeral `vo5b_p6c2_*` + full migrate deploy |
| Result | **PASS** (24 tests) |

## Classifications

- Prior P6C1 failures on empty/`db push` databases: **INFRASTRUCTURE** (missing migrate + seeded catalog migrations), not product defects.