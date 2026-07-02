-- Re-assign tables owned by postgres to the application DB role (synqdrive on VPS).
-- Run as postgres superuser after prisma migrate deploy when migrations were applied
-- manually as postgres (e.g. customer_verification_checks, didit_webhook_events).
--
-- Usage (VPS):
--   sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -f backend/scripts/ops/pg-fix-app-table-ownership.sql

DO $$
DECLARE
  app_role name;
  tbl name;
  tables name[] := ARRAY[
    'customer_verification_checks',
    'didit_webhook_events'
  ];
BEGIN
  SELECT tableowner::name
  INTO app_role
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'customers'
  LIMIT 1;

  IF app_role IS NULL OR app_role = 'postgres' THEN
    RAISE NOTICE 'Could not resolve application role from customers table owner; skipping.';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND tableowner <> app_role
    ) THEN
      EXECUTE format('ALTER TABLE public.%I OWNER TO %I', tbl, app_role);
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO %I', tbl, app_role);
      RAISE NOTICE 'Fixed ownership for %', tbl;
    END IF;
  END LOOP;
END $$;
