-- Additive: optional required-flag per checklist item (default false — no backfill).
ALTER TABLE "task_checklist_items"
  ADD COLUMN "is_required" BOOLEAN NOT NULL DEFAULT false;
