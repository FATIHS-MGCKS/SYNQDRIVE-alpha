-- P2-PR1: canonical products row for VYMOD (idempotent; no org assignment).
INSERT INTO "products" ("id", "slug", "name", "description", "created_at")
SELECT gen_random_uuid(), 'VYMOD'::"ProductSlug", 'SynqDrive VYMOD', 'Vehicle identity and mobility product module', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "products" WHERE "slug" = 'VYMOD'::"ProductSlug"
);