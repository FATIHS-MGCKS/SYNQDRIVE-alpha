-- Canonical catalog semantics for public.organizations_short_code_key
SELECT row_to_json(t) FROM (
  SELECT
    idx_ns.nspname AS index_schema,
    tbl.relname AS index_table,
    idx.relname AS index_name,
    idx.relkind AS relkind,
    am.amname AS access_method,
    ix.indisunique AS "unique",
    ix.indisprimary AS "primary",
    ix.indisvalid AS valid,
    ix.indisready AS ready,
    ix.indislive AS live,
    ix.indimmediate AS immediate,
    COALESCE(ix.indnullsnotdistinct, false) AS nulls_not_distinct,
    ix.indnkeyatts AS key_attribute_count,
    ix.indnatts AS total_attribute_count,
    (
      SELECT array_agg(a.attname ORDER BY k.ord)
      FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE k.attnum > 0
    ) AS ordered_key_columns,
    (
      SELECT COALESCE(array_agg(a.attname ORDER BY a.attname), ARRAY[]::name[])
      FROM unnest(ix.indkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = (-k.attnum)
      WHERE k.attnum < 0
    ) AS include_columns,
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
    ) AS collation_names,
    (
      SELECT array_agg(COALESCE(opc_ns.nspname || '.' || opc.opcname, keys.opc_oid::text) ORDER BY keys.ord)
      FROM (
        SELECT k.attnum, k.opc_oid, k.ord
        FROM unnest(ix.indkey, ix.indclass) WITH ORDINALITY AS k(attnum, opc_oid, ord)
        WHERE k.attnum > 0
      ) keys
      JOIN pg_opclass opc ON opc.oid = keys.opc_oid
      JOIN pg_namespace opc_ns ON opc_ns.oid = opc.opcnamespace
    ) AS opclass_names,
    ix.indoption::text AS indoption,
    (ix.indpred IS NOT NULL) AS predicate,
    (ix.indexprs IS NOT NULL) AS expression
  FROM pg_index ix
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
  JOIN pg_class tbl ON tbl.oid = ix.indrelid
  JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
  JOIN pg_am am ON am.oid = idx.relam
  WHERE tbl_ns.nspname = 'public'
    AND tbl.relname = 'organizations'
    AND idx.relname = 'organizations_short_code_key'
) t;
