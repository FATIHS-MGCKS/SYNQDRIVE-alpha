-- EXP021 near-real-time settlement: relax eligible_at CHECK so new 600s quiet-period rows
-- validate while legacy rows (anchor + 24h) remain valid. No backfill of existing work items.

ALTER TABLE "di_v0_s4_work_items" DROP CONSTRAINT IF EXISTS "di_v0_s4_wi_eligible_ck";

ALTER TABLE "di_v0_s4_work_items" ADD CONSTRAINT "di_v0_s4_wi_eligible_ck" CHECK (
  "eligible_at" >= "settlement_anchor_at"
  AND "eligible_at" <= "settlement_anchor_at" + interval '24 hours'
);
