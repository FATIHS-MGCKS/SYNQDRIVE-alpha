-- Allow closing effective_to when superseding a published ACTIVE price version (ARCHIVED).
-- publishVersion() archives the prior ACTIVE row with effective_to := transition instant;
-- the original trigger required effective_to unchanged, causing 23506 and rolled-back publish.

CREATE OR REPLACE FUNCTION billing_guard_published_price_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'ACTIVE' AND OLD."published_at" IS NOT NULL THEN
      IF NEW."status" = 'ARCHIVED'
         AND NEW."version_number" = OLD."version_number"
         AND NEW."version_label" IS NOT DISTINCT FROM OLD."version_label"
         AND NEW."price_book_id" = OLD."price_book_id"
         AND NEW."effective_from" IS NOT DISTINCT FROM OLD."effective_from"
         AND NEW."tier_mode" = OLD."tier_mode"
         AND NEW."published_at" IS NOT DISTINCT FROM OLD."published_at"
         AND NEW."published_by_user_id" IS NOT DISTINCT FROM OLD."published_by_user_id"
         AND NEW."created_by_user_id" IS NOT DISTINCT FROM OLD."created_by_user_id"
         AND (
           NEW."effective_to" IS NOT DISTINCT FROM OLD."effective_to"
           OR (
             OLD."effective_to" IS NULL
             AND NEW."effective_to" IS NOT NULL
           )
         )
      THEN
        RETURN NEW;
      END IF;
      -- Scheduled supersede: close prior ACTIVE contract window without archiving before transition.
      IF NEW."status" = 'ACTIVE'
         AND NEW."version_number" = OLD."version_number"
         AND NEW."version_label" IS NOT DISTINCT FROM OLD."version_label"
         AND NEW."price_book_id" = OLD."price_book_id"
         AND NEW."effective_from" IS NOT DISTINCT FROM OLD."effective_from"
         AND NEW."tier_mode" = OLD."tier_mode"
         AND NEW."published_at" IS NOT DISTINCT FROM OLD."published_at"
         AND NEW."published_by_user_id" IS NOT DISTINCT FROM OLD."published_by_user_id"
         AND NEW."created_by_user_id" IS NOT DISTINCT FROM OLD."created_by_user_id"
         AND (
           NEW."effective_to" IS NOT DISTINCT FROM OLD."effective_to"
           OR (
             OLD."effective_to" IS NULL
             AND NEW."effective_to" IS NOT NULL
           )
         )
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Published billing price version % is immutable', OLD."id"
        USING ERRCODE = '23506';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ACTIVE' AND OLD."published_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Published billing price version % cannot be deleted', OLD."id"
        USING ERRCODE = '23506';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;