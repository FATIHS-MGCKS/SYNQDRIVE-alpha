/**
 * Dry-run analysis of legacy notification sources before V2 backfill.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts --org <uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts --org <uuid> --out /tmp/report.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NotificationMigrationCliModule } from '../src/modules/notifications/migration/notification-migration-cli.module';
import { NotificationMigrationAnalysisService } from '../src/modules/notifications/migration/notification-migration-analysis.service';
import { NotificationArchitectureAuditService } from '../src/modules/notifications/migration/notification-architecture-audit.service';
import {
  parseMigrationCliArgs,
  writeMigrationJsonReport,
} from '../src/modules/notifications/migration/notification-migration-cli.util';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const { orgId, outPath } = parseMigrationCliArgs();

  const app = await NestFactory.createApplicationContext(NotificationMigrationCliModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const analysis = app.get(NotificationMigrationAnalysisService);
    const architecture = app.get(NotificationArchitectureAuditService);

    const [report, audit] = await Promise.all([
      analysis.analyze({ organizationId: orgId, mode: 'dry_run' }),
      Promise.resolve(architecture.audit(path.resolve(__dirname, '..', '..'))),
    ]);

    const payload = {
      schemaVersion: '1.0' as const,
      generatedAt: new Date().toISOString(),
      organizationId: orgId ?? null,
      report,
      architectureAudit: audit,
    };

    writeMigrationJsonReport(payload, outPath, 'dry-run');

    console.error(
      `[dry-run] Summary: analyzed=${report.projected.analyzed} migrated=${report.projected.migrated} merged=${report.projected.merged} skipped=${report.projected.skipped} unresolved=${report.projected.unresolved}`,
    );
    process.exit(audit.passed ? 0 : 1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[dry-run] Failed:', err);
  process.exit(1);
});
