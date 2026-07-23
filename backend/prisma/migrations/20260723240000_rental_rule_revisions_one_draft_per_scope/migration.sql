-- Prevent concurrent DRAFT revision forks per rental rule scope (P2-RR-DRAFT-FORK)
CREATE UNIQUE INDEX IF NOT EXISTS "rental_rule_revisions_one_draft_per_scope_idx"
  ON "rental_rule_revisions" ("organization_id", "scope_type", "scope_id")
  WHERE "status" = 'DRAFT';
