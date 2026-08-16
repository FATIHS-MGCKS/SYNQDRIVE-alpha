-- CI-R3B1R.1.1a append-only schema-history bridge (task 2/2): DriveType enum + vehicles.drive_type
-- Idempotent against Production where objects already exist with intended semantics.
-- Fail closed via PostgreSQL catalog authority.

DO $$
DECLARE
  labels text[];
  type_kind "char";
  type_namespace name;
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder), t.typtype, n.nspname
  INTO labels, type_kind, type_namespace
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  LEFT JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'DriveType'
  GROUP BY t.oid, t.typtype, n.nspname;

  IF labels IS NULL THEN
    CREATE TYPE "DriveType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');
  ELSIF type_namespace <> 'public'
     OR type_kind <> 'e'
     OR labels IS DISTINCT FROM ARRAY['FWD', 'RWD', 'AWD', 'FOUR_WD']::text[] THEN
    RAISE EXCEPTION 'DriveType enum exists with incompatible catalog semantics';
  END IF;
END $$;

DO $$
DECLARE
  col_type_oid oid;
  col_udt_schema text;
  col_udt_name text;
  col_nullable text;
  col_default text;
BEGIN
  SELECT a.atttypid, c.udt_schema, c.udt_name, c.is_nullable, c.column_default
  INTO col_type_oid, col_udt_schema, col_udt_name, col_nullable, col_default
  FROM information_schema.columns c
  LEFT JOIN pg_attribute a
    ON a.attrelid = to_regclass('public.vehicles')
   AND a.attname = c.column_name
   AND NOT a.attisdropped
  WHERE c.table_schema = 'public'
    AND c.table_name = 'vehicles'
    AND c.column_name = 'drive_type';

  IF col_udt_name IS NULL THEN
    ALTER TABLE "vehicles" ADD COLUMN "drive_type" "DriveType";
    RETURN;
  END IF;

  IF col_udt_schema <> 'public'
     OR col_udt_name <> 'DriveType'
     OR col_nullable <> 'YES'
     OR col_default IS NOT NULL
     OR col_type_oid IS DISTINCT FROM to_regtype('public."DriveType"')::oid THEN
    RAISE EXCEPTION 'vehicles.drive_type exists with incompatible catalog semantics';
  END IF;
END $$;
