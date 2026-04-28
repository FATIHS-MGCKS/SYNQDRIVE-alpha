/**
 * One-shot migration helper for 20260417200000_add_service_overdue_insight_type.
 *
 * Why: prisma migrate deploy is blocked by an older migration that uses
 * CREATE INDEX CONCURRENTLY inside a transaction, which Postgres rejects.
 * Until that older migration is fixed/squashed, we apply the enum change
 * directly and mark the migration row so `prisma migrate status` stays
 * consistent with schema.prisma.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/apply-service-overdue-enum.ts
 *
 * Idempotent: safe to re-run. Uses ADD VALUE IF NOT EXISTS and upserts the
 * migrations row.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const MIGRATION_NAME = '20260417200000_add_service_overdue_insight_type';
const MIGRATION_SQL =
  "ALTER TYPE \"InsightType\" ADD VALUE IF NOT EXISTS 'SERVICE_OVERDUE';";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`[apply-enum] Applying enum value SERVICE_OVERDUE...`);
    await prisma.$executeRawUnsafe(MIGRATION_SQL);
    console.log(`[apply-enum] ALTER TYPE successful.`);

    const checksum = createHash('sha256').update(MIGRATION_SQL).digest('hex');
    const now = new Date();

    const existing = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string }>
    >(
      `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1;`,
      MIGRATION_NAME,
    );

    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid(), $1, $2, $3, NULL, NULL, $2, 1);`,
        checksum,
        now,
        MIGRATION_NAME,
      );
      console.log(
        `[apply-enum] Marked ${MIGRATION_NAME} as applied in _prisma_migrations.`,
      );
    } else {
      console.log(
        `[apply-enum] Migration ${MIGRATION_NAME} already present in _prisma_migrations — skipped.`,
      );
    }

    const values = await prisma.$queryRawUnsafe<
      Array<{ enumlabel: string }>
    >(
      `SELECT e.enumlabel FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'InsightType'
        ORDER BY e.enumsortorder;`,
    );
    console.log(
      `[apply-enum] Current InsightType values: ${values
        .map((v) => v.enumlabel)
        .join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[apply-enum] Failed:', err);
  process.exit(1);
});
