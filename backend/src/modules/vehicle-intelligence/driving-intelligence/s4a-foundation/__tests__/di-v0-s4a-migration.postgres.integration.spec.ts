import { spawn } from 'child_process';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  REPO_ROOT,
  assertS4aPostgresCiEnv,
  deferred,
  seedS4aTenant,
  waitForLockWaiters,
  type S4aTenant,
} from './di-v0-s4a-postgres-harness';

assertS4aPostgresCiEnv();

/**
 * S4A migration behaviour on disposable clones of a pre-S4A template database
 * (`bash backend/scripts/test/di-v0-s4a-postgres-bootstrap.sh` prints the required env).
 */
const LIVE =
  process.env.DI_V0_S4A_POSTGRES_INTEGRATION === '1' &&
  !!process.env.DI_V0_S4A_PG_ADMIN_URL &&
  !!process.env.DI_V0_S4A_PG_TEMPLATE_DB;

const MIGRATION_NAME = '20260927200000_di_v0_s4a_dormant_foundation';
const MIGRATION_FILE = path.join(REPO_ROOT, 'backend/prisma/migrations', MIGRATION_NAME, 'migration.sql');
const S4B_MIGRATION_NAME = '20260928120000_di_v0_s4b_boundary_occurrence_and_execution_v2';
const S4B_MIGRATION_FILE = path.join(REPO_ROOT, 'backend/prisma/migrations', S4B_MIGRATION_NAME, 'migration.sql');
const S4_TABLES = ['di_v0_s4_control', 'di_v0_s4_evidence_snapshots', 'di_v0_s4_pipeline_versions', 'di_v0_s4_work_items'];
const S2_TABLES = ['di_v0_shadow_intervals', 'di_v0_shadow_runs'];

interface ProcessResult {
  code: number | null;
  output: string;
  elapsedMs: number;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<ProcessResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.join(REPO_ROOT, 'backend'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output, elapsedMs: Date.now() - started }));
  });
}

function dbUrl(db: string, prisma: boolean): string {
  const url = new URL(process.env.DI_V0_S4A_PG_ADMIN_URL as string);
  url.pathname = `/${db}`;
  url.search = prisma ? '?schema=public' : '';
  return url.toString();
}

interface Clone {
  name: string;
  prisma: PrismaClient;
  applyWithPsql(file?: string): Promise<ProcessResult>;
  applyWithPrisma(): Promise<ProcessResult>;
}

interface CatalogSnapshot {
  tables: Record<string, { relfilenode: number; rowsHash: string }>;
  triggers: string[];
  indexes: string[];
  constraints: string[];
  functions: string[];
}

async function catalogSnapshot(prisma: PrismaClient): Promise<CatalogSnapshot> {
  const tables = await prisma.$queryRaw<Array<{ relname: string; relfilenode: number }>>`
    SELECT c.relname, c.relfilenode::int AS relfilenode FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`;
  const out: CatalogSnapshot = { tables: {}, triggers: [], indexes: [], constraints: [], functions: [] };
  for (const { relname, relfilenode } of tables) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ h: string }>>(
      `SELECT md5(coalesce(string_agg(t.xmin::text || ':' || t::text, '|' ORDER BY t::text), '')) AS h FROM "${relname}" t`,
    );
    out.tables[relname] = { relfilenode, rowsHash: row.h };
  }
  out.triggers = (
    await prisma.$queryRaw<Array<{ n: string }>>`
      SELECT c.relname || '.' || t.tgname AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1`
  ).map((r) => r.n);
  out.indexes = (
    await prisma.$queryRaw<Array<{ n: string }>>`
      SELECT tablename || '.' || indexname AS n FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`
  ).map((r) => r.n);
  out.constraints = (
    await prisma.$queryRaw<Array<{ n: string }>>`
      SELECT c.relname || '.' || k.conname AS n FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' ORDER BY 1`
  ).map((r) => r.n);
  out.functions = (
    await prisma.$queryRaw<Array<{ n: string }>>`
      SELECT p.proname AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' ORDER BY 1`
  ).map((r) => r.n);
  return out;
}

