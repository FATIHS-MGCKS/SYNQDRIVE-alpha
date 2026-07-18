/**
 * Read-only Stations V2 data diagnostic.
 *
 * NEVER run against production without explicit override. Use a local/test DATABASE_URL.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run --format=markdown
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run --output=./tmp/stations-v2-diagnose.json
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run --include-findings --limit=10
 *
 * Environment:
 *   ORG_ID=<uuid>                                    alias for --organization-id
 *   STATIONS_V2_DIAGNOSTIC_ALLOW_REMOTE=1            allow non-local DATABASE_URL (still blocks prod patterns)
 *   STATIONS_V2_DIAGNOSTIC_ALLOW_PROD=1              override production block (strongly discouraged)
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — runtime / configuration error
 *   2 — error-severity findings present (informational; report still written)
 *
 * Runbook: docs/runbooks/stations-v2-data-remediation.md
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  renderStationsV2DiagnosticConsole,
  renderStationsV2DiagnosticMarkdown,
} from '../../src/modules/stations/diagnostic/stations-v2-diagnostic-markdown.util';
import { StationsV2DiagnosticService } from '../../src/modules/stations/diagnostic/stations-v2-diagnostic.service';
import {
  assertSafeStationsV2DiagnosticDatabaseTarget,
  assertStationsV2DiagnosticDryRun,
} from '../../src/modules/stations/diagnostic/stations-v2-diagnostic.safety.util';

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
  assertStationsV2DiagnosticDryRun();

  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const limitRaw = parseArg('--limit');
  const sampleLimit = limitRaw ? Number(limitRaw) : undefined;
  if (sampleLimit != null && (!Number.isFinite(sampleLimit) || sampleLimit < 1)) {
    throw new Error('--limit must be a positive number');
  }
  const lookaheadRaw = parseArg('--booking-lookahead-days');
  const bookingLookaheadDays = lookaheadRaw ? Number(lookaheadRaw) : undefined;
  if (
    bookingLookaheadDays != null &&
    (!Number.isFinite(bookingLookaheadDays) || bookingLookaheadDays < 1)
  ) {
    throw new Error('--booking-lookahead-days must be a positive number');
  }
  const outputPath = parseArg('--output');
  const format = parseFormat();
  const includeFindings = process.argv.includes('--include-findings');
  const allowRemote = process.argv.includes('--allow-remote-db');

  assertSafeStationsV2DiagnosticDatabaseTarget({ allowRemote });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const diagnostic = app.get(StationsV2DiagnosticService);
    const report = await diagnostic.runDiagnostic({
      organizationId,
      sampleLimit,
      includeFindings,
      bookingLookaheadDays,
    });

    const json = JSON.stringify(report, null, 2);
    const markdown = renderStationsV2DiagnosticMarkdown(report);
    const consoleReport = renderStationsV2DiagnosticConsole(report);

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

    if (report.summary.errors > 0) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
