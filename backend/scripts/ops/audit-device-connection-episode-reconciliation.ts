/**
 * Read-only device connection episode reconciliation audit.
 *
 * NEVER mutates episodes, events, or production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts --fixtures-only
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts --write
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts --vehicle-id=<uuid>
 *
 * Options:
 *   --fixtures-only   Use anonymized fixtures only (no DATABASE_URL required)
 *   --write           Write docs/audits/* outputs (fixture mode only for committed artifacts)
 *   --format=console|json|markdown|csv
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { buildFixtureReconciliationReport } from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation.fixtures';
import { DeviceConnectionEpisodeReconciliationService } from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import {
  renderReconciliationCsv,
  renderReconciliationMarkdown,
} from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation.report';

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

function parseFormat(): 'json' | 'markdown' | 'csv' | 'console' {
  const raw = parseArg('--format') ?? 'console';
  if (raw === 'json' || raw === 'markdown' || raw === 'csv' || raw === 'console') {
    return raw;
  }
  throw new Error(`Unsupported --format=${raw}`);
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_MD = path.join(
  REPO_ROOT,
  'docs/audits/device-connection-episode-reconciliation-2026-07.md',
);
const DEFAULT_CSV = path.join(
  REPO_ROOT,
  'docs/audits/data/device-connection-episode-reconciliation-2026-07.csv',
);

async function main() {
  const fixturesOnly = process.argv.includes('--fixtures-only');
  const writeOutputs = process.argv.includes('--write');
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const vehicleId = parseArg('--vehicle-id');
  const format = parseFormat();

  let report;
  if (fixturesOnly) {
    report = buildFixtureReconciliationReport();
  } else {
    const appModule = await AppModule.forRootAsync();
    const app = await NestFactory.createApplicationContext(appModule, {
      logger: ['error', 'warn'],
    });
    try {
      const audit = app.get(DeviceConnectionEpisodeReconciliationService);
      report = await audit.runReadOnlyAudit({ organizationId, vehicleId });
    } finally {
      await app.close();
    }
  }

  const markdown = renderReconciliationMarkdown(report);
  const csv = renderReconciliationCsv(report.candidates);
  const json = JSON.stringify(report, null, 2);

  if (writeOutputs) {
    if (!fixturesOnly) {
      throw new Error('--write is only allowed with --fixtures-only to avoid committing production data');
    }
    fs.mkdirSync(path.dirname(DEFAULT_MD), { recursive: true });
    fs.mkdirSync(path.dirname(DEFAULT_CSV), { recursive: true });
    fs.writeFileSync(DEFAULT_MD, markdown, 'utf8');
    fs.writeFileSync(DEFAULT_CSV, csv, 'utf8');
    console.log(`Wrote ${DEFAULT_MD}`);
    console.log(`Wrote ${DEFAULT_CSV}`);
  }

  switch (format) {
    case 'json':
      console.log(json);
      break;
    case 'markdown':
      console.log(markdown);
      break;
    case 'csv':
      console.log(csv);
      break;
    default:
      console.log(
        `Device connection episode reconciliation — READ ONLY — ${report.summary.totalCandidates} candidate(s)`,
      );
      console.log(
        `applyEligible=${report.summary.applyEligibleCount} reviewRequired=${report.summary.reviewRequiredCount}`,
      );
      for (const candidate of report.candidates) {
        console.log(
          `${candidate.anonymizedVehicleId} ${candidate.classification} confidence=${candidate.confidence} apply=${candidate.applyEligible ? 'yes' : 'no'}`,
        );
      }
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