const diff = (before: string[], after: string[]) => ({
  added: after.filter((x) => !before.includes(x)),
  removed: before.filter((x) => !after.includes(x)),
});

async function s4TablesPresent(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'di_v0_s4_%' ORDER BY tablename`;
  return rows.map((r) => r.tablename);
}

async function insertShadowRun(prisma: PrismaClient, tenant: S4aTenant, organizationId = tenant.organizationId): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO di_v0_shadow_runs (id, organization_id, vehicle_id, trip_id, source_family, structural_version,
      estimator_version, calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, updated_at)
    VALUES (${id}, ${organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'RUPTELA_R1', 'S', 'E', 'C', 'P', 'IEV',
      ${randomUUID()}, now())`;
  return id;
}

(LIVE ? describe : describe.skip)('DI V0 S4A migration (DI_V0_S4A_POSTGRES_INTEGRATION=1, pre-S4A template clones)', () => {
  jest.setTimeout(180_000);
  const admin = LIVE ? new PrismaClient({ datasources: { db: { url: process.env.DI_V0_S4A_PG_ADMIN_URL } } }) : null!;
  const clones: Clone[] = [];
  const extraClients: PrismaClient[] = [];

  async function freshClone(): Promise<Clone> {
    const name = `${process.env.DI_V0_S4A_PG_TEMPLATE_DB}_m_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${process.env.DI_V0_S4A_PG_TEMPLATE_DB}"`);
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl(name, true) } } });
    const clone: Clone = {
      name,
      prisma,
      applyWithPsql: (file = MIGRATION_FILE) => run('psql', [dbUrl(name, false), '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]),
      applyWithPrisma: () => run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: dbUrl(name, true) }),
    };
    clones.push(clone);
    return clone;
  }

  function client(name: string): PrismaClient {
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl(name, true) } } });
    extraClients.push(prisma);
    return prisma;
  }

  afterAll(async () => {
    if (!LIVE) return;
    for (const c of extraClients) await c.$disconnect();
    for (const clone of clones) {
      await clone.prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${clone.name}" WITH (FORCE)`);
    }
    await admin.$disconnect();
  });

  it('template is pre-S4A with empty S2 tables', async () => {
    const clone = await freshClone();
    expect(await s4TablesPresent(clone.prisma)).toEqual([]);
    const [{ n }] = await clone.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM _prisma_migrations WHERE migration_name = ${MIGRATION_NAME}`;
    expect(Number(n)).toBe(0);
  });

  it('M01 empty S2: applies, creates exactly the S4 objects and seeds nothing', async () => {
    const clone = await freshClone();
    const result = await clone.applyWithPsql();
    expect({ code: result.code, output: result.output }).toEqual({ code: 0, output: '' });
    expect(await s4TablesPresent(clone.prisma)).toEqual(S4_TABLES);
    for (const table of [...S4_TABLES, ...S2_TABLES]) {
      const [{ n }] = await clone.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      expect({ table, rows: Number(n) }).toEqual({ table, rows: 0 });
    }
  });

  it('M02 S2 has rows: psql apply refuses, rolls back completely and leaves the S2 row untouched', async () => {
    const clone = await freshClone();
    const tenant = await seedS4aTenant(clone.prisma);
    await insertShadowRun(clone.prisma, tenant);
    const before = await catalogSnapshot(clone.prisma);
    const result = await clone.applyWithPsql();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('S4A migration requires empty S2 tables');
    expect(await catalogSnapshot(clone.prisma)).toEqual(before);
  });

  it('M02b S2 has rows: prisma migrate deploy refuses and records a failed migration without objects', async () => {
    const clone = await freshClone();
    const tenant = await seedS4aTenant(clone.prisma);
    await insertShadowRun(clone.prisma, tenant);
    const before = await catalogSnapshot(clone.prisma);
    const result = await clone.applyWithPrisma();
    expect(result.code).not.toBe(0);
    // Prisma reports the statement after the RAISE (the explicit transaction is already aborted).
    expect(result.output).toContain(`Applying migration \`${MIGRATION_NAME}\``);
    expect(result.output).toMatch(/S4A migration requires empty S2 tables|current transaction is aborted/);
    expect(await s4TablesPresent(clone.prisma)).toEqual([]);
    const after = await catalogSnapshot(clone.prisma);
    const { _prisma_migrations: _b, ...beforeTables } = before.tables;
    const { _prisma_migrations: _a, ...afterTables } = after.tables;
    expect({ ...after, tables: afterTables }).toEqual({ ...before, tables: beforeTables });
    const rows = await clone.prisma.$queryRaw<Array<{ finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = ${MIGRATION_NAME}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].finished_at).toBeNull();
  });

  it('M03 lock timeout: an open S2 writer makes the migration fail after lock_timeout with no partial objects', async () => {
    const clone = await freshClone();
    const holder = client(clone.name);
    const observer = client(clone.name);
    const holding = deferred();
    const release = deferred();
    const holderTx = holder.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('LOCK TABLE "di_v0_shadow_runs" IN ROW EXCLUSIVE MODE');
        holding.resolve();
        await release.promise;
      },
      { timeout: 60_000 },
    );
    await holding.promise;
    const before = await catalogSnapshot(clone.prisma);
    const migration = clone.applyWithPsql();
    try {
      await waitForLockWaiters(observer, 1);
      const result = await migration;
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(/lock timeout/);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(4_500);
      expect(result.elapsedMs).toBeLessThan(30_000);
    } finally {
      release.resolve();
      await holderTx;
    }
    expect(await catalogSnapshot(clone.prisma)).toEqual(before);
  });

  it('M04 concurrent canonical transaction: migration yields (lock timeout) and the canonical write commits', async () => {
    const clone = await freshClone();
    const tenant = await seedS4aTenant(clone.prisma);
    const holder = client(clone.name);
    const observer = client(clone.name);
    const holding = deferred();
    const release = deferred();
    const holderTx = holder.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE vehicle_trips SET distance_km = distance_km + 1 WHERE id = ${tenant.tripId}`;
        holding.resolve();
        await release.promise;
      },
      { timeout: 60_000 },
    );
    await holding.promise;
    const migration = clone.applyWithPsql();
    let result: ProcessResult;
    try {
      await waitForLockWaiters(observer, 1);
      result = await migration;
    } finally {
      release.resolve();
      await holderTx;
    }
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/lock timeout/);
    expect(await s4TablesPresent(clone.prisma)).toEqual([]);
    const [trip] = await clone.prisma.$queryRaw<Array<{ distance_km: number }>>`
      SELECT distance_km FROM vehicle_trips WHERE id = ${tenant.tripId}`;
    expect(Number(trip.distance_km)).toBe(13);
  });

  it('M05 concurrent short canonical writes all commit while the migration succeeds', async () => {
    const clone = await freshClone();
    const tenant = await seedS4aTenant(clone.prisma);
    const writer = client(clone.name);
    let done = false;
    let committed = 0;
    const errors: unknown[] = [];
    const insertTrip = async () => {
      await writer.$executeRaw`
        INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, created_at,
          start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
        VALUES (${randomUUID()}, ${tenant.vehicleId}, 'ONGOING', now(), now(), 52, 9, 0, 0, 0, 0, 100)`;
      committed += 1;
    };
    await insertTrip();
    const loop = (async () => {
      while (!done || committed < 20) {
        try {
          await insertTrip();
        } catch (error) {
          errors.push(error);
          return;
        }
      }
    })();
    const result = await clone.applyWithPsql();
    done = true;
    await loop;
    expect(errors).toEqual([]);
    expect(result.code).toBe(0);
    expect(await s4TablesPresent(clone.prisma)).toEqual(S4_TABLES);
    const [{ n }] = await clone.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM vehicle_trips WHERE vehicle_id = ${tenant.vehicleId} AND trip_status = 'ONGOING'`;
    expect(Number(n)).toBe(committed);
  });

  it('M06 no canonical row rewrite, no table rewrite, no canonical trigger/index/constraint, no side effect', async () => {
    const clone = await freshClone();
    await seedS4aTenant(clone.prisma);
    await seedS4aTenant(clone.prisma);
    const before = await catalogSnapshot(clone.prisma);
    const result = await clone.applyWithPsql();
    expect(result.code).toBe(0);
    const after = await catalogSnapshot(clone.prisma);

    for (const [table, state] of Object.entries(before.tables)) {
      expect({ table, state: after.tables[table] }).toEqual({ table, state });
    }
    expect(Object.keys(after.tables).filter((t) => !(t in before.tables)).sort()).toEqual(S4_TABLES);

    const onlyNew = (entries: string[]) =>
      entries.every((e) => S4_TABLES.some((t) => e.startsWith(`${t}.`)) || S2_TABLES.some((t) => e.startsWith(`${t}.`)));
    const triggers = diff(before.triggers, after.triggers);
    expect(triggers.removed).toEqual([]);
    expect(onlyNew(triggers.added)).toBe(true);
    expect(triggers.added.filter((t) => S2_TABLES.some((s) => t.startsWith(`${s}.`))).sort()).toEqual([
      'di_v0_shadow_intervals.di_v0_shadow_interval_scope_guard_trg',
      'di_v0_shadow_runs.di_v0_shadow_run_scope_guard_trg',
    ]);
    const indexes = diff(before.indexes, after.indexes);
    expect(indexes.removed).toEqual([]);
    expect(onlyNew(indexes.added)).toBe(true);
    expect(indexes.added.filter((i) => S2_TABLES.some((s) => i.startsWith(`${s}.`)))).toEqual([
      'di_v0_shadow_runs.di_v0_shadow_runs_id_scope_uq',
    ]);
    const constraints = diff(before.constraints, after.constraints);
    expect(constraints.removed).toEqual([]);
    expect(onlyNew(constraints.added)).toBe(true);
    expect(diff(before.functions, after.functions)).toEqual({
      added: [
        'di_v0_s4_evidence_snapshot_immutable_guard',
        'di_v0_s4_evidence_snapshot_scope_guard',
        'di_v0_s4_pipeline_version_guard',
        'di_v0_s4_work_item_immutable_guard',
        'di_v0_s4_work_item_scope_guard',
        'di_v0_shadow_interval_scope_guard',
        'di_v0_shadow_run_scope_guard',
      ],
      removed: [],
    });
    for (const table of S4_TABLES) {
      const [{ n }] = await clone.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      expect({ table, rows: Number(n) }).toEqual({ table, rows: 0 });
    }
  });

  it('M07 tenancy triggers reject cross-tenant rows on S4 and S2 tables', async () => {
    const clone = await freshClone();
    expect((await clone.applyWithPsql()).code).toBe(0);
    const a = await seedS4aTenant(clone.prisma);
    const b = await seedS4aTenant(clone.prisma);
    const scopeError = async (sql: Promise<unknown>) => {
      try {
        await sql;
        return 'NO_ERROR';
      } catch (error) {
        return /scope mismatch/.test(String(error)) ? 'SCOPE_MISMATCH' : 'OTHER_ERROR';
      }
    };
    const insertScoped = (table: string, org: string, vehicle: string, trip: string) =>
      clone.prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" (id, organization_id, vehicle_id, trip_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        org,
        vehicle,
        trip,
      );
    for (const table of ['di_v0_s4_work_items', 'di_v0_s4_evidence_snapshots']) {
      expect({ table, r: await scopeError(insertScoped(table, a.organizationId, a.vehicleId, b.tripId)) }).toEqual({ table, r: 'SCOPE_MISMATCH' });
      expect({ table, r: await scopeError(insertScoped(table, b.organizationId, a.vehicleId, a.tripId)) }).toEqual({ table, r: 'SCOPE_MISMATCH' });
      expect({ table, r: await scopeError(insertScoped(table, a.organizationId, a.vehicleId, a.tripId)) }).toEqual({ table, r: 'OTHER_ERROR' });
    }
    expect(await scopeError(insertShadowRun(clone.prisma, a, b.organizationId))).toBe('SCOPE_MISMATCH');
    const runId = await insertShadowRun(clone.prisma, a);
    expect(
      await scopeError(
        clone.prisma.$executeRaw`
          INSERT INTO di_v0_shadow_intervals (id, shadow_run_id, organization_id, vehicle_id, trip_id)
          VALUES (${randomUUID()}, ${runId}, ${b.organizationId}, ${a.vehicleId}, ${a.tripId})`,
      ),
    ).toBe('SCOPE_MISMATCH');
    expect(
      await scopeError(clone.prisma.$executeRaw`UPDATE di_v0_shadow_runs SET organization_id = ${b.organizationId} WHERE id = ${runId}`),
    ).toBe('SCOPE_MISMATCH');
  });

  it('M08 rerun: a second psql apply fails without changing anything; prisma deploy applies once then is a no-op', async () => {
    const clone = await freshClone();
    expect((await clone.applyWithPsql()).code).toBe(0);
    const before = await catalogSnapshot(clone.prisma);
    const rerun = await clone.applyWithPsql();
    expect(rerun.code).not.toBe(0);
    expect(rerun.output).toMatch(/already exists/);
    expect(await catalogSnapshot(clone.prisma)).toEqual(before);

    const viaPrisma = await freshClone();
    const first = await viaPrisma.applyWithPrisma();
    expect(first.code).toBe(0);
    expect(first.output).toContain(MIGRATION_NAME);
    expect(await s4TablesPresent(viaPrisma.prisma)).toEqual(S4_TABLES);
    const second = await viaPrisma.applyWithPrisma();
    expect(second.code).toBe(0);
    expect(second.output).toContain('No pending migrations to apply');
  });
});

