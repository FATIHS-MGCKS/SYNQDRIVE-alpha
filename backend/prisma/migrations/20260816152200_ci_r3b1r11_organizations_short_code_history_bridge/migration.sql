-- CI-R3B1R.1.1 append-only schema-history bridge: organizations.short_code + vehicles.drive_type
-- Idempotent against Production where objects already exist with intended semantics.
-- Fail closed when an existing object has incompatible shape.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'short_code'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "short_code" TEXT;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'short_code'
      AND (
        data_type <> 'text'
        OR is_nullable <> 'YES'
        OR column_default IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'organizations.short_code exists with incompatible semantics';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND indexname = 'organizations_short_code_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'organizations'
        AND indexname = 'organizations_short_code_key'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%(short_code)%'
    ) THEN
      RAISE EXCEPTION 'organizations_short_code_key exists with incompatible semantics';
    END IF;
  ELSE
    CREATE UNIQUE INDEX "organizations_short_code_key" ON "organizations"("short_code");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriveType') THEN
    CREATE TYPE "DriveType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'drive_type'
  ) THEN
    ALTER TABLE "vehicles" ADD COLUMN "drive_type" "DriveType";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'drive_type'
      AND (is_nullable <> 'YES' OR udt_name <> 'DriveType')
  ) THEN
    RAISE EXCEPTION 'vehicles.drive_type exists with incompatible semantics';
  END IF;
END $$;
