/**
 * USR_P0: validate production inventory SQL against migrated disposable PostgreSQL.
 * USR_P0_INVENTORY_PG=1 DATABASE_URL=postgresql://... npm test -- usr-p0-production-inventory-sql
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const OPT_IN = 'USR_P0_INVENTORY_PG';

function assertDisposablePreflight(): void {
  if (process.env[OPT_IN] !== '1') {
    throw new Error(`${OPT_IN}=1 is required`);
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(`${OPT_IN}=1 requires DATABASE_URL`);
  }
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!/test|disposable|ci|local|dev|seal|_pg$/i.test(dbName)) {
    throw new Error(`DATABASE_URL database "${dbName}" does not look disposable`);
  }
}

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

  (run ? it : it.skip)(
    'executes all aggregate SELECTs inside READ ONLY transaction',
    async () => {
      assertDisposablePreflight();
      const prisma = new PrismaClient();
      const statements = loadSqlStatements();
      expect(statements.length).toBeGreaterThan(10);
      await prisma.$executeRawUnsafe('BEGIN READ ONLY');
      try {
        for (const stmt of statements) {
          const rows = await prisma.$queryRawUnsafe(stmt);
          expect(rows).toBeDefined();
        }
      } finally {
        await prisma.$executeRawUnsafe('ROLLBACK');
      }
      await prisma.$disconnect();
    },
    120_000,
  );
});