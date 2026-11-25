/**
 * USR_P0: validate production inventory SQL against migrated disposable PostgreSQL.
 * USR_P0_INVENTORY_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> npm test -- usr-p0-production-inventory-sql
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { assertUsrP0DisposablePostgresPreflight } from './usr-p0-disposable-postgres-preflight';

const OPT_IN = 'USR_P0_INVENTORY_PG';

/** Must match SELECT statements in USR_P0_PRODUCTION_INVENTORY.sql (excl. BEGIN/ROLLBACK). */
export const USR_P0_INVENTORY_EXPECTED_SELECT_COUNT = 19;

function loadSqlStatements(): string[] {
  const sqlPath = path.join(
    __dirname,
    '../../../../../architecture/users-and-invites/evidence/USR_P0_PRODUCTION_INVENTORY.sql',
  );
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^BEGIN/i.test(s) && !/^ROLLBACK/i.test(s));
}

describe('USR_P0 production inventory SQL (disposable PG)', () => {
  const run = process.env[OPT_IN] === '1';
  let prisma: PrismaClient | undefined;

  afterEach(async () => {
    if (prisma) {
      await prisma.$disconnect();
      prisma = undefined;
    }
  });

  (run ? it : it.skip)(
    'executes aggregate SELECTs in one READ ONLY Prisma transaction',
    async () => {
      assertUsrP0DisposablePostgresPreflight();
      const statements = loadSqlStatements();
      expect(statements.length).toBe(USR_P0_INVENTORY_EXPECTED_SELECT_COUNT);

      prisma = new PrismaClient();
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          const ro = await tx.$queryRaw<{ transaction_read_only: string | boolean }[]>`
            SHOW transaction_read_only
          `;
          const roVal = ro[0]?.transaction_read_only;
          expect(roVal === true || roVal === 'on' || roVal === 'true').toBe(true);

          for (const stmt of statements) {
            const rows = await tx.$queryRawUnsafe(stmt);
            expect(rows).toBeDefined();
          }
        },
        { timeout: 120_000 },
      );
    },
    120_000,
  );

  (run ? it : it.skip)(
    'duplicate-email aggregates are internally consistent on empty/minimal schema',
    async () => {
      assertUsrP0DisposablePostgresPreflight();
      prisma = new PrismaClient();
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          const groups = await tx.$queryRawUnsafe<{ duplicate_email_identity_groups: bigint }[]>(`
            SELECT COUNT(*) AS duplicate_email_identity_groups
            FROM (
              SELECT LOWER(TRIM(email)) AS norm
              FROM users
              WHERE email IS NOT NULL AND TRIM(email) <> ''
              GROUP BY LOWER(TRIM(email))
              HAVING COUNT(*) > 1
            ) dup_groups
          `);
          const excess = await tx.$queryRawUnsafe<{ excess_duplicate_identity_rows: bigint }[]>(`
            SELECT COALESCE(SUM(cnt - 1), 0)::bigint AS excess_duplicate_identity_rows
            FROM (
              SELECT COUNT(*) AS cnt
              FROM users
              WHERE email IS NOT NULL AND TRIM(email) <> ''
              GROUP BY LOWER(TRIM(email))
              HAVING COUNT(*) > 1
            ) dup
          `);
          const g = Number(groups[0]?.duplicate_email_identity_groups ?? 0);
          const e = Number(excess[0]?.excess_duplicate_identity_rows ?? 0);
          expect(e).toBeGreaterThanOrEqual(0);
          if (g === 0) expect(e).toBe(0);
          if (g > 0) expect(e).toBeGreaterThanOrEqual(g);
        },
        { timeout: 60_000 },
      );
    },
    60_000,
  );
});