-- CI-R3B1R.1.1b append-only schema-history bridge (task 1/2): public.organizations.short_code
-- Explicit public qualification; no search_path dependency.
-- Fail closed via PostgreSQL catalog authority (full index semantics).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'short_code'
  ) THEN
    ALTER TABLE public."organizations" ADD COLUMN "short_code" TEXT;
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
    RAISE EXCEPTION 'public.organizations.short_code exists with incompatible semantics';
  END IF;
END $$;

DO $$
DECLARE
  idx_oid oid;
  v_index_schema name;
  v_index_table name;
  v_index_name name;
  v_relkind "char";
  v_access_method name;
  v_unique boolean;
  v_primary boolean;
  v_valid boolean;
  v_ready boolean;
  v_live boolean;
  v_immediate boolean;
  v_nulls_not_distinct boolean;
  v_key_attribute_count int2;
  v_total_attribute_count int2;
  v_ordered_key_columns name[];
  v_include_columns name[];
  v_collation_names text[];
  v_opclass_names text[];
  v_indoption int2vector;
  v_predicate oid;
  v_expression oid;
BEGIN
  SELECT idx.oid
  INTO idx_oid
  FROM pg_class idx
  JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
  WHERE idx_ns.nspname = 'public'
    AND idx.relname = 'organizations_short_code_key'
    AND idx.relkind = 'i';

  IF idx_oid IS NULL THEN
    CREATE UNIQUE INDEX "organizations_short_code_key"
      ON public."organizations"("short_code");
    RETURN;
  END IF;

  SELECT
    idx_ns.nspname,
    tbl.relname,
    idx.relname,
    idx.relkind,
    am.amname,
    ix.indisunique,
    ix.indisprimary,
    ix.indisvalid,
    ix.indisready,
    ix.indislive,
    ix.indimmediate,
    COALESCE(ix.indnullsnotdistinct, false),
    ix.indnkeyatts,
    ix.indnatts,
    (
      SELECT array_agg(a.attname ORDER BY k.ord)
      FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.attnum > 0
    ),
    (
      SELECT COALESCE(array_agg(a.attname ORDER BY a.attname), ARRAY[]::name[])
      FROM unnest(ix.indkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = (-k.attnum)
      WHERE k.attnum < 0
    ),
    (
      SELECT array_agg(
        CASE
          WHEN keys.coll_oid = 0 THEN 'default'
          ELSE COALESCE(cns.nspname || '.' || c.collname, keys.coll_oid::text)
        END ORDER BY keys.ord
      )
      FROM (
        SELECT k.attnum, k.coll_oid, k.ord
        FROM unnest(ix.indkey, ix.indcollation) WITH ORDINALITY AS k(attnum, coll_oid, ord)
        WHERE k.attnum > 0
      ) keys
      LEFT JOIN pg_collation c ON c.oid = keys.coll_oid
      LEFT JOIN pg_namespace cns ON cns.oid = c.collnamespace
    ),
    (
      SELECT array_agg(COALESCE(opc_ns.nspname || '.' || opc.opcname, keys.opc_oid::text) ORDER BY keys.ord)
      FROM (
        SELECT k.attnum, k.opc_oid, k.ord
        FROM unnest(ix.indkey, ix.indclass) WITH ORDINALITY AS k(attnum, opc_oid, ord)
        WHERE k.attnum > 0
      ) keys
      JOIN pg_opclass opc ON opc.oid = keys.opc_oid
      JOIN pg_namespace opc_ns ON opc_ns.oid = opc.opcnamespace
    ),
    ix.indoption,
    ix.indpred,
    ix.indexprs
  INTO
    v_index_schema,
    v_index_table,
    v_index_name,
    v_relkind,
    v_access_method,
    v_unique,
    v_primary,
    v_valid,
    v_ready,
    v_live,
    v_immediate,
    v_nulls_not_distinct,
    v_key_attribute_count,
    v_total_attribute_count,
    v_ordered_key_columns,
    v_include_columns,
    v_collation_names,
    v_opclass_names,
    v_indoption,
    v_predicate,
    v_expression
  FROM pg_index ix
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
  JOIN pg_class tbl ON tbl.oid = ix.indrelid
  JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
  JOIN pg_am am ON am.oid = idx.relam
  WHERE ix.indexrelid = idx_oid
    AND tbl_ns.nspname = 'public'
    AND tbl.relname = 'organizations';

  IF v_index_schema <> 'public'
     OR v_index_table <> 'organizations'
     OR v_index_name <> 'organizations_short_code_key'
     OR v_relkind <> 'i'
     OR v_access_method <> 'btree'
     OR v_unique IS DISTINCT FROM TRUE
     OR v_primary IS DISTINCT FROM FALSE
     OR v_valid IS DISTINCT FROM TRUE
     OR v_ready IS DISTINCT FROM TRUE
     OR v_live IS DISTINCT FROM TRUE
     OR v_immediate IS DISTINCT FROM TRUE
     OR v_nulls_not_distinct IS DISTINCT FROM FALSE
     OR v_key_attribute_count <> 1
     OR v_total_attribute_count <> 1
     OR v_ordered_key_columns IS DISTINCT FROM ARRAY['short_code']::name[]
     OR v_include_columns IS DISTINCT FROM ARRAY[]::name[]
     OR v_collation_names IS DISTINCT FROM ARRAY['pg_catalog.default']::text[]
     OR v_opclass_names IS DISTINCT FROM ARRAY['pg_catalog.text_ops']::text[]
     OR v_indoption::text <> '0'
     OR v_predicate IS NOT NULL
     OR v_expression IS NOT NULL THEN
    RAISE EXCEPTION 'public.organizations_short_code_key exists with incompatible catalog semantics';
  END IF;
END $$;
