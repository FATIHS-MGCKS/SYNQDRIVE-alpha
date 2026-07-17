/**
 * Read-only Battery Health V2 shadow validation report.
 *
 * NEVER enables publication or readiness. Produces internal evaluation only.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts --observation-days=35
 *   npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts --format=markdown --output=./tmp/shadow-report.md
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BatteryShadowValidationService } from '../../src/modules/vehicle-intelligence/battery-health/shadow-validation/battery-shadow-validation.service';
import {
  renderBatteryShadowValidationConsole,
  renderBatteryShadowValidationMarkdown,
} from '../../src/modules/vehicle-intelligence/battery-health/shadow-validation/battery-shadow-validation-report.util';
import { assertSafeBatteryDiagnosticDatabaseTarget } from '../../src/modules/vehicle-intelligence/battery-health/diagnostic/battery-data-diagnostic.safety.util';

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
  throw new Error(`Unsupported --format=${raw}`);
}

async function main() {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const vehicleId = parseArg('--vehicle-id');
  const observationDaysRaw = parseArg('--observation-days');
  const observationDays = observationDaysRaw ? Number(observationDaysRaw) : undefined;
  const from = parseArg('--from');
  const to = parseArg('--to');
  const outputPath = parseArg('--output');
  const format = parseFormat();
  const allowRemote = process.argv.includes('--allow-remote-db');

  if (observationDays != null && (!Number.isFinite(observationDays) || observationDays < 1)) {
    throw new Error('--observation-days must be a positive number');
  }

  assertSafeBatteryDiagnosticDatabaseTarget({ allowRemote });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(BatteryShadowValidationService);
    const report = await service.runReport({
      organizationId,
      vehicleId,
      observationDays,
      observationStartAt: from ? new Date(from) : undefined,
      referenceNow: to ? new Date(to) : new Date(),
      vehicleSampleLimit: Number(parseArg('--vehicle-sample-limit') ?? 10),
    });

    const json = JSON.stringify(report, null, 2);
    const markdown = renderBatteryShadowValidationMarkdown(report);
    const consoleReport = renderBatteryShadowValidationConsole(report);

    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (abs.endsWith('.md')) {
        fs.writeFileSync(abs, markdown, 'utf8');
      } else {
        fs.writeFileSync(abs, json, 'utf8');
      }
      console.log(`Wrote shadow validation report to ${abs}`);
    } else if (format === 'markdown') {
      console.log(markdown);
    } else if (format === 'console') {
      console.log(consoleReport);
    } else {
      console.log(json);
    }

    console.error(
      `\nRecommendation: ${report.overallRecommendation} — publication/readiness remain blocked by design.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
