/**
 * Backfill canonical money fields on dashboard_insights.metrics JSON.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/backfill-evaluations-insight-money-metrics.ts
 *   ... --org=<uuid>          # optional scope
 *   ... --apply               # mutate (default is dry-run)
 *   ... --strip-legacy        # remove lostRevenueEur / financialImpactCents / dailyRateEur after migrate
 *
 * Rollback: re-run detectors or restore dashboard_insights.metrics from DB backup taken before --apply.
 * Legacy fields are retained unless --strip-legacy is passed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { migrateInsightMetricsMoneyFields } from '@synq/money/money-insight-metrics';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArgs() {
  const orgId =
    process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ||
    process.env.ORG_ID ||
    null;
  const apply = process.argv.includes('--apply');
  const stripLegacy = process.argv.includes('--strip-legacy');
  return { orgId, apply, stripLegacy };
}

async function main() {
  const { orgId, apply, stripLegacy } = parseArgs();
  const prisma = new PrismaClient();

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let ambiguous = 0;

  try {
    const rows = await prisma.dashboardInsight.findMany({
      where: orgId ? { organizationId: orgId } : undefined,
      select: { id: true, organizationId: true, type: true, metrics: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const row of rows) {
      scanned += 1;
      const result = migrateInsightMetricsMoneyFields(row.metrics, {
        defaultCurrency: 'EUR',
        stripLegacy,
      });

      if (result.issues.length > 0) {
        ambiguous += 1;
        console.warn(
          `[ambiguous] insight=${row.id} org=${row.organizationId} type=${row.type} issues=${result.issues
            .map((i) => i.code)
            .join(',')}`,
        );
        for (const issue of result.issues) {
          console.warn(`  - ${issue.field}: ${issue.message}`);
        }
      }

      if (!result.changed) {
        skipped += 1;
        continue;
      }

      migrated += 1;
      console.log(
        `[migrate] insight=${row.id} org=${row.organizationId} type=${row.type} apply=${apply}`,
      );

      if (apply) {
        await prisma.dashboardInsight.update({
          where: { id: row.id },
          data: { metrics: result.metrics as Prisma.InputJsonValue },
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          orgId,
          stripLegacy,
          scanned,
          migrated,
          skipped,
          ambiguous,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
