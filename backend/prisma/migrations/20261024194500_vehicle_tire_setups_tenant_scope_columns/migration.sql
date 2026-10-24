-- vehicle_tire_setups.organization_id: required by tire_trip_usage_ledger_scope_guard (20260716210000).
-- is_staggered: Prisma schema field missing from historical migration chain.
-- Idempotent + fail-closed: safe on fresh DB and when objects already exist (production drift).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_tire_setups'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public."vehicle_tire_setups" ADD COLUMN "organization_id" TEXT;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_tire_setups'
      AND column_name = 'organization_id'
      AND (
        data_type <> 'text'
        OR is_nullable <> 'YES'
        OR column_default IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'public.vehicle_tire_setups.organization_id exists with incompatible semantics';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_tire_setups'
      AND column_name = 'is_staggered'
  ) THEN
    ALTER TABLE public."vehicle_tire_setups"
      ADD COLUMN "is_staggered" BOOLEAN NOT NULL DEFAULT false;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND c.relname = 'vehicle_tire_setups'
      AND a.attname = 'is_staggered'
      AND NOT a.attisdropped
      AND a.attnum > 0
      AND (
        format_type(a.atttypid, a.atttypmod) <> 'boolean'
        OR NOT a.attnotnull
        OR COALESCE(btrim(pg_get_expr(ad.adbin, ad.adrelid)), '') <> 'false'
      )
  ) THEN
    RAISE EXCEPTION 'public.vehicle_tire_setups.is_staggered exists with incompatible semantics';
  END IF;
END $$;

DO $$
DECLARE
  idx_oid oid;
  v_ordered_key_columns name[];
  v_unique boolean;
  v_access_method name;
BEGIN
  SELECT idx.oid
  INTO idx_oid
  FROM pg_class idx
  JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
  WHERE idx_ns.nspname = 'public'
    AND idx.relname = 'vehicle_tire_setups_organization_id_vehicle_id_idx'
    AND idx.relkind = 'i';

  IF idx_oid IS NULL THEN
    CREATE INDEX "vehicle_tire_setups_organization_id_vehicle_id_idx"
      ON public."vehicle_tire_setups"("organization_id", "vehicle_id");
    RETURN;
  END IF;

  SELECT
    ix.indisunique,
    am.amname,
    (
      SELECT array_agg(a.attname ORDER BY k.ord)
      FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.attnum > 0
    )
  INTO v_unique, v_access_method, v_ordered_key_columns
  FROM pg_index ix
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_am am ON am.oid = idx.relam
  WHERE ix.indexrelid = idx_oid;

  IF v_access_method <> 'btree'
     OR v_unique IS DISTINCT FROM FALSE
     OR v_ordered_key_columns IS DISTINCT FROM ARRAY['organization_id', 'vehicle_id']::name[] THEN
    RAISE EXCEPTION 'public.vehicle_tire_setups_organization_id_vehicle_id_idx exists with incompatible catalog semantics';
  END IF;
END $$;
