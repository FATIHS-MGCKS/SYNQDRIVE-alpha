-- CI-R3B1R.1.1a append-only schema-history bridge (task 1/2): organizations.short_code
-- Idempotent against Production where objects already exist with intended semantics.
-- Fail closed via PostgreSQL catalog authority, not rendered SQL substring matching.

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
DECLARE
  idx_oid oid;
  idx_unique boolean;
  idx_valid boolean;
  idx_ready boolean;
  idx_live boolean;
  idx_am name;
  idx_key_cols name[];
    idx_predicate oid;
    idx_expression oid;
    idx_def text;
BEGIN
  SELECT c.oid
  INTO idx_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'organizations_short_code_key';

  IF idx_oid IS NULL THEN
    CREATE UNIQUE INDEX "organizations_short_code_key" ON "organizations"("short_code");
    RETURN;
  END IF;

  SELECT
    ix.indisunique,
    ix.indisvalid,
    ix.indisready,
    ix.indislive,
    am.amname,
    ARRAY(
      SELECT a.attname
      FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.attnum > 0
      ORDER BY k.ord
    ),
    ix.indpred,
    ix.indexprs,
    pg_get_indexdef(ix.indexrelid)
  INTO
    idx_unique,
    idx_valid,
    idx_ready,
    idx_live,
    idx_am,
    idx_key_cols,
    idx_predicate,
    idx_expression,
    idx_def
  FROM pg_index ix
  JOIN pg_class ic ON ic.oid = ix.indexrelid
  JOIN pg_am am ON am.oid = ic.relam
  WHERE ix.indexrelid = idx_oid;

  IF idx_unique IS DISTINCT FROM TRUE
     OR idx_valid IS DISTINCT FROM TRUE
     OR idx_ready IS DISTINCT FROM TRUE
     OR idx_live IS DISTINCT FROM TRUE
     OR idx_am <> 'btree'
     OR idx_key_cols IS DISTINCT FROM ARRAY['short_code']::name[]
     OR idx_predicate IS NOT NULL
     OR idx_expression IS NOT NULL
     OR idx_def ILIKE '% INCLUDE (%' THEN
    RAISE EXCEPTION 'organizations_short_code_key exists with incompatible catalog semantics';
  END IF;
END $$;
