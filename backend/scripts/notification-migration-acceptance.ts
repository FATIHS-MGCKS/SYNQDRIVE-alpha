/**
 * Post-migration database acceptance checks.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts --org <uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts --org <uuid> --out /tmp/acceptance.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NotificationMigrationCliModule } from '../src/modules/notifications/migration/notification-migration-cli.module';
import { NotificationMigrationAcceptanceService } from '../src/modules/notifications/migration/notification-migration-acceptance.service';
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
    const acceptance = app.get(NotificationMigrationAcceptanceService);
    const report = await acceptance.run(orgId);

    writeMigrationJsonReport(report, outPath, 'acceptance');

    const failed = report.checks.filter((c) => !c.passed && c.severity !== 'info');
    console.error(
      `[acceptance] ${report.passed ? 'PASSED' : 'FAILED'} — ${failed.length} failing checks`,
    );

    process.exit(report.passed ? 0 : 1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[acceptance] Failed:', err);
  process.exit(1);
});
