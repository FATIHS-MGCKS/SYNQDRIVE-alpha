/**
 * Post-migration database acceptance checks.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts --org <uuid>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NotificationMigrationAcceptanceService } from '../src/modules/notifications/migration/notification-migration-acceptance.service';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const orgId = argValue('--org');
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const acceptance = app.get(NotificationMigrationAcceptanceService);
    const report = await acceptance.run(orgId);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[acceptance] Failed:', err);
  process.exit(1);
});
