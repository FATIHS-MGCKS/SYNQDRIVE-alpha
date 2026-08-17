/**
 * Fail-closed exact M252 semantic parity verification for ephemeral recovery.
 */
import { PrismaClient } from '@prisma/client';

const M252_TABLE = 'organization_role_assignment_drift_reconciliation_applications';

const EXPECTED_COLUMNS: Array<{ name: string; dataType: string; nullable: boolean; hasDefault: boolean }> = [
  { name: 'id', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'idempotency_key', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'organization_id', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'membership_id', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'evidence_hash', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'expected_git_commit', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'operator', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'reason', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'classification', dataType: 'text', nullable: false, hasDefault: false },
  { name: 'result', dataType: 'jsonb', nullable: true, hasDefault: false },
  { name: 'created_at', dataType: 'timestamp without time zone', nullable: false, hasDefault: true },
];

const APPROVED = {
  pk: 'org_role_asgn_drift_recon_apps_pkey',
  unique: 'org_role_asgn_drift_recon_apps_idem_key',
  composite: 'org_role_asgn_drift_recon_apps_org_mbr_created_idx',
  fkOrg: 'org_role_asgn_drift_recon_apps_org_id_fkey',
  fkMem: 'org_role_asgn_drift_recon_apps_mbr_id_fkey',
} as const;

type Row = Record<string, unknown>;

function fail(message: string): never {
  console.error(`M252 parity mismatch: ${message}`);
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  const tableRows = await prisma.$queryRaw<Array<{ reg: string | null }>>`
    SELECT to_regclass(${`public.${M252_TABLE}`})::text AS reg
  `;
  if (!tableRows[0]?.reg) {
    fail('table missing');
  }

  const columns = await prisma.$queryRaw<
    Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>
  >`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${M252_TABLE}
    ORDER BY ordinal_position
  `;

  if (columns.length !== EXPECTED_COLUMNS.length) {
    fail(`expected ${EXPECTED_COLUMNS.length} columns, found ${columns.length}`);
  }

  for (const expected of EXPECTED_COLUMNS) {
    const actual = columns.find((c) => c.column_name === expected.name);
    if (!actual) {
      fail(`missing column ${expected.name}`);
    }
    const normalizedType = actual.data_type.toLowerCase();
    if (normalizedType !== expected.dataType) {
      fail(`column ${expected.name} type ${normalizedType} != ${expected.dataType}`);
    }
    const nullable = actual.is_nullable === 'YES';
    if (nullable !== expected.nullable) {
      fail(`column ${expected.name} nullable ${nullable} != ${expected.nullable}`);
    }
    const hasDefault = actual.column_default != null;
    if (hasDefault !== expected.hasDefault) {
      fail(`column ${expected.name} default presence ${hasDefault} != ${expected.hasDefault}`);
    }
  }

  const pk = await prisma.$queryRaw<
    Array<{ conname: string; cols: string; validated: boolean }>
  >`
    SELECT con.conname,
           array_to_string(array(
             SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ), ',') AS cols,
           con.convalidated AS validated
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = ${M252_TABLE} AND con.contype = 'p'
  `;
  if (pk.length !== 1 || pk[0].conname !== APPROVED.pk || pk[0].cols !== 'id' || !pk[0].validated) {
    fail('primary key shape/semantics');
  }

  const indexes = await prisma.$queryRaw<
    Array<{ indexname: string; indexdef: string; indisunique: boolean }>
  >`
    SELECT ic.relname AS indexname,
           pg_get_indexdef(ix.indexrelid) AS indexdef,
           ix.indisunique AS indisunique
    FROM pg_index ix
    JOIN pg_class ic ON ic.oid = ix.indexrelid
    JOIN pg_class tc ON tc.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    WHERE n.nspname = 'public' AND tc.relname = ${M252_TABLE}
  `;

  const byName = new Map(indexes.map((i) => [i.indexname, i]));
  const unique = byName.get(APPROVED.unique);
  if (!unique?.indisunique || !unique.indexdef.includes('(idempotency_key)')) {
    fail('unique index shape');
  }
  const composite = byName.get(APPROVED.composite);
  if (
    composite?.indisunique ||
    !composite?.indexdef.includes('organization_id') ||
    !composite?.indexdef.includes('membership_id') ||
    !composite?.indexdef.includes('created_at')
  ) {
    fail('composite index shape');
  }

  const fks = await prisma.$queryRaw<
    Array<{
      conname: string;
      target_table: string;
      source_cols: string;
      target_cols: string;
      confdeltype: string;
      confupdtype: string;
      validated: boolean;
    }>
  >`
    SELECT con.conname,
           frel.relname AS target_table,
           array_to_string(array(
             SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ), ',') AS source_cols,
           array_to_string(array(
             SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ), ',') AS target_cols,
           con.confdeltype,
           con.confupdtype,
           con.convalidated AS validated
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE nsp.nspname = 'public' AND rel.relname = ${M252_TABLE} AND con.contype = 'f'
  `;

  const fkByName = new Map(fks.map((f) => [f.conname, f]));
  const orgFk = fkByName.get(APPROVED.fkOrg);
  if (
    !orgFk ||
    orgFk.source_cols !== 'organization_id' ||
    orgFk.target_table !== 'organizations' ||
    orgFk.target_cols !== 'id' ||
    orgFk.confdeltype !== 'c' ||
    orgFk.confupdtype !== 'c' ||
    !orgFk.validated
  ) {
    fail('organization FK');
  }
  const memFk = fkByName.get(APPROVED.fkMem);
  if (
    !memFk ||
    memFk.source_cols !== 'membership_id' ||
    memFk.target_table !== 'organization_memberships' ||
    memFk.target_cols !== 'id' ||
    memFk.confdeltype !== 'c' ||
    memFk.confupdtype !== 'c' ||
    !memFk.validated
  ) {
    fail('membership FK');
  }

  const known = new Set<string>([
    APPROVED.pk,
    APPROVED.unique,
    APPROVED.composite,
    APPROVED.fkOrg,
    APPROVED.fkMem,
  ]);
  for (const idx of indexes) {
    if (!known.has(idx.indexname)) {
      fail(`unexpected index ${idx.indexname}`);
    }
  }
  for (const fk of fks) {
    if (!known.has(fk.conname)) {
      fail(`unexpected constraint ${fk.conname}`);
    }
  }

  await prisma.$disconnect();
  console.log('M252 exact semantic parity OK');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
