/**
 * Canonical catalog semantics for pending schema-history bridge objects.
 * Shared by migration guard expectations (mirrored in SQL) and verifier authority.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

export type ShortCodeIndexSemantics = {
  index_schema: string;
  index_table: string;
  index_name: string;
  relkind: string;
  access_method: string;
  unique: boolean;
  primary: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  immediate: boolean;
  nulls_not_distinct: boolean;
  key_attribute_count: number;
  total_attribute_count: number;
  ordered_key_columns: string[];
  include_columns: string[];
  collation_names: string[];
  opclass_names: string[];
  indoption: string;
  predicate: boolean;
  expression: boolean;
};

export const CANONICAL_SHORT_CODE_INDEX: ShortCodeIndexSemantics = {
  index_schema: 'public',
  index_table: 'organizations',
  index_name: 'organizations_short_code_key',
  relkind: 'i',
  access_method: 'btree',
  unique: true,
  primary: false,
  valid: true,
  ready: true,
  live: true,
  immediate: true,
  nulls_not_distinct: false,
  key_attribute_count: 1,
  total_attribute_count: 1,
  ordered_key_columns: ['short_code'],
  include_columns: [],
  collation_names: ['pg_catalog.default'],
  opclass_names: ['pg_catalog.text_ops'],
  indoption: '0',
  predicate: false,
  expression: false,
};

export const CANONICAL_DRIVE_TYPE = {
  schema: 'public',
  name: 'DriveType',
  kind: 'e',
  labels: ['FWD', 'RWD', 'AWD', 'FOUR_WD'],
} as const;

export const SHORT_CODE_INDEX_SEMANTICS_SQL = readFileSync(
  join(__dirname, 'sql', 'history-bridge-short-code-index-semantics.sql'),
  'utf8',
);

function fail(label: string, message: string): never {
  console.error(`${label} parity mismatch: ${message}`);
  process.exit(1);
}

function arraysEqual(a: string[] | null | undefined, b: string[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b);
}

export function assertShortCodeIndexSemantics(
  actual: ShortCodeIndexSemantics,
  label = 'short_code_index',
): void {
  const expected = CANONICAL_SHORT_CODE_INDEX;
  const checks: Array<[string, unknown, unknown]> = [
    ['index_schema', actual.index_schema, expected.index_schema],
    ['index_table', actual.index_table, expected.index_table],
    ['index_name', actual.index_name, expected.index_name],
    ['relkind', actual.relkind, expected.relkind],
    ['access_method', actual.access_method, expected.access_method],
    ['unique', actual.unique, expected.unique],
    ['primary', actual.primary, expected.primary],
    ['valid', actual.valid, expected.valid],
    ['ready', actual.ready, expected.ready],
    ['live', actual.live, expected.live],
    ['immediate', actual.immediate, expected.immediate],
    ['nulls_not_distinct', actual.nulls_not_distinct, expected.nulls_not_distinct],
    ['key_attribute_count', actual.key_attribute_count, expected.key_attribute_count],
    ['total_attribute_count', actual.total_attribute_count, expected.total_attribute_count],
    ['ordered_key_columns', actual.ordered_key_columns, expected.ordered_key_columns],
    ['include_columns', actual.include_columns, expected.include_columns],
    ['collation_names', actual.collation_names, expected.collation_names],
    ['opclass_names', actual.opclass_names, expected.opclass_names],
    ['indoption', actual.indoption, expected.indoption],
    ['predicate', actual.predicate, expected.predicate],
    ['expression', actual.expression, expected.expression],
  ];

  for (const [field, got, want] of checks) {
    if (Array.isArray(want)) {
      if (!arraysEqual(got as string[], want as string[])) {
        fail(label, `${field}: got ${JSON.stringify(got)} expected ${JSON.stringify(want)}`);
      }
    } else if (got !== want) {
      fail(label, `${field}: got ${JSON.stringify(got)} expected ${JSON.stringify(want)}`);
    }
  }
}

export async function queryShortCodeIndexSemantics(
  prisma: PrismaClient,
): Promise<ShortCodeIndexSemantics | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ row_to_json: ShortCodeIndexSemantics }>>(
    SHORT_CODE_INDEX_SEMANTICS_SQL,
  );
  return rows[0]?.row_to_json ?? null;
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

  const index = await queryShortCodeIndexSemantics(prisma);
  if (!index) {
    fail('short_code', 'unique index missing');
  }
  assertShortCodeIndexSemantics(index);
}

export async function verifyDriveTypeExactSemantics(prisma: PrismaClient): Promise<void> {
  const enums = await prisma.$queryRaw<
    Array<{ nspname: string; typtype: string; labels: string[] | null }>
  >`
    SELECT n.nspname, t.typtype::text AS typtype, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'DriveType'
    GROUP BY t.oid, n.nspname, t.typtype
  `;
  if (enums.length !== 1) {
    fail('DriveType', 'public.DriveType enum missing or ambiguous');
  }
  const en = enums[0];
  if (
    en.nspname !== CANONICAL_DRIVE_TYPE.schema ||
    en.typtype !== CANONICAL_DRIVE_TYPE.kind ||
    JSON.stringify(en.labels) !== JSON.stringify(CANONICAL_DRIVE_TYPE.labels)
  ) {
    fail('DriveType', 'enum catalog semantics');
  }

  const sameNameElsewhere = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DriveType'
      AND n.nspname <> 'public'
  `;
  if (Number(sameNameElsewhere[0]?.count ?? 0) > 0) {
    // Ambiguous typname elsewhere must not satisfy authority; public identity is explicit.
    const publicOnly = enums.length === 1 && enums[0].nspname === 'public';
    if (!publicOnly) {
      fail('DriveType', 'same-named type ambiguity without explicit public authority');
    }
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

export async function verifyAllBridgeSemantics(prisma: PrismaClient): Promise<void> {
  await verifyShortCodeExactSemantics(prisma);
  await verifyDriveTypeExactSemantics(prisma);
}
