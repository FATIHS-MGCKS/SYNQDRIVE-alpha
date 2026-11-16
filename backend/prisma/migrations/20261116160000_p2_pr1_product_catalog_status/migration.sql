-- P2-PR1: Product catalog status for Master Admin (licensing metadata only).
-- Existing rows default to ACTIVE — no entitlement or license-guard semantic change.

CREATE TYPE "ProductCatalogStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TABLE "products"
ADD COLUMN "catalog_status" "ProductCatalogStatus" NOT NULL DEFAULT 'ACTIVE';