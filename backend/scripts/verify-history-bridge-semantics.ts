/**
 * Fail-closed exact semantic verification for pending schema-history bridge objects.
 */
import { PrismaClient } from '@prisma/client';

function fail(label: string, message: string): never {
  console.error(`${label} parity mismatch: ${message}`);
  process.exit(1);
}

export async function verifyShortCodeExactSemantics(prisma: PrismaClient): Promise<void> {
  const column = await prisma.$queryRaw<
    Array<{ data_type: string; is_nullable: string; column_default: string | null }>
  >`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'short_code'
  `;
  if (column.length !== 1) {
    fail('short_code', 'column missing');
  }
  const col = column[0];
  if (col.data_type !== 'text' || col.is_nullable !== 'YES' || col.column_default != null) {
    fail('short_code', 'column semantics');
  }

  const indexes = await prisma.$queryRaw<
    Array<{
      indexname: string;
      indisunique: boolean;
      indisvalid: boolean;
      indisready: boolean;
      indislive: boolean;
      amname: string;
      key_cols: string[] | null;
      has_predicate: boolean;
      has_expression: boolean;
      has_include: boolean;
    }>
  >`
    SELECT
      ic.relname AS indexname,
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
      ) AS key_cols,
      ix.indpred IS NOT NULL AS has_predicate,
      ix.indexprs IS NOT NULL AS has_expression,
      pg_get_indexdef(ix.indexrelid) ILIKE '% INCLUDE (%' AS has_include
    FROM pg_index ix
    JOIN pg_class ic ON ic.oid = ix.indexrelid
    JOIN pg_class tc ON tc.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    JOIN pg_am am ON am.oid = ic.relam
    WHERE n.nspname = 'public'
      AND tc.relname = 'organizations'
      AND ic.relname = 'organizations_short_code_key'
  `;

  if (indexes.length !== 1) {
    fail('short_code', 'unique index missing');
  }
  const idx = indexes[0];
  if (
    !idx.indisunique ||
    !idx.indisvalid ||
    !idx.indisready ||
    !idx.indislive ||
    idx.amname !== 'btree' ||
    JSON.stringify(idx.key_cols) !== JSON.stringify(['short_code']) ||
    idx.has_predicate ||
    idx.has_expression ||
    idx.has_include
  ) {
    fail('short_code', 'unique index catalog semantics');
  }
}

export async function verifyDriveTypeExactSemantics(prisma: PrismaClient): Promise<void> {
  const enums = await prisma.$queryRaw<
    Array<{ nspname: string; typtype: string; labels: string[] | null }>
  >`
    SELECT n.nspname, t.typtype::text AS typtype, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DriveType'
    GROUP BY t.oid, n.nspname, t.typtype
  `;
  if (enums.length !== 1) {
    fail('DriveType', 'enum missing');
  }
  const en = enums[0];
  if (
    en.nspname !== 'public' ||
    en.typtype !== 'e' ||
    JSON.stringify(en.labels) !== JSON.stringify(['FWD', 'RWD', 'AWD', 'FOUR_WD'])
  ) {
    fail('DriveType', 'enum catalog semantics');
  }

  const columns = await prisma.$queryRaw<
    Array<{
      udt_schema: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      atttypid: string | null;
      expected_typid: string | null;
    }>
  >`
    SELECT
      c.udt_schema,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      a.atttypid::text AS atttypid,
      to_regtype('public."DriveType"')::oid::text AS expected_typid
    FROM information_schema.columns c
    LEFT JOIN pg_attribute a
      ON a.attrelid = to_regclass('public.vehicles')
     AND a.attname = c.column_name
     AND NOT a.attisdropped
    WHERE c.table_schema = 'public'
      AND c.table_name = 'vehicles'
      AND c.column_name = 'drive_type'
  `;
  if (columns.length !== 1) {
    fail('drive_type', 'column missing');
  }
  const col = columns[0];
  if (
    col.udt_schema !== 'public' ||
    col.udt_name !== 'DriveType' ||
    col.is_nullable !== 'YES' ||
    col.column_default != null ||
    col.atttypid !== col.expected_typid
  ) {
    fail('drive_type', 'column catalog semantics');
  }
}

async function main() {
  const target = process.argv[2] ?? 'all';
  const prisma = new PrismaClient();
  if (target === 'short_code' || target === 'all') {
    await verifyShortCodeExactSemantics(prisma);
    console.log('short_code exact semantic parity OK');
  }
  if (target === 'drive_type' || target === 'all') {
    await verifyDriveTypeExactSemantics(prisma);
    console.log('drive_type exact semantic parity OK');
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
