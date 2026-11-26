-- Minimal product catalog rows for P1 metadata PATCH Postgres integration (disposable DB only).
-- Idempotent: safe to run after prisma migrate deploy.

INSERT INTO "products" ("id", "slug", "name", "description", "created_at", "catalog_status")
SELECT gen_random_uuid(), 'RENTAL'::"ProductSlug", 'SynqDrive Rental', 'Vehicle rental management module', NOW(), 'ACTIVE'::"ProductCatalogStatus"
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "slug" = 'RENTAL'::"ProductSlug");

INSERT INTO "products" ("id", "slug", "name", "description", "created_at", "catalog_status")
SELECT gen_random_uuid(), 'FLEET'::"ProductSlug", 'SynqDrive Fleet', 'Fleet management & tracking module', NOW(), 'ACTIVE'::"ProductCatalogStatus"
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "slug" = 'FLEET'::"ProductSlug");

INSERT INTO "products" ("id", "slug", "name", "description", "created_at", "catalog_status")
SELECT gen_random_uuid(), 'VYMOD'::"ProductSlug", 'SynqDrive VYMOD', 'Vehicle identity and mobility product module', NOW(), 'ACTIVE'::"ProductCatalogStatus"
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "slug" = 'VYMOD'::"ProductSlug");