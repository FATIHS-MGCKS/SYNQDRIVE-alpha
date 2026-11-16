-- P2-PR1: extend governed ProductSlug catalog with VYMOD (additive; TAXI retained).
-- Catalog row is inserted in the follow-up migration (enum value must commit first).
ALTER TYPE "ProductSlug" ADD VALUE IF NOT EXISTS 'VYMOD';