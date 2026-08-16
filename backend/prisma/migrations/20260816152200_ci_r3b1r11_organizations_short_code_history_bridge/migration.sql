-- CI-R3B1R.1.1 append-only schema-history bridge: organizations.short_code
-- Idempotent against Production where the column/index already exist with intended semantics.
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
