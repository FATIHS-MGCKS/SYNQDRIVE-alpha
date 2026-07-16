/**
 * Read-only vehicle / booking / handover data diagnostic.
 *
 * NEVER run against production. Only use with an explicitly configured local/test DATABASE_URL.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --vehicle-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --license-plate=KS-FS-123
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --format=markdown
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --output=./tmp/vbh-audit.json
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --output=./tmp/vbh-audit.md --format=markdown
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --limit=10 --include-findings
 *
 * Environment:
 *   ORG_ID=<uuid>                                              alias for --organization-id
 *   VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_REMOTE=1           allow non-local DATABASE_URL (still blocks prod patterns)
 *   VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD=1             override production block (strongly discouraged)
 *
 * Exit codes:
 *   0 — completed successfully (findings do not affect exit code)
 *   1 — runtime / configuration error
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  renderVbhDiagnosticConsole,
  renderVbhDiagnosticMarkdown,
} from '../../src/modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic-markdown.util';
import { VehicleBookingHandoverDiagnosticService } from '../../src/modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.service';
import { assertSafeVbhDiagnosticDatabaseTarget } from '../../src/modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.safety.util';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parseFormat(): 'json' | 'markdown' | 'console' {
  const raw = parseArg('--format') ?? 'json';
  if (raw === 'json' || raw === 'markdown' || raw === 'console') return raw;
  throw new Error(`Unsupported --format=${raw} (use json, markdown, or console)`);
}

async function main() {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const vehicleId = parseArg('--vehicle-id');
  const licensePlate = parseArg('--license-plate');
  const limitRaw = parseArg('--limit');
  const sampleLimit = limitRaw ? Number(limitRaw) : undefined;
  if (sampleLimit != null && (!Number.isFinite(sampleLimit) || sampleLimit < 1)) {
    throw new Error('--limit must be a positive number');
  }
  const outputPath = parseArg('--output');
  const format = parseFormat();
  const includeFindings = process.argv.includes('--include-findings');
  const allowRemote = process.argv.includes('--allow-remote-db');

  assertSafeVbhDiagnosticDatabaseTarget({ allowRemote });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const diagnostic = app.get(VehicleBookingHandoverDiagnosticService);
    const report = await diagnostic.runDiagnostic({
      organizationId,
      vehicleId,
      licensePlate,
      sampleLimit,
      includeFindings,
    });

    const json = JSON.stringify(report, null, 2);
    const markdown = renderVbhDiagnosticMarkdown(report);
    const consoleReport = renderVbhDiagnosticConsole(report);

    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (abs.endsWith('.md')) {
        fs.writeFileSync(abs, markdown, 'utf8');
      } else {
        fs.writeFileSync(abs, json, 'utf8');
      }
      console.log(`Wrote report to ${abs}`);
    }

    if (format === 'json') {
      console.log(json);
    } else if (format === 'markdown') {
      console.log(markdown);
    } else {
      console.log(consoleReport);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