(LIVE ? describe : describe.skip)('DI V0 S4B follow-up migration (boundary_occurrence + execution V2)', () => {
  jest.setTimeout(180_000);
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DI_V0_S4A_PG_ADMIN_URL } } });
  const clones: Clone[] = [];

  async function freshClone(): Promise<Clone> {
    const name = `${process.env.DI_V0_S4A_PG_TEMPLATE_DB}_s4b_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${process.env.DI_V0_S4A_PG_TEMPLATE_DB}"`);
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl(name, true) } } });
    const clone: Clone = {
      name,
      prisma,
      applyWithPsql: (file = MIGRATION_FILE) => run('psql', [dbUrl(name, false), '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]),
      applyWithPrisma: () => run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: dbUrl(name, true) }),
    };
    clones.push(clone);
    return clone;
  }

  async function applyS4a(clone: Clone): Promise<void> {
    const result = await clone.applyWithPsql(MIGRATION_FILE);
    expect(result.code).toBe(0);
  }

  async function applyS4b(clone: Clone): Promise<ProcessResult> {
    return clone.applyWithPsql(S4B_MIGRATION_FILE);
  }

  afterAll(async () => {
    for (const clone of clones) {
      await clone.prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${clone.name}" WITH (FORCE)`);
    }
    await admin.$disconnect();
  });

  it('S4B-M01 current S4A schema then follow-up migration succeeds on empty S4/S2', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    const result = await applyS4b(clone);
    expect(result.code).toBe(0);
    const cols = await clone.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'di_v0_s4_work_items' AND column_name = 'boundary_occurrence'`;
    expect(cols).toHaveLength(1);
  });

  it('S4B-M02 non-empty S4 work items refuse follow-up migration', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    const tenant = await seedS4aTenant(clone.prisma);
    await clone.prisma.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES ('DI_V0_S4_PIPELINE_V1:sha256:' || repeat('a', 64), '{}'::jsonb, 'ACTIVE')`;
    await clone.prisma.$executeRaw`
      INSERT INTO di_v0_s4_work_items (id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, pipeline_version_key, pipeline_version_manifest, status, next_attempt_at, settlement_anchor_at, eligible_at)
      VALUES (gen_random_uuid()::text, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'RUPTELA_R1', 'PRIMARY', 'PRIMARY',
        'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('b', 64),
        'DI_V0_S4_PIPELINE_V1:sha256:' || repeat('a', 64), '{}'::jsonb, 'PENDING', now(), now(), now() + interval '24 hours')`;
    const result = await applyS4b(clone);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/requires empty S4 work items/);
  });

  it('S4B-M03 non-empty S2 refuses follow-up migration', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    const tenant = await seedS4aTenant(clone.prisma);
    await insertShadowRun(clone.prisma, tenant);
    const result = await applyS4b(clone);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/requires empty/);
  });

  it('S4B-M04 logical unique index includes boundary_occurrence', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const rows = await clone.prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'di_v0_s4_wi_logical_key_uq'`;
    expect(rows[0]?.indexdef).toContain('boundary_occurrence');
  });

  it('S4B-M05 old-runtime compatibility: nullable execution_identity still allows V1 pattern', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const tenant = await seedS4aTenant(clone.prisma);
    await clone.prisma.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES ('DI_V0_S4_PIPELINE_V1:sha256:' || repeat('c', 64), '{}'::jsonb, 'ACTIVE')`;
    await expect(
      clone.prisma.$executeRaw`
        INSERT INTO di_v0_s4_work_items (id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, next_attempt_at,
          settlement_anchor_at, eligible_at, execution_identity)
        VALUES (gen_random_uuid()::text, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'RUPTELA_R1', 'PRIMARY', 'PRIMARY',
          'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('d', 64), 0,
          'DI_V0_S4_PIPELINE_V1:sha256:' || repeat('c', 64), '{}'::jsonb, 'PENDING', now(), now(), now() + interval '24 hours',
          'DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:' || repeat('e', 64))`,
    ).resolves.toBeDefined();
  });

  it('S4B-M06 follow-up migration is wrapped in a transaction (rerun fails atomically)', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    expect((await applyS4b(clone)).code).toBe(0);
    const rerun = await applyS4b(clone);
    expect(rerun.code).not.toBe(0);
  });

  it('S4B-M07 sequence table exists for occurrence allocation', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const tables = await s4TablesPresent(clone.prisma);
    expect(tables).toContain('di_v0_s4_trip_primary_boundary_seq');
  });

  it('S4B-M08 follow-up migration creates no runtime control rows', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const [{ n }] = await clone.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM di_v0_s4_control`;
    expect(Number(n)).toBe(0);
  });

  it('S4B-M09 cross-tenant scope guard on sequence table', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const tenant = await seedS4aTenant(clone.prisma);
    const other = await seedS4aTenant(clone.prisma);
    await expect(
      clone.prisma.$executeRaw`
        INSERT INTO di_v0_s4_trip_primary_boundary_seq (organization_id, trip_id, next_boundary_occurrence)
        VALUES (${other.organizationId}, ${tenant.tripId}, 1)`,
    ).rejects.toThrow(/scope mismatch/);
  });

  it('S4B-M10 V2 execution_identity CHECK accepts V2 prefix', async () => {
    const clone = await freshClone();
    await applyS4a(clone);
    await applyS4b(clone);
    const tenant = await seedS4aTenant(clone.prisma);
    await clone.prisma.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES ('DI_V0_S4_PIPELINE_V1:sha256:' || repeat('f', 64), '{}'::jsonb, 'ACTIVE')`;
    await expect(
      clone.prisma.$executeRaw`
        INSERT INTO di_v0_s4_work_items (id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, next_attempt_at,
          settlement_anchor_at, eligible_at, execution_identity)
        VALUES (gen_random_uuid()::text, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'RUPTELA_R1', 'PRIMARY', 'PRIMARY',
          'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('g', 64), 2,
          'DI_V0_S4_PIPELINE_V1:sha256:' || repeat('f', 64), '{}'::jsonb, 'PENDING', now(), now(), now() + interval '24 hours',
          'DI_V0_S4_EXECUTION_IDENTITY_V2:sha256:' || repeat('h', 64))`,
    ).resolves.toBeDefined();
  });
});
