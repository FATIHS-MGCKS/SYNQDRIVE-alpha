-- PR #1290 targeted drift validation for subset smoke DB.
-- Full prisma migrate diff is N/A (321-migration chain fails on CONCURRENTLY in txn).

\set ON_ERROR_STOP on

DO $$
DECLARE
  src_nullable text;
  dimo_exists boolean;
  fk_def text;
  check_def text;
  partial_unique text;
BEGIN
  SELECT is_nullable INTO src_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vehicle_data_source_links'
    AND column_name = 'source_reference_id';

  IF src_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'DRIFT: source_reference_id expected nullable, got %', src_nullable;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_data_source_links'
      AND column_name = 'dimo_vehicle_id'
      AND data_type = 'text'
      AND is_nullable = 'YES'
  ) INTO dimo_exists;

  IF NOT dimo_exists THEN
    RAISE EXCEPTION 'DRIFT: dimo_vehicle_id column missing or wrong type/nullability';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO fk_def
  FROM pg_constraint
  WHERE conrelid = 'vehicle_data_source_links'::regclass
    AND conname = 'vehicle_data_source_links_dimo_vehicle_id_fkey';

  IF fk_def IS NULL OR fk_def NOT ILIKE '%REFERENCES dimo_vehicles(id)%' THEN
    RAISE EXCEPTION 'DRIFT: dimo_vehicle_id FK missing/wrong: %', fk_def;
  END IF;

  IF fk_def NOT ILIKE '%ON DELETE RESTRICT%' OR fk_def NOT ILIKE '%ON UPDATE CASCADE%' THEN
    RAISE EXCEPTION 'DRIFT: dimo_vehicle_id FK actions wrong: %', fk_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO check_def
  FROM pg_constraint
  WHERE conrelid = 'vehicle_data_source_links'::regclass
    AND conname = 'vehicle_data_source_links_provider_reference_check';

  IF check_def IS NULL THEN
    RAISE EXCEPTION 'DRIFT: provider_reference CHECK missing';
  END IF;

  SELECT indexdef INTO partial_unique
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'vehicle_data_source_links'
    AND indexname = 'uq_vdsl_active_dimo_vehicle';

  IF partial_unique IS NULL OR partial_unique NOT ILIKE '%WHERE%' THEN
    RAISE EXCEPTION 'DRIFT: partial unique index uq_vdsl_active_dimo_vehicle missing';
  END IF;

  RAISE NOTICE 'TARGETED_DRIFT_CHECK_PASS';
END $$;
